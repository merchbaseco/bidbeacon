import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, isNull, or } from 'drizzle-orm';
import { adGroup, campaign, entityChangeHistory, target } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';
import { resolveAdvertiserAccount } from './advertiser-accounts';
import type { OperationContext } from './operation-context';
import { OperationError } from './operation-errors';
import {
    type AutoTargetCreateInput,
    autoTargetCreateInputSchema,
    type CanonicalTarget,
    canonicalTargetSchema,
    type KeywordTargetCreateInput,
    keywordTargetCreateInputSchema,
    type NegativeKeywordCreateInput,
    type NegativeProductTargetCreateInput,
    negativeKeywordCreateInputSchema,
    negativeProductTargetCreateInputSchema,
    type ProductTargetCreateInput,
    productTargetCreateInputSchema,
    type TargetUpdateChanges,
    targetUpdateInputSchema,
} from './target-schemas';

type AmazonRecord = Record<string, unknown>;
type TargetResponse = {
    success?: AmazonRecord[];
    error?: AmazonRecord[];
    partialSuccess?: AmazonRecord[];
};
type ResolvedAccount = Awaited<ReturnType<typeof resolveAdvertiserAccount>>;
type TargetFallback = {
    id: string;
    campaignId: string;
    adGroupId: string | null;
    state: CanonicalTarget['state'];
    deliveryStatus: string;
    type: CanonicalTarget['type'];
    negative: boolean;
    matchType?: string;
    keyword?: string;
    asin?: string;
    bid?: number;
};

const AMAZON_UNAVAILABLE_MESSAGE_REGEX = /network|unavailable|timeout|timed out|fetch failed|econn|enet|eai_again/i;
const AMAZON_STATUS_CODE_REGEX = /\b(408|409|429|500|502|503|504)\b/;

export const createKeywordTarget = async (context: OperationContext, input: unknown): Promise<CanonicalTarget> => {
    const parsedInput = parseInput(keywordTargetCreateInputSchema, input, 'create_keyword_target');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const ownedAdGroup = await findOwnedAdGroup(context, account, parsedInput.adGroupId);
    if (!ownedAdGroup) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Ad group not found in the requested Advertiser Account.', { adGroupId: parsedInput.adGroupId });
    }

    const response = await callAmazon(context, 'createTargets', {
        profileId: resolveProfileId(account),
        region: resolveApiRegion(account.countryCode),
        targets: [buildKeywordCreatePayload(parsedInput)],
    });
    const amazonTarget = extractTarget(response);
    const canonical = mapCanonicalTarget({
        amazonTarget,
        fallback: {
            id: amazonTarget.targetId,
            campaignId: ownedAdGroup.campaignId,
            adGroupId: ownedAdGroup.adGroupId,
            state: parsedInput.state,
            deliveryStatus: inferDeliveryStatus(parsedInput.state),
            type: 'KEYWORD',
            negative: false,
            matchType: parsedInput.matchType,
            keyword: parsedInput.keyword,
            bid: parsedInput.bid,
        },
    });
    assertReturnedTargetIdentity(canonical, { campaignId: ownedAdGroup.campaignId, adGroupId: ownedAdGroup.adGroupId, type: 'KEYWORD', negative: false });
    const changedAt = new Date();

    await reconcileTarget(context, canonical, undefined, changedAt);
    await recordTargetChanges(context, account, canonical.id, changedAt, [
        { eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: canonical.state },
        { eventType: 'bid_change', fieldName: 'bidAmount', previousValue: null, newValue: canonical.bid },
    ]);

    return canonical;
};

export const createProductTarget = async (context: OperationContext, input: unknown): Promise<CanonicalTarget> => {
    const parsedInput = parseInput(productTargetCreateInputSchema, input, 'create_product_target');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const ownedAdGroup = await findOwnedAdGroup(context, account, parsedInput.adGroupId);
    if (!ownedAdGroup) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Ad group not found in the requested Advertiser Account.', { adGroupId: parsedInput.adGroupId });
    }

    const response = await callAmazon(context, 'createTargets', {
        profileId: resolveProfileId(account),
        region: resolveApiRegion(account.countryCode),
        targets: [buildProductCreatePayload(parsedInput)],
    });
    const amazonTarget = extractTarget(response);
    const canonical = mapCanonicalTarget({
        amazonTarget,
        fallback: {
            id: amazonTarget.targetId,
            campaignId: ownedAdGroup.campaignId,
            adGroupId: ownedAdGroup.adGroupId,
            state: parsedInput.state,
            deliveryStatus: inferDeliveryStatus(parsedInput.state),
            type: 'PRODUCT',
            negative: false,
            matchType: 'PRODUCT_EXACT',
            asin: parsedInput.asin,
            bid: parsedInput.bid,
        },
    });
    assertReturnedTargetIdentity(canonical, { campaignId: ownedAdGroup.campaignId, adGroupId: ownedAdGroup.adGroupId, type: 'PRODUCT', negative: false });
    const changedAt = new Date();

    await reconcileTarget(context, canonical, undefined, changedAt);
    await recordTargetChanges(context, account, canonical.id, changedAt, [
        { eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: canonical.state },
        { eventType: 'bid_change', fieldName: 'bidAmount', previousValue: null, newValue: canonical.bid },
    ]);

    return canonical;
};

export const createAutomaticTarget = async (context: OperationContext, input: unknown): Promise<CanonicalTarget> => {
    const parsedInput = parseInput(autoTargetCreateInputSchema, input, 'create_auto_target');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const ownedAdGroup = await findOwnedAdGroup(context, account, parsedInput.adGroupId);
    if (!ownedAdGroup) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Ad group not found in the requested Advertiser Account.', { adGroupId: parsedInput.adGroupId });
    }

    const response = await callAmazon(context, 'createTargets', {
        profileId: resolveProfileId(account),
        region: resolveApiRegion(account.countryCode),
        targets: [buildAutomaticCreatePayload(parsedInput)],
    });
    const amazonTarget = extractTarget(response);
    const canonical = mapCanonicalTarget({
        amazonTarget,
        fallback: {
            id: amazonTarget.targetId,
            campaignId: ownedAdGroup.campaignId,
            adGroupId: ownedAdGroup.adGroupId,
            state: parsedInput.state,
            deliveryStatus: inferDeliveryStatus(parsedInput.state),
            type: 'AUTO',
            negative: false,
            matchType: parsedInput.matchType,
            bid: parsedInput.bid,
        },
    });
    assertReturnedTargetIdentity(canonical, { campaignId: ownedAdGroup.campaignId, adGroupId: ownedAdGroup.adGroupId, type: 'AUTO', negative: false });
    const changedAt = new Date();

    await reconcileTarget(context, canonical, undefined, changedAt);
    await recordTargetChanges(context, account, canonical.id, changedAt, [
        { eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: canonical.state },
        { eventType: 'bid_change', fieldName: 'bidAmount', previousValue: null, newValue: canonical.bid },
    ]);

    return canonical;
};

export const createNegativeKeyword = async (context: OperationContext, input: unknown): Promise<CanonicalTarget> => {
    const parsedInput = parseInput(negativeKeywordCreateInputSchema, input, 'create_negative_keyword');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const ownedAdGroup = await findOwnedAdGroup(context, account, parsedInput.adGroupId);
    if (!ownedAdGroup || ownedAdGroup.campaignId !== parsedInput.campaignId) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Campaign and Ad group ancestry was not found in the requested Advertiser Account.', {
            campaignId: parsedInput.campaignId,
            adGroupId: parsedInput.adGroupId,
        });
    }

    const response = await callAmazon(context, 'createTargets', {
        profileId: resolveProfileId(account),
        region: resolveApiRegion(account.countryCode),
        targets: [buildNegativeKeywordCreatePayload(parsedInput)],
    });
    const amazonTarget = extractTarget(response);
    const canonical = mapCanonicalTarget({
        amazonTarget,
        fallback: {
            id: amazonTarget.targetId,
            campaignId: parsedInput.campaignId,
            adGroupId: parsedInput.adGroupId,
            state: parsedInput.state,
            deliveryStatus: inferDeliveryStatus(parsedInput.state),
            type: 'KEYWORD',
            negative: true,
            matchType: parsedInput.matchType,
            keyword: parsedInput.keyword,
        },
    });
    assertReturnedTargetIdentity(canonical, { campaignId: parsedInput.campaignId, adGroupId: parsedInput.adGroupId, type: 'KEYWORD', negative: true });
    const changedAt = new Date();

    await reconcileTarget(context, canonical, undefined, changedAt);
    await recordTargetChanges(context, account, canonical.id, changedAt, [{ eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: canonical.state }]);

    return canonical;
};

export const createNegativeProductTarget = async (context: OperationContext, input: unknown): Promise<CanonicalTarget> => {
    const parsedInput = parseInput(negativeProductTargetCreateInputSchema, input, 'create_negative_product_target');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const ownedAdGroup = await findOwnedAdGroup(context, account, parsedInput.adGroupId);
    if (!ownedAdGroup || ownedAdGroup.campaignId !== parsedInput.campaignId) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Campaign and Ad group ancestry was not found in the requested Advertiser Account.', {
            campaignId: parsedInput.campaignId,
            adGroupId: parsedInput.adGroupId,
        });
    }

    const response = await callAmazon(context, 'createTargets', {
        profileId: resolveProfileId(account),
        region: resolveApiRegion(account.countryCode),
        targets: [buildNegativeProductCreatePayload(parsedInput)],
    });
    const amazonTarget = extractTarget(response);
    const canonical = mapCanonicalTarget({
        amazonTarget,
        fallback: {
            id: amazonTarget.targetId,
            campaignId: parsedInput.campaignId,
            adGroupId: parsedInput.adGroupId,
            state: parsedInput.state,
            deliveryStatus: inferDeliveryStatus(parsedInput.state),
            type: 'PRODUCT',
            negative: true,
            matchType: 'PRODUCT_EXACT',
            asin: parsedInput.asin,
        },
    });
    assertReturnedTargetIdentity(canonical, { campaignId: parsedInput.campaignId, adGroupId: parsedInput.adGroupId, type: 'PRODUCT', negative: true });
    const changedAt = new Date();

    await reconcileTarget(context, canonical, undefined, changedAt);
    await recordTargetChanges(context, account, canonical.id, changedAt, [{ eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: canonical.state }]);

    return canonical;
};

export const updateTarget = async (context: OperationContext, input: unknown): Promise<CanonicalTarget> => {
    const parsedInput = parseInput(targetUpdateInputSchema, input, 'update_target');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const [owned] = await context.db
        .select({ row: target })
        .from(target)
        .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
        .leftJoin(adGroup, and(eq(target.adGroupId, adGroup.adGroupId), eq(target.campaignId, adGroup.campaignId)))
        .where(
            and(
                eq(target.targetId, parsedInput.targetId),
                eq(target.adProduct, 'SPONSORED_PRODUCTS'),
                eq(campaign.adProduct, 'SPONSORED_PRODUCTS'),
                eq(campaign.accountId, account.adsAccountId),
                eq(campaign.countryCode, account.countryCode),
                or(isNull(target.adGroupId), and(eq(adGroup.adGroupId, target.adGroupId), eq(adGroup.adProduct, 'SPONSORED_PRODUCTS')))
            )
        )
        .limit(1);
    const current = owned?.row;

    if (!current) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Target not found in the requested Advertiser Account.', { targetId: parsedInput.targetId });
    }
    assertTargetChangeEligibility(current, parsedInput.changes);

    const response = await callAmazon(context, 'updateTargets', {
        profileId: resolveProfileId(account),
        region: resolveApiRegion(account.countryCode),
        targets: [buildUpdatePayload(parsedInput.targetId, parsedInput.changes, current.adGroupId === null ? current.campaignId : undefined)],
    });
    const amazonTarget = extractTarget(response);
    const previous = mapArchiveTarget(current);
    const canonical = mapCanonicalTarget({
        amazonTarget,
        fallback: {
            ...previous,
            state: parsedInput.changes.state ?? previous.state,
            deliveryStatus: parsedInput.changes.state ? inferDeliveryStatus(parsedInput.changes.state) : previous.deliveryStatus,
            bid: parsedInput.changes.bid ?? previous.bid,
        },
    });
    assertReturnedTargetIdentity(canonical, {
        campaignId: current.campaignId,
        adGroupId: current.adGroupId,
        targetId: current.targetId,
        type: previous.type,
        negative: previous.negative,
    });
    const changedAt = new Date();

    await reconcileTarget(context, canonical, current, changedAt);
    const historyChanges: TargetHistoryChange[] = [];
    if (parsedInput.changes.state !== undefined) {
        historyChanges.push({ eventType: 'state_change', fieldName: 'state', previousValue: previous.state, newValue: canonical.state });
    }
    if (parsedInput.changes.bid !== undefined) {
        historyChanges.push({ eventType: 'bid_change', fieldName: 'bidAmount', previousValue: previous.bid, newValue: canonical.bid });
    }
    await recordTargetChanges(context, account, canonical.id, changedAt, historyChanges);

    return canonical;
};

const parseInput = <T>(schema: { safeParse: (input: unknown) => { success: boolean; data?: T; error?: { issues: unknown[] } } }, input: unknown, operationName: string): T => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
        throw new OperationError('INVALID_INPUT', `${operationName} input is invalid.`, { issues: parsed.error?.issues ?? [] });
    }
    return parsed.data as T;
};

const findOwnedAdGroup = async (context: OperationContext, account: ResolvedAccount, adGroupId: string) => {
    const [owned] = await context.db
        .select({ adGroupId: adGroup.adGroupId, campaignId: adGroup.campaignId })
        .from(adGroup)
        .innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId))
        .where(
            and(
                eq(adGroup.adGroupId, adGroupId),
                eq(adGroup.adProduct, 'SPONSORED_PRODUCTS'),
                eq(campaign.adProduct, 'SPONSORED_PRODUCTS'),
                eq(campaign.accountId, account.adsAccountId),
                eq(campaign.countryCode, account.countryCode)
            )
        )
        .limit(1);
    return owned;
};

const buildKeywordCreatePayload = (input: KeywordTargetCreateInput) => ({
    adProduct: 'SPONSORED_PRODUCTS',
    adGroupId: input.adGroupId,
    bid: { bid: input.bid },
    state: input.state,
    negative: false,
    targetType: 'KEYWORD',
    targetDetails: {
        keywordTarget: {
            keyword: input.keyword,
            matchType: input.matchType,
        },
    },
});

const buildProductCreatePayload = (input: ProductTargetCreateInput) => ({
    adProduct: 'SPONSORED_PRODUCTS',
    adGroupId: input.adGroupId,
    bid: { bid: input.bid },
    state: input.state,
    negative: false,
    targetType: 'PRODUCT',
    targetDetails: {
        productTarget: {
            productIdType: 'ASIN',
            matchType: 'PRODUCT_EXACT',
            product: { productId: input.asin },
        },
    },
});

const buildAutomaticCreatePayload = (input: AutoTargetCreateInput) => ({
    adProduct: 'SPONSORED_PRODUCTS',
    adGroupId: input.adGroupId,
    bid: { bid: input.bid },
    state: input.state,
    negative: false,
    targetType: 'AUTO',
    targetDetails: {
        autoTarget: {
            matchType: input.matchType,
        },
    },
});

const buildNegativeKeywordCreatePayload = (input: NegativeKeywordCreateInput) => ({
    adProduct: 'SPONSORED_PRODUCTS',
    adGroupId: input.adGroupId,
    state: input.state,
    negative: true,
    targetType: 'KEYWORD',
    targetDetails: {
        keywordTarget: {
            keyword: input.keyword,
            matchType: input.matchType,
        },
    },
});

const buildNegativeProductCreatePayload = (input: NegativeProductTargetCreateInput) => ({
    adProduct: 'SPONSORED_PRODUCTS',
    adGroupId: input.adGroupId,
    state: input.state,
    negative: true,
    targetType: 'PRODUCT',
    targetDetails: {
        productTarget: {
            productIdType: 'ASIN',
            matchType: 'PRODUCT_EXACT',
            product: { productId: input.asin },
        },
    },
});

const buildUpdatePayload = (targetId: string, changes: TargetUpdateChanges, campaignId?: string) => {
    const payload: AmazonRecord = { targetId };
    if (campaignId !== undefined) {
        payload.campaignId = campaignId;
    }
    if (changes.state !== undefined) {
        payload.state = changes.state;
    }
    if (changes.bid !== undefined) {
        payload.bid = { bid: changes.bid };
    }
    return payload;
};

const mapCanonicalTarget = ({ amazonTarget, fallback }: { amazonTarget: AmazonRecord; fallback: TargetFallback }): CanonicalTarget => {
    const type = resolveTargetType(amazonTarget, fallback.type);
    const matchType = resolveMatchType(amazonTarget) ?? fallback.matchType;
    const keyword = resolveKeyword(amazonTarget) ?? fallback.keyword;
    const asin = resolveAsin(amazonTarget) ?? fallback.asin;
    const negative = typeof amazonTarget.negative === 'boolean' ? amazonTarget.negative : fallback.negative;
    const bid = negative ? undefined : (resolveBid(amazonTarget) ?? fallback.bid);
    const canonical = {
        id: readString(amazonTarget.targetId) ?? fallback.id,
        campaignId: readString(amazonTarget.campaignId) ?? fallback.campaignId,
        adGroupId: readString(amazonTarget.adGroupId) ?? fallback.adGroupId,
        state: resolveState(amazonTarget, fallback.state),
        deliveryStatus: resolveDeliveryStatus(amazonTarget, fallback.deliveryStatus),
        type,
        negative,
        ...(matchType ? { matchType } : {}),
        ...(type === 'KEYWORD' && keyword ? { keyword } : {}),
        ...(type === 'PRODUCT' && asin ? { asin } : {}),
        ...(bid === undefined ? {} : { bid }),
    } satisfies CanonicalTarget;
    const parsed = canonicalTargetSchema.safeParse(canonical);
    if (!parsed.success) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned an invalid Target result.', {
            amazon: { message: 'Target response did not match the canonical Target shape.', issues: parsed.error.issues },
        });
    }
    return parsed.data;
};

const assertReturnedTargetIdentity = (
    canonical: CanonicalTarget,
    expected: { campaignId: string; adGroupId?: string | null; targetId?: string; type?: CanonicalTarget['type']; negative?: boolean }
) => {
    if (
        canonical.campaignId !== expected.campaignId ||
        (expected.adGroupId !== undefined && canonical.adGroupId !== expected.adGroupId) ||
        (expected.targetId !== undefined && canonical.id !== expected.targetId) ||
        (expected.type !== undefined && canonical.type !== expected.type) ||
        (expected.negative !== undefined && canonical.negative !== expected.negative)
    ) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned a Target outside the requested ancestry or kind.', {
            amazon: {
                campaignId: canonical.campaignId,
                adGroupId: canonical.adGroupId,
                targetId: canonical.id,
                type: canonical.type,
                negative: canonical.negative,
            },
        });
    }
};

const assertTargetChangeEligibility = (current: typeof target.$inferSelect, changes: TargetUpdateChanges) => {
    if (current.state === 'ARCHIVED' && (changes.bid !== undefined || (changes.state !== undefined && changes.state !== 'ARCHIVED'))) {
        throw new OperationError('INVALID_INPUT', 'Target state is terminal once ARCHIVED.', {
            currentState: current.state,
            requestedState: changes.state,
        });
    }
    if (current.negative && changes.bid !== undefined) {
        throw new OperationError('INVALID_INPUT', 'Negative Targets do not accept bid changes.');
    }
    if (current.negative && current.adGroupId === null && changes.state !== 'ARCHIVED') {
        throw new OperationError('INVALID_INPUT', 'Campaign-level negative Targets may only be archived.');
    }
    if (current.adGroupId === null && changes.bid !== undefined) {
        throw new OperationError('INVALID_INPUT', 'Campaign-level Targets do not accept bid changes.');
    }
};

const mapArchiveTarget = (row: typeof target.$inferSelect): TargetFallback => {
    const type = row.targetType === 'PRODUCT' ? 'PRODUCT' : row.targetType === 'AUTO' ? 'AUTO' : 'KEYWORD';
    return {
        id: row.targetId,
        campaignId: row.campaignId,
        adGroupId: row.adGroupId,
        state: resolveState({ state: row.state }, 'PAUSED'),
        deliveryStatus: row.deliveryStatus,
        type,
        negative: row.negative,
        ...(row.targetMatchType ? { matchType: row.targetMatchType } : {}),
        ...(row.targetKeyword ? { keyword: row.targetKeyword } : {}),
        ...(row.targetAsin ? { asin: row.targetAsin } : {}),
        ...(parseMoney(row.bidAmount) === undefined ? {} : { bid: parseMoney(row.bidAmount) }),
    };
};

const reconcileTarget = async (context: OperationContext, canonical: CanonicalTarget, current: typeof target.$inferSelect | undefined, changedAt: Date) => {
    const values = {
        targetId: canonical.id,
        campaignId: canonical.campaignId,
        adGroupId: canonical.adGroupId,
        adProduct: 'SPONSORED_PRODUCTS',
        state: canonical.state,
        negative: canonical.negative,
        bidAmount: canonical.bid === undefined ? null : canonical.bid.toFixed(2),
        targetMatchType: canonical.matchType ?? null,
        targetAsin: canonical.type === 'PRODUCT' ? (canonical.asin ?? null) : null,
        targetKeyword: canonical.type === 'KEYWORD' ? (canonical.keyword ?? null) : null,
        targetType: canonical.type,
        deliveryStatus: canonical.deliveryStatus,
        creationDateTime: current?.creationDateTime ?? changedAt,
        lastUpdatedDateTime: changedAt,
    };

    if (current) {
        await context.db
            .update(target)
            .set(values)
            .where(and(eq(target.targetId, current.targetId), eq(target.campaignId, current.campaignId)));
        return;
    }

    await context.db
        .insert(target)
        .values({ id: canonical.id, ...values })
        .onConflictDoUpdate({ target: target.targetId, set: values });
};

type TargetHistoryChange = {
    eventType: 'bid_change' | 'state_change';
    fieldName: 'bidAmount' | 'state';
    previousValue: string | number | null | undefined;
    newValue: string | number | null | undefined;
};

const recordTargetChanges = async (context: OperationContext, account: ResolvedAccount, targetId: string, changedAt: Date, changes: TargetHistoryChange[]) => {
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
                entityType: 'target',
                entityId: targetId,
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

const callAmazon = async (context: OperationContext, operation: 'createTargets' | 'updateTargets', input: { profileId: number; region: 'na' | 'eu' | 'fe'; targets: AmazonRecord[] }) => {
    try {
        return (await context.amazonAds[operation](input)) as TargetResponse;
    } catch (error) {
        throw mapAmazonException(error);
    }
};

const extractTarget = (response: TargetResponse): AmazonRecord & { targetId: string } => {
    const error = response.error?.[0];
    if (error) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads rejected the Target operation.', { amazon: sanitizeAmazonError(error) });
    }

    const success = response.success?.[0] ?? response.partialSuccess?.[0];
    const value = success?.target ?? success;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned no Target result.', { amazon: { message: 'Missing Target success payload.' } });
    }
    const targetId = readString((value as AmazonRecord).targetId);
    if (!targetId) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned a Target result without an ID.', { amazon: { message: 'Missing targetId.' } });
    }
    return value as AmazonRecord & { targetId: string };
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
        unavailable ? 'Amazon Ads was unavailable after the synchronous retry policy.' : 'Amazon Ads rejected the Target operation.',
        { amazon: { ...(statusCode === undefined ? {} : { statusCode }), message: sanitizeErrorMessage(message) } }
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

const resolveTargetType = (record: AmazonRecord, fallback: CanonicalTarget['type']): CanonicalTarget['type'] => {
    const raw = readString(record.targetType)?.toUpperCase() ?? readString(record.expressionType)?.toUpperCase();
    if (raw === 'AUTO') {
        return 'AUTO';
    }

    const details = readRecord(record.targetDetails);
    if (readRecord(details?.autoTarget)) {
        return 'AUTO';
    }
    if (readRecord(details?.keywordTarget) || raw === 'KEYWORD') {
        return 'KEYWORD';
    }
    if (readRecord(details?.productTarget) || raw === 'PRODUCT') {
        return 'PRODUCT';
    }
    return fallback;
};

const resolveMatchType = (record: AmazonRecord) => {
    const details = readRecord(record.targetDetails);
    const keywordTarget = readRecord(details?.keywordTarget);
    const productTarget = readRecord(details?.productTarget);
    const autoTarget = readRecord(details?.autoTarget);
    return readString(keywordTarget?.matchType) ?? readString(productTarget?.matchType) ?? readString(autoTarget?.matchType) ?? readString(record.targetMatchType) ?? readString(record.matchType);
};

const resolveKeyword = (record: AmazonRecord) => {
    const details = readRecord(record.targetDetails);
    const keywordTarget = readRecord(details?.keywordTarget);
    return readText(keywordTarget?.keyword) ?? readString(record.targetKeyword);
};

const resolveAsin = (record: AmazonRecord) => {
    const details = readRecord(record.targetDetails);
    const productTarget = readRecord(details?.productTarget);
    const product = readRecord(productTarget?.product);
    return readString(product?.productId) ?? readString(productTarget?.productId) ?? readString(record.targetAsin) ?? readString(record.asin);
};

const resolveBid = (record: AmazonRecord) => {
    const bid = record.bid;
    if (typeof bid === 'number' && Number.isFinite(bid)) {
        return bid;
    }
    const bidRecord = readRecord(bid);
    const nestedBid = bidRecord?.bid;
    if (typeof nestedBid === 'number' && Number.isFinite(nestedBid)) {
        return nestedBid;
    }
    const nestedRecord = readRecord(nestedBid);
    if (typeof nestedRecord?.bid === 'number' && Number.isFinite(nestedRecord.bid)) {
        return nestedRecord.bid;
    }
    return parseMoney(record.bidAmount);
};

const resolveState = (record: AmazonRecord, fallback: CanonicalTarget['state']) => {
    const state = readRecord(record.state);
    const value = readString(state?.state) ?? readString(record.state);
    return value === 'ENABLED' || value === 'PAUSED' || value === 'ARCHIVED' ? value : fallback;
};

const resolveDeliveryStatus = (record: AmazonRecord, fallback: string) => {
    const status = readRecord(record.status);
    return readString(status?.deliveryStatus) ?? readString(status?.delivery_status) ?? readString(record.deliveryStatus) ?? fallback;
};

const inferDeliveryStatus = (state: CanonicalTarget['state']) => (state === 'ENABLED' ? 'DELIVERING' : 'NOT_DELIVERING');

const parseMoney = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};

const readRecord = (value: unknown): AmazonRecord | undefined => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as AmazonRecord) : undefined);

const readText = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0) {
        return value;
    }
    const record = readRecord(value);
    return readString(record?.text) ?? readString(record?.value) ?? readString(record?.raw);
};

const readString = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);

const normalizeHistoryValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : null;
    }
    return value;
};
