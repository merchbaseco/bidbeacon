import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { and, eq } from 'drizzle-orm';
import { campaign, entityChangeHistory } from '@/db/schema';
import { getAdvertiserAccountMetadata } from '@/utils/advertiser-account-metadata';
import { getTimezoneForCountry } from '@/utils/timezones';
import { createAd, createAdGroup } from './ad-mutations';
import type { CanonicalAd, CanonicalAdGroup } from './ad-schemas';
import { resolveAdvertiserAccount } from './advertiser-accounts';
import {
    type CampaignCreateInput,
    type CampaignUpdateChanges,
    type CanonicalCampaign,
    campaignCreateInputSchema,
    campaignStateSchema,
    campaignUpdateInputSchema,
    canonicalCampaignSchema,
} from './campaign-schemas';
import { type CompositeCampaignCreateInput, type CompositeCampaignCreationResult, compositeCampaignCreateInputSchema, compositeCampaignCreationResultSchema } from './composite-campaign-schemas';
import type { OperationContext } from './operation-context';
import { OperationError } from './operation-errors';
import { createAutomaticTarget, createKeywordTarget, createNegativeKeyword, createNegativeProductTarget, createProductTarget } from './target-mutations';
import type { CanonicalTarget } from './target-schemas';

const AMAZON_BID_STRATEGIES = {
    FIXED: 'MANUAL',
    DYNAMIC_DOWN_ONLY: 'SALES_DOWN_ONLY',
    DYNAMIC_UP_AND_DOWN: 'SALES_UP_AND_DOWN',
} as const;

const PUBLIC_BID_STRATEGIES = {
    AUTO_FOR_SALES: 'DYNAMIC_UP_AND_DOWN',
    LEGACY_FOR_SALES: 'DYNAMIC_DOWN_ONLY',
    MANUAL: 'FIXED',
    RULE_BASED: 'DYNAMIC_DOWN_ONLY',
    SALES_DOWN_ONLY: 'DYNAMIC_DOWN_ONLY',
    SALES_UP_AND_DOWN: 'DYNAMIC_UP_AND_DOWN',
} as const;

const AMAZON_PLACEMENT_KEYS = {
    amazonBusiness: 'AMAZON_BUSINESS',
    productPages: 'PRODUCT_PAGE',
    restOfSearch: 'REST_OF_SEARCH',
    topOfSearch: 'TOP_OF_SEARCH',
} as const;

const PUBLIC_PLACEMENT_KEYS = {
    AMAZON_BUSINESS: 'amazonBusiness',
    PLACEMENT_AMAZON_BUSINESS: 'amazonBusiness',
    PLACEMENT_PRODUCT_PAGE: 'productPages',
    PLACEMENT_REST_OF_SEARCH: 'restOfSearch',
    PLACEMENT_TOP: 'topOfSearch',
    PLACEMENT_TOP_OF_SEARCH: 'topOfSearch',
    PRODUCT_PAGE: 'productPages',
    REST_OF_SEARCH: 'restOfSearch',
    TOP_OF_SEARCH: 'topOfSearch',
    placementAmazonBusiness: 'amazonBusiness',
    placementProductPage: 'productPages',
    placementRestOfSearch: 'restOfSearch',
    placementTop: 'topOfSearch',
} as const;

type AmazonRecord = Record<string, unknown>;
type CampaignArchiveRow = typeof campaign.$inferSelect;
type ResolvedAccount = Awaited<ReturnType<typeof resolveAdvertiserAccount>>;
type CampaignResponse = {
    success?: AmazonRecord[];
    error?: AmazonRecord[];
};
type CampaignHistoryChange = {
    eventType: 'bid_change' | 'budget_change' | 'state_change';
    fieldName: string;
    previousValue: string | number | null | undefined;
    newValue: string | number | null | undefined;
};
type CampaignCreationOptions = {
    autoCreateTargets?: boolean;
};

const AMAZON_UNAVAILABLE_MESSAGE_REGEX = /network|unavailable|timeout|timed out|fetch failed|econn|enet|eai_again/i;
const AMAZON_STATUS_CODE_REGEX = /\b(408|409|429|500|502|503|504)\b/;
const CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const COMPACT_CALENDAR_DATE_REGEX = /^\d{8}$/;
const COMPOSITE_AUTO_TARGETS = [
    { key: 'closeMatch', matchType: 'SEARCH_CLOSE_MATCH' },
    { key: 'looseMatch', matchType: 'SEARCH_LOOSE_MATCH' },
    { key: 'substitutes', matchType: 'PRODUCT_SUBSTITUTES' },
    { key: 'complements', matchType: 'PRODUCT_COMPLEMENTS' },
] as const;

export const createCampaign = async (context: OperationContext, input: unknown): Promise<CanonicalCampaign> => createCampaignWithOptions(context, input);

export const updateCampaign = async (context: OperationContext, input: unknown): Promise<CanonicalCampaign> => {
    const parsedInput = parseCampaignInput(campaignUpdateInputSchema, input, 'update_campaign');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const [current] = await context.db
        .select()
        .from(campaign)
        .where(and(eq(campaign.campaignId, parsedInput.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode)))
        .limit(1);

    if (!current) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Campaign not found in the requested Advertiser Account.', {
            campaignId: parsedInput.campaignId,
        });
    }
    assertArchiveOnlyPatch(parsedInput.changes, 'Campaign');

    const profileId = resolveProfileId(account);
    const response =
        parsedInput.changes.state === 'ARCHIVED'
            ? await callAmazon(context, 'deleteCampaigns', {
                  profileId,
                  region: resolveApiRegion(account.countryCode),
                  campaigns: [{ campaignId: parsedInput.campaignId }],
              })
            : await callAmazon(context, 'updateCampaigns', {
                  profileId,
                  region: resolveApiRegion(account.countryCode),
                  campaigns: [buildUpdatePayload(parsedInput.campaignId, parsedInput.changes, account)],
              });
    const amazonCampaign = extractCampaign(response);
    const previous = mapArchiveFallback(current);
    const canonical = mapCanonicalCampaign({
        account,
        amazonCampaign,
        fallback: buildUpdateFallback(previous, parsedInput.changes, amazonCampaign),
    });
    const now = new Date();

    await reconcileCampaign(context, account, canonical, current, now);
    const historyChanges: CampaignHistoryChange[] = [];
    if (parsedInput.changes.state !== undefined) {
        historyChanges.push({ eventType: 'state_change', fieldName: 'state', previousValue: previous.state, newValue: canonical.state });
    }
    if (parsedInput.changes.dailyBudget !== undefined) {
        historyChanges.push({ eventType: 'budget_change', fieldName: 'budgetAmount', previousValue: previous.dailyBudget, newValue: canonical.dailyBudget });
    }
    if (parsedInput.changes.bidStrategy !== undefined) {
        historyChanges.push({ eventType: 'bid_change', fieldName: 'bidStrategy', previousValue: previous.bidStrategy, newValue: canonical.bidStrategy });
    }
    if (parsedInput.changes.placementBidAdjustments !== undefined) {
        historyChanges.push({
            eventType: 'bid_change',
            fieldName: 'placementBidAdjustments',
            previousValue: serializePlacementBidAdjustments(previous.placementBidAdjustments),
            newValue: serializePlacementBidAdjustments(canonical.placementBidAdjustments),
        });
    }
    await recordCampaignChanges(context, account, canonical.id, now, historyChanges);

    return canonical;
};

export const createSponsoredProductsCampaign = async (context: OperationContext, input: unknown): Promise<CompositeCampaignCreationResult> => {
    const parsedInput = parseCompositeInput(input);
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const startDate = parsedInput.campaign.startDate ?? formatInTimeZone(new Date(), getTimezoneForCountry(account.countryCode), 'yyyy-MM-dd');
    if (parsedInput.campaign.endDate && parsedInput.campaign.endDate < startDate) {
        throw new OperationError('INVALID_INPUT', 'create_sponsored_products_campaign input is invalid.', {
            issues: [{ path: ['campaign', 'endDate'], message: 'endDate must be on or after startDate.' }],
        });
    }
    const campaign = await createCampaignWithOptions(
        context,
        {
            accountId: parsedInput.accountId,
            name: parsedInput.campaign.name,
            state: 'PAUSED',
            dailyBudget: parsedInput.campaign.dailyBudget,
            bidStrategy: parsedInput.campaign.bidStrategy,
            targetingMode: parsedInput.targeting.mode,
            startDate,
            endDate: parsedInput.campaign.endDate ?? null,
            placementBidAdjustments: parsedInput.campaign.placementBidAdjustments,
        },
        { autoCreateTargets: false }
    );

    const created: {
        campaign: CompositeCampaignCreationResult['campaign'];
        adGroup: CompositeCampaignCreationResult['adGroup'] | undefined;
        ads: CompositeCampaignCreationResult['ads'];
        targets: CompositeCampaignCreationResult['targets'];
    } = { campaign, adGroup: undefined, ads: [], targets: [] };

    try {
        const adGroupInput = {
            accountId: parsedInput.accountId,
            campaignId: campaign.id,
            name: parsedInput.adGroup.name,
            state: 'ENABLED' as const,
            defaultBid: parsedInput.adGroup.defaultBid,
        };
        created.adGroup = await runCompositeStep('create_ad_group', adGroupInput, () => createAdGroup(context, adGroupInput));

        for (const asin of parsedInput.asins) {
            const adInput = {
                accountId: parsedInput.accountId,
                adGroupId: created.adGroup.id,
                asin,
                state: 'ENABLED' as const,
            };
            created.ads.push(await runCompositeStep('create_ad', adInput, () => createAd(context, adInput)));
        }

        if (parsedInput.targeting.mode === 'AUTO') {
            for (const automaticTarget of COMPOSITE_AUTO_TARGETS) {
                const targetInput = {
                    accountId: parsedInput.accountId,
                    adGroupId: created.adGroup.id,
                    matchType: automaticTarget.matchType,
                    bid: parsedInput.targeting.bidOverrides?.[automaticTarget.key] ?? parsedInput.adGroup.defaultBid,
                    state: 'ENABLED' as const,
                };
                created.targets.push(await runCompositeStep('create_auto_target', targetInput, () => createAutomaticTarget(context, targetInput)));
            }
        } else if (parsedInput.targeting.mode === 'MANUAL_KEYWORD') {
            for (const keyword of parsedInput.targeting.keywords) {
                const targetInput = {
                    accountId: parsedInput.accountId,
                    adGroupId: created.adGroup.id,
                    keyword: keyword.keyword,
                    matchType: keyword.matchType,
                    bid: keyword.bid,
                    state: 'ENABLED' as const,
                };
                created.targets.push(await runCompositeStep('create_keyword_target', targetInput, () => createKeywordTarget(context, targetInput)));
            }
        } else {
            for (const product of parsedInput.targeting.products) {
                const targetInput = {
                    accountId: parsedInput.accountId,
                    adGroupId: created.adGroup.id,
                    asin: product.asin,
                    bid: product.bid,
                    state: 'ENABLED' as const,
                };
                created.targets.push(await runCompositeStep('create_product_target', targetInput, () => createProductTarget(context, targetInput)));
            }
        }

        for (const keyword of parsedInput.negatives?.keywords ?? []) {
            const targetInput = {
                accountId: parsedInput.accountId,
                campaignId: campaign.id,
                adGroupId: created.adGroup.id,
                keyword: keyword.keyword,
                matchType: keyword.matchType,
                state: 'ENABLED' as const,
            };
            created.targets.push(await runCompositeStep('create_negative_keyword', targetInput, () => createNegativeKeyword(context, targetInput)));
        }

        for (const asin of parsedInput.negatives?.asins ?? []) {
            const targetInput = {
                accountId: parsedInput.accountId,
                campaignId: campaign.id,
                adGroupId: created.adGroup.id,
                asin,
                state: 'ENABLED' as const,
            };
            created.targets.push(await runCompositeStep('create_negative_product_target', targetInput, () => createNegativeProductTarget(context, targetInput)));
        }

        if (parsedInput.campaign.state === 'ENABLED') {
            const updateInput = {
                accountId: parsedInput.accountId,
                campaignId: campaign.id,
                changes: { state: 'ENABLED' as const },
            };
            created.campaign = await runCompositeStep('update_campaign', updateInput, () => updateCampaign(context, updateInput));
        }

        return compositeCampaignCreationResultSchema.parse({ campaign: created.campaign, adGroup: created.adGroup, ads: created.ads, targets: created.targets });
    } catch (error) {
        throw toCompositePartialFailure(error, created);
    }
};

const createCampaignWithOptions = async (context: OperationContext, input: unknown, options: CampaignCreationOptions = {}): Promise<CanonicalCampaign> => {
    const parsedInput = parseCampaignInput(campaignCreateInputSchema, input, 'create_campaign');
    if (parsedInput.endDate && parsedInput.endDate < parsedInput.startDate) {
        throw new OperationError('INVALID_INPUT', 'create_campaign input is invalid.', {
            issues: [{ path: ['endDate'], message: 'endDate must be on or after startDate.' }],
        });
    }
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const profileId = resolveProfileId(account);
    const response = await callAmazon(context, 'createCampaigns', {
        profileId,
        region: resolveApiRegion(account.countryCode),
        campaigns: [buildCreatePayload(parsedInput, account, options)],
    });
    const amazonCampaign = extractCampaign(response);
    const canonical = mapCanonicalCampaign({
        account,
        amazonCampaign,
        fallback: buildCreateFallback(parsedInput, amazonCampaign),
    });
    const now = new Date();

    await reconcileCampaign(context, account, canonical, undefined, now);
    await recordCampaignChanges(context, account, canonical.id, now, [
        { eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: canonical.state },
        { eventType: 'budget_change', fieldName: 'budgetAmount', previousValue: null, newValue: canonical.dailyBudget },
        { eventType: 'bid_change', fieldName: 'bidStrategy', previousValue: null, newValue: canonical.bidStrategy },
        {
            eventType: 'bid_change',
            fieldName: 'placementBidAdjustments',
            previousValue: null,
            newValue: serializePlacementBidAdjustments(canonical.placementBidAdjustments),
        },
    ]);

    return canonical;
};

const parseCampaignInput = <T>(schema: { safeParse: (input: unknown) => { success: boolean; data?: T; error?: { issues: unknown[] } } }, input: unknown, operationName: string): T => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
        throw new OperationError('INVALID_INPUT', `${operationName} input is invalid.`, { issues: parsed.error?.issues ?? [] });
    }
    return parsed.data as T;
};

const parseCompositeInput = (input: unknown): CompositeCampaignCreateInput => parseCampaignInput(compositeCampaignCreateInputSchema, input, 'create_sponsored_products_campaign');

const runCompositeStep = async <T>(operation: string, input: Record<string, unknown>, action: () => Promise<T>) => {
    try {
        return await action();
    } catch (error) {
        throw new CompositeStepFailure(operation, input, error);
    }
};

const toCompositePartialFailure = (error: unknown, created: { campaign: CanonicalCampaign; adGroup: CanonicalAdGroup | undefined; ads: CanonicalAd[]; targets: CanonicalTarget[] }) => {
    const failure = error instanceof CompositeStepFailure ? error : new CompositeStepFailure('composite_response', {}, error);
    throw new OperationError('COMPOSITE_PARTIAL_FAILURE', `Sponsored Products campaign creation stopped during ${failure.operation}. The Campaign remains paused.`, {
        campaign: created.campaign,
        created: {
            adGroups: created.adGroup ? [created.adGroup] : [],
            ads: created.ads,
            targets: created.targets,
        },
        failed: {
            operation: failure.operation,
            input: failure.input,
            amazon: sanitizeCompositeAmazonError(failure.error),
        },
    });
};

class CompositeStepFailure extends Error {
    readonly operation: string;
    readonly input: Record<string, unknown>;
    readonly error: unknown;

    constructor(operation: string, input: Record<string, unknown>, error: unknown) {
        super(`Composite step ${operation} failed.`);
        this.name = 'CompositeStepFailure';
        this.operation = operation;
        this.input = input;
        this.error = error;
    }
}

const sanitizeCompositeAmazonError = (error: unknown) => {
    const details = error instanceof OperationError ? error.details : undefined;
    const amazon = details?.amazon;
    if (isRecord(amazon)) {
        return {
            ...(readString(amazon.code) ? { code: readString(amazon.code) } : {}),
            ...(readString(amazon.errorCode) ? { errorCode: readString(amazon.errorCode) } : {}),
            ...(typeof amazon.statusCode === 'number' ? { statusCode: amazon.statusCode } : {}),
            ...(readString(amazon.message) ? { message: sanitizeCompositeErrorMessage(readString(amazon.message) as string) } : {}),
        };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
        ...(error instanceof OperationError ? { code: error.code } : {}),
        message: sanitizeCompositeErrorMessage(message),
    };
};

const sanitizeCompositeErrorMessage = (message: string) => message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').slice(0, 500);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const buildCreatePayload = (input: CampaignCreateInput, account: ResolvedAccount, options: CampaignCreationOptions) => {
    const bidSettings: AmazonRecord = {
        bidStrategy: AMAZON_BID_STRATEGIES[input.bidStrategy],
    };
    const placementBidAdjustments = mapPlacementBidAdjustmentsToAmazon(input.placementBidAdjustments);
    if (placementBidAdjustments) {
        bidSettings.bidAdjustments = { placementBidAdjustments };
    }

    const payload: AmazonRecord = {
        adProduct: 'SPONSORED_PRODUCTS',
        name: input.name,
        state: input.state,
        startDateTime: toAmazonDateTime(input.startDate, account.countryCode, false),
        marketplaceScope: 'SINGLE_MARKETPLACE',
        countries: [account.countryCode.toUpperCase()],
        autoCreationSettings: { autoCreateTargets: options.autoCreateTargets ?? input.targetingMode === 'AUTO' },
        budgets: [buildAmazonBudget(input.dailyBudget, getAdvertiserAccountMetadata(account.countryCode).currency)],
        optimizations: { bidSettings },
    };
    if (input.endDate) {
        payload.endDateTime = toAmazonDateTime(input.endDate, account.countryCode, true);
    }
    return payload;
};

const buildUpdatePayload = (campaignId: string, changes: CampaignUpdateChanges, account: ResolvedAccount) => {
    const payload: AmazonRecord = { campaignId };
    if (changes.state !== undefined) {
        payload.state = changes.state;
    }
    if (changes.dailyBudget !== undefined) {
        payload.budgets = [buildAmazonBudget(changes.dailyBudget, getAdvertiserAccountMetadata(account.countryCode).currency)];
    }

    const bidSettings: AmazonRecord = {};
    if (changes.bidStrategy !== undefined) {
        bidSettings.bidStrategy = AMAZON_BID_STRATEGIES[changes.bidStrategy];
    }
    const placementBidAdjustments = mapPlacementBidAdjustmentsToAmazon(changes.placementBidAdjustments);
    if (placementBidAdjustments) {
        bidSettings.bidAdjustments = { placementBidAdjustments };
    }
    if (Object.keys(bidSettings).length > 0) {
        payload.optimizations = { bidSettings };
    }
    return payload;
};

const buildAmazonBudget = (value: number, currencyCode: string) => ({
    budgetType: 'MONETARY',
    recurrenceTimePeriod: 'DAILY',
    budgetValue: {
        monetaryBudgetValue: {
            monetaryBudget: { value, currencyCode },
        },
    },
});

const mapPlacementBidAdjustmentsToAmazon = (adjustments: CampaignCreateInput['placementBidAdjustments'] | CampaignUpdateChanges['placementBidAdjustments']) => {
    if (!adjustments) {
        return undefined;
    }

    return Object.entries(adjustments).map(([key, percentage]) => ({
        percentage,
        placement: AMAZON_PLACEMENT_KEYS[key as keyof typeof AMAZON_PLACEMENT_KEYS],
    }));
};

const mapCanonicalCampaign = ({ account, amazonCampaign, fallback }: { account: ResolvedAccount; amazonCampaign: AmazonRecord; fallback: CampaignFallback }): CanonicalCampaign => {
    const state = resolveCampaignState(amazonCampaign, fallback.state);
    const placementBidAdjustments = resolvePlacementBidAdjustments(amazonCampaign);
    const canonical = {
        id: readString(amazonCampaign.campaignId) ?? fallback.id,
        name: readString(amazonCampaign.name) ?? fallback.name,
        state,
        deliveryStatus: resolveDeliveryStatus(amazonCampaign, fallback.deliveryStatus, state),
        dailyBudget: resolveDailyBudget(amazonCampaign, fallback.dailyBudget),
        bidStrategy: resolveBidStrategy(amazonCampaign, fallback.bidStrategy),
        targetingMode: resolveTargetingMode(amazonCampaign, fallback.targetingMode),
        startDate: resolveCampaignDate(amazonCampaign, 'startDate', 'startDateTime', account.countryCode) ?? fallback.startDate,
        endDate: resolveOptionalCampaignDate(amazonCampaign, 'endDate', 'endDateTime', account.countryCode, fallback.endDate),
        placementBidAdjustments: placementBidAdjustments.present ? placementBidAdjustments.value : fallback.placementBidAdjustments,
    } satisfies CanonicalCampaign;

    if (!canonical.placementBidAdjustments || Object.keys(canonical.placementBidAdjustments).length === 0) {
        canonical.placementBidAdjustments = undefined;
    }
    const parsed = canonicalCampaignSchema.safeParse(canonical);
    if (!parsed.success) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned an invalid Campaign result.', {
            amazon: { message: 'Campaign response did not match the canonical Campaign shape.', issues: parsed.error.issues },
        });
    }
    return parsed.data;
};

type CampaignFallback = {
    id: string;
    name: string;
    state: CanonicalCampaign['state'];
    deliveryStatus: string;
    dailyBudget: number;
    bidStrategy: CanonicalCampaign['bidStrategy'];
    targetingMode: CanonicalCampaign['targetingMode'];
    startDate: string;
    endDate: string | null;
    placementBidAdjustments?: CanonicalCampaign['placementBidAdjustments'];
};

const buildCreateFallback = (input: CampaignCreateInput, amazonCampaign: AmazonRecord): CampaignFallback => ({
    id: readString(amazonCampaign.campaignId) ?? 'unknown-campaign',
    name: input.name,
    state: input.state,
    deliveryStatus: inferDeliveryStatus(input.state),
    dailyBudget: input.dailyBudget,
    bidStrategy: input.bidStrategy,
    targetingMode: input.targetingMode,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    placementBidAdjustments: normalizePlacementBidAdjustments(input.placementBidAdjustments),
});

const buildUpdateFallback = (previous: CampaignFallback, changes: CampaignUpdateChanges, amazonCampaign: AmazonRecord): CampaignFallback => ({
    ...previous,
    id: readString(amazonCampaign.campaignId) ?? previous.id,
    state: changes.state ?? previous.state,
    deliveryStatus: changes.state ? inferDeliveryStatus(changes.state) : previous.deliveryStatus,
    dailyBudget: changes.dailyBudget ?? previous.dailyBudget,
    bidStrategy: changes.bidStrategy ?? previous.bidStrategy,
    placementBidAdjustments: mergePlacementBidAdjustments(previous.placementBidAdjustments, changes.placementBidAdjustments),
});

const mapArchiveFallback = (row: CampaignArchiveRow): CampaignFallback => ({
    id: row.campaignId,
    name: row.name,
    state: parseCampaignState(row.state, 'PAUSED'),
    deliveryStatus: row.deliveryStatus,
    dailyBudget: parseMoney(row.budgetAmount) ?? 0,
    bidStrategy: mapAmazonBidStrategyToPublic(row.bidStrategy) ?? 'DYNAMIC_DOWN_ONLY',
    targetingMode: mapArchiveTargetingMode(row.targetingSettings),
    startDate: toDateString(row.startDate) ?? '1970-01-01',
    endDate: toDateString(row.endDate),
});

const reconcileCampaign = async (context: OperationContext, account: ResolvedAccount, canonical: CanonicalCampaign, current: CampaignArchiveRow | undefined, changedAt: Date) => {
    const values = {
        campaignId: canonical.id,
        accountId: account.adsAccountId,
        countryCode: account.countryCode.toUpperCase(),
        name: canonical.name,
        adProduct: 'SPONSORED_PRODUCTS',
        state: canonical.state,
        deliveryStatus: canonical.deliveryStatus,
        startDate: canonical.startDate,
        endDate: canonical.endDate,
        targetingSettings: canonical.targetingMode === 'AUTO' ? 'AUTO' : 'MANUAL',
        bidStrategy: AMAZON_BID_STRATEGIES[canonical.bidStrategy],
        budgetType: 'MONETARY',
        budgetPeriod: 'DAILY',
        budgetAmount: canonical.dailyBudget.toFixed(2),
        creationDateTime: current?.creationDateTime ?? changedAt,
        lastUpdatedDateTime: changedAt,
    };

    if (current) {
        await context.db
            .update(campaign)
            .set(values)
            .where(and(eq(campaign.campaignId, current.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode)));
        return;
    }

    await context.db
        .insert(campaign)
        .values({ id: canonical.id, ...values })
        .onConflictDoUpdate({
            target: campaign.campaignId,
            set: values,
        });
};

const recordCampaignChanges = async (context: OperationContext, account: ResolvedAccount, campaignId: string, changedAt: Date, changes: CampaignHistoryChange[]) => {
    for (const change of changes) {
        const previousValue = normalizeHistoryValue(change.previousValue);
        const newValue = normalizeHistoryValue(change.newValue);
        if (previousValue === newValue) {
            continue;
        }

        await context.db
            .insert(entityChangeHistory)
            .values({
                accountId: account.adsAccountId,
                countryCode: account.countryCode.toUpperCase(),
                localDate: formatInTimeZone(changedAt, getTimezoneForCountry(account.countryCode), 'yyyy-MM-dd'),
                entityType: 'campaign',
                entityId: campaignId,
                eventType: change.eventType,
                fieldName: change.fieldName,
                previousValue,
                newValue,
                changedAt,
                source: 'bidbeacon',
                rawPayload: null,
            })
            .onConflictDoNothing();
    }
};

const callAmazon = async (
    context: OperationContext,
    operation: 'createCampaigns' | 'deleteCampaigns' | 'updateCampaigns',
    input: { profileId: number; region: 'na' | 'eu' | 'fe'; campaigns: AmazonRecord[] }
) => {
    try {
        return (await context.amazonAds[operation](input)) as CampaignResponse;
    } catch (error) {
        throw mapAmazonException(error);
    }
};

const assertArchiveOnlyPatch = (changes: CampaignUpdateChanges, entityLabel: string) => {
    if (changes.state === 'ARCHIVED' && Object.keys(changes).length > 1) {
        throw new OperationError('INVALID_INPUT', `${entityLabel} ARCHIVED state must be the only requested change.`, {
            fields: Object.keys(changes),
        });
    }
};

const extractCampaign = (response: CampaignResponse): AmazonRecord => {
    const error = response.error?.[0];
    if (error) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads rejected the Campaign operation.', { amazon: sanitizeAmazonError(error) });
    }

    const success = response.success?.[0];
    const campaignValue = success?.campaign ?? success;
    if (!campaignValue || typeof campaignValue !== 'object' || Array.isArray(campaignValue)) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned no Campaign result.', { amazon: { message: 'Missing Campaign success payload.' } });
    }
    if (!readString((campaignValue as AmazonRecord).campaignId)) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned a Campaign result without an ID.', { amazon: { message: 'Missing campaignId.' } });
    }
    return campaignValue as AmazonRecord;
};

const mapAmazonException = (error: unknown) => {
    if (error instanceof OperationError) {
        return error;
    }

    const statusCode = readStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);
    const unavailable = statusCode === undefined ? AMAZON_UNAVAILABLE_MESSAGE_REGEX.test(message) || AMAZON_STATUS_CODE_REGEX.test(message) : [408, 409, 429, 500, 502, 503, 504].includes(statusCode);
    return new OperationError(
        unavailable ? 'AMAZON_UNAVAILABLE' : 'AMAZON_REJECTED',
        unavailable ? 'Amazon Ads was unavailable after the synchronous retry policy.' : 'Amazon Ads rejected the Campaign operation.',
        {
            amazon: {
                ...(statusCode === undefined ? {} : { statusCode }),
                message: sanitizeErrorMessage(message),
            },
        }
    );
};

const sanitizeAmazonError = (error: AmazonRecord) => ({
    ...(readString(error.code) ? { code: readString(error.code) } : {}),
    ...(readString(error.errorCode) ? { errorCode: readString(error.errorCode) } : {}),
    ...(readString(error.message) ? { message: sanitizeErrorMessage(readString(error.message) as string) } : {}),
});

const sanitizeErrorMessage = (message: string) => message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').slice(0, 500);

const readStatusCode = (error: unknown) => {
    if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
        return error.statusCode;
    }
    if (error instanceof Error) {
        const match = error.message.match(AMAZON_STATUS_CODE_REGEX);
        return match ? Number(match[1]) : undefined;
    }
    return undefined;
};

const resolveProfileId = (account: ResolvedAccount) => {
    const profileId = Number(account.profileId ?? '');
    if (!Number.isSafeInteger(profileId) || profileId <= 0) {
        throw new OperationError('INTERNAL_ERROR', 'The Advertiser Account is missing a valid Amazon Ads profile.', { accountId: account.id });
    }
    return profileId;
};

const resolveApiRegion = (countryCode: string): 'na' | 'eu' | 'fe' => {
    const code = countryCode.toUpperCase();
    if (['US', 'CA', 'MX', 'BR'].includes(code)) {
        return 'na';
    }
    if (['GB', 'IE', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'PL', 'TR', 'AE', 'SA', 'EG'].includes(code)) {
        return 'eu';
    }
    if (['JP', 'AU', 'IN', 'SG'].includes(code)) {
        return 'fe';
    }
    return 'na';
};

const toAmazonDateTime = (date: string, countryCode: string, endOfDay: boolean) => {
    const time = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
    return fromZonedTime(`${date}${time}`, getTimezoneForCountry(countryCode)).toISOString();
};

const resolveCampaignState = (record: AmazonRecord, fallback: CanonicalCampaign['state']) => {
    const stateValue = record.state;
    if (typeof stateValue === 'object' && stateValue !== null && !Array.isArray(stateValue)) {
        return parseCampaignState(readString((stateValue as AmazonRecord).state), fallback);
    }
    return parseCampaignState(readString(stateValue), fallback);
};

const resolveDeliveryStatus = (record: AmazonRecord, fallback: string, state: CanonicalCampaign['state']) => {
    const status = record.status;
    if (typeof status === 'object' && status !== null && !Array.isArray(status)) {
        const statusRecord = status as AmazonRecord;
        const value = readString(statusRecord.deliveryStatus) ?? readString(statusRecord.delivery_status);
        if (value) {
            return value;
        }
    }
    return readString(record.deliveryStatus) ?? (fallback || inferDeliveryStatus(state));
};

const resolveDailyBudget = (record: AmazonRecord, fallback: number) => {
    const direct = parseMoney(record.dailyBudget ?? record.budget);
    if (direct !== null) {
        return direct;
    }

    const budgets = Array.isArray(record.budgets) ? record.budgets : record.budgets && typeof record.budgets === 'object' ? [record.budgets] : [];
    for (const budget of budgets) {
        if (!budget || typeof budget !== 'object') {
            continue;
        }
        const value = budget as AmazonRecord;
        const nestedBudget = ((value.budgetValue as AmazonRecord | undefined)?.monetaryBudgetValue as AmazonRecord | undefined)?.monetaryBudget as AmazonRecord | undefined;
        const nested = nestedBudget?.value ?? nestedBudget?.amount;
        const parsed = parseMoney(nested);
        if (parsed !== null) {
            return parsed;
        }
    }
    return fallback;
};

const resolveBidStrategy = (record: AmazonRecord, fallback: CanonicalCampaign['bidStrategy']) => {
    const optimizations = record.optimizations;
    const bidSettings = optimizations && typeof optimizations === 'object' && !Array.isArray(optimizations) ? (optimizations as AmazonRecord).bidSettings : undefined;
    const raw = readString(record.bidStrategy) ?? (bidSettings && typeof bidSettings === 'object' && !Array.isArray(bidSettings) ? readString((bidSettings as AmazonRecord).bidStrategy) : undefined);
    return mapAmazonBidStrategyToPublic(raw) ?? fallback;
};

const resolveTargetingMode = (record: AmazonRecord, fallback: CanonicalCampaign['targetingMode']) => {
    const raw = readString(record.targetingMode) ?? readString(record.targetingType) ?? readString(record.targetingSettings);
    if (raw === 'AUTO') {
        return 'AUTO';
    }
    if (raw === 'MANUAL_KEYWORD' || raw === 'MANUAL_PRODUCT') {
        return raw;
    }
    const autoSettings = record.autoCreationSettings;
    if (autoSettings && typeof autoSettings === 'object' && !Array.isArray(autoSettings) && (autoSettings as AmazonRecord).autoCreateTargets === true) {
        return 'AUTO';
    }
    return fallback;
};

const resolveCampaignDate = (record: AmazonRecord, dateKey: string, dateTimeKey: string, countryCode: string) => {
    if (Object.hasOwn(record, dateKey)) {
        const value = record[dateKey];
        return value === null ? null : normalizeDateString(value);
    }
    if (!Object.hasOwn(record, dateTimeKey)) {
        return undefined;
    }
    const value = record[dateTimeKey];
    return value === null ? null : normalizeDateString(value, countryCode);
};

const resolveOptionalCampaignDate = (record: AmazonRecord, dateKey: string, dateTimeKey: string, countryCode: string, fallback: string | null) => {
    const resolved = resolveCampaignDate(record, dateKey, dateTimeKey, countryCode);
    return resolved === undefined ? fallback : resolved;
};

const resolvePlacementBidAdjustments = (record: AmazonRecord) => {
    const direct = record.placementBidAdjustments;
    const optimizations = record.optimizations;
    const bidSettings = optimizations && typeof optimizations === 'object' && !Array.isArray(optimizations) ? (optimizations as AmazonRecord).bidSettings : undefined;
    const bidAdjustments = bidSettings && typeof bidSettings === 'object' && !Array.isArray(bidSettings) ? (bidSettings as AmazonRecord).bidAdjustments : undefined;
    const nested = bidAdjustments && typeof bidAdjustments === 'object' && !Array.isArray(bidAdjustments) ? (bidAdjustments as AmazonRecord).placementBidAdjustments : undefined;
    const directPresent = Object.hasOwn(record, 'placementBidAdjustments');
    const nestedPresent = Boolean(bidAdjustments && typeof bidAdjustments === 'object' && !Array.isArray(bidAdjustments) && Object.hasOwn(bidAdjustments, 'placementBidAdjustments'));
    if (!(directPresent || nestedPresent)) {
        return { present: false as const, value: undefined };
    }

    const source = directPresent ? direct : nested;
    if (Array.isArray(source)) {
        const result = normalizePlacementBidAdjustments(
            Object.fromEntries(
                source.flatMap(value => {
                    if (!value || typeof value !== 'object' || Array.isArray(value)) {
                        return [];
                    }
                    const adjustment = value as AmazonRecord;
                    const placement = readString(adjustment.placement) ?? readString(adjustment.predicate);
                    const key = placement ? PUBLIC_PLACEMENT_KEYS[placement as keyof typeof PUBLIC_PLACEMENT_KEYS] : undefined;
                    return key ? [[key, parsePlacementValue(adjustment.percentage)]] : [];
                })
            )
        );
        return { present: true as const, value: result };
    }
    if (!source || typeof source !== 'object') {
        return { present: true as const, value: undefined };
    }

    const values = source as AmazonRecord;
    const result = normalizePlacementBidAdjustments({
        topOfSearch: parsePlacementValue(values.topOfSearch ?? values.placementTop ?? values.TOP_OF_SEARCH ?? values.PLACEMENT_TOP),
        restOfSearch: parsePlacementValue(values.restOfSearch ?? values.placementRestOfSearch ?? values.REST_OF_SEARCH ?? values.PLACEMENT_REST_OF_SEARCH),
        productPages: parsePlacementValue(values.productPages ?? values.productPage ?? values.placementProductPage ?? values.PRODUCT_PAGE ?? values.PLACEMENT_PRODUCT_PAGE),
        amazonBusiness: parsePlacementValue(values.amazonBusiness ?? values.placementAmazonBusiness ?? values.AMAZON_BUSINESS ?? values.PLACEMENT_AMAZON_BUSINESS),
    });
    return { present: true as const, value: result };
};

const normalizePlacementBidAdjustments = (value: AmazonRecord | undefined) => {
    if (!value) {
        return undefined;
    }
    const result = Object.fromEntries(Object.entries(value).filter(([, adjustment]) => typeof adjustment === 'number' && adjustment > 0)) as CanonicalCampaign['placementBidAdjustments'];
    return result && Object.keys(result).length > 0 ? result : undefined;
};

const mergePlacementBidAdjustments = (
    previous: CanonicalCampaign['placementBidAdjustments'],
    changes: CampaignCreateInput['placementBidAdjustments'] | CampaignUpdateChanges['placementBidAdjustments']
) => {
    if (!changes) {
        return previous;
    }
    return normalizePlacementBidAdjustments({ ...previous, ...changes });
};

const parsePlacementValue = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};

const mapAmazonBidStrategyToPublic = (value: string | null | undefined): CanonicalCampaign['bidStrategy'] | undefined => {
    if (!value) {
        return undefined;
    }
    if (value in PUBLIC_BID_STRATEGIES) {
        return PUBLIC_BID_STRATEGIES[value as keyof typeof PUBLIC_BID_STRATEGIES];
    }
    if (value === 'FIXED' || value === 'DYNAMIC_DOWN_ONLY' || value === 'DYNAMIC_UP_AND_DOWN') {
        return value;
    }
    return undefined;
};

const mapArchiveTargetingMode = (value: string | null) => {
    if (value === 'AUTO' || value === 'MANUAL_KEYWORD' || value === 'MANUAL_PRODUCT') {
        return value;
    }
    return 'MANUAL_KEYWORD' as const;
};

const parseCampaignState = (value: string | null | undefined, fallback: CanonicalCampaign['state']): CanonicalCampaign['state'] => {
    const parsed = campaignStateSchema.safeParse(value);
    return parsed.success ? parsed.data : fallback;
};

const inferDeliveryStatus = (state: CanonicalCampaign['state']) => (state === 'ENABLED' ? 'DELIVERING' : 'NOT_DELIVERING');

const parseMoney = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const normalizeDateString = (value: unknown, timezone?: string) => {
    if (typeof value !== 'string') {
        return null;
    }
    if (CALENDAR_DATE_REGEX.test(value)) {
        return value;
    }
    if (COMPACT_CALENDAR_DATE_REGEX.test(value)) {
        return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return timezone ? formatInTimeZone(date, getTimezoneForCountry(timezone), 'yyyy-MM-dd') : date.toISOString().slice(0, 10);
};

const readString = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);

const toDateString = (value: Date | string | null) => {
    if (!value) {
        return null;
    }
    return value instanceof Date ? value.toISOString().slice(0, 10) : value;
};

const serializePlacementBidAdjustments = (value: CanonicalCampaign['placementBidAdjustments']) => (value ? JSON.stringify(value) : null);

const normalizeHistoryValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : null;
    }
    return value;
};
