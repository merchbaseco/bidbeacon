import { formatInTimeZone } from 'date-fns-tz';
import { and, eq } from 'drizzle-orm';
import { ad, adGroup, campaign, entityChangeHistory } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';
import {
    type AdCreateInput,
    type AdGroupCreateInput,
    type AdGroupUpdateChanges,
    adCreateInputSchema,
    adGroupCreateInputSchema,
    adGroupStateSchema,
    adGroupUpdateInputSchema,
    adStateSchema,
    adUpdateInputSchema,
    type CanonicalAd,
    type CanonicalAdGroup,
    canonicalAdGroupSchema,
    canonicalAdSchema,
} from './ad-schemas';
import { resolveAdvertiserAccount } from './advertiser-accounts';
import type { OperationContext } from './operation-context';
import { OperationError } from './operation-errors';

type AmazonRecord = Record<string, unknown>;
type AdGroupResponse = {
    success?: AmazonRecord[];
    error?: AmazonRecord[];
};
type AdResponse = {
    success?: AmazonRecord[];
    error?: AmazonRecord[];
};
type ResolvedAccount = Awaited<ReturnType<typeof resolveAdvertiserAccount>>;

const AMAZON_UNAVAILABLE_MESSAGE_REGEX = /network|unavailable|timeout|timed out|fetch failed|econn|enet|eai_again/i;
const AMAZON_STATUS_CODE_REGEX = /\b(408|409|429|500|502|503|504)\b/;

export const createAdGroup = async (context: OperationContext, input: unknown): Promise<CanonicalAdGroup> => {
    const parsedInput = parseInput(adGroupCreateInputSchema, input, 'create_ad_group');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    await assertCampaignOwnership(context, account, parsedInput.campaignId);

    const response = await callAmazon(context, 'createAdGroups', {
        profileId: resolveProfileId(account),
        region: resolveApiRegion(account.countryCode),
        adGroups: [buildCreatePayload(parsedInput)],
    });
    const amazonAdGroup = extractAdGroup(response);
    const canonical = mapCanonicalAdGroup({
        amazonAdGroup,
        fallback: {
            id: amazonAdGroup.adGroupId,
            campaignId: parsedInput.campaignId,
            name: parsedInput.name,
            state: parsedInput.state,
            deliveryStatus: inferDeliveryStatus(parsedInput.state),
            defaultBid: parsedInput.defaultBid,
        },
    });
    assertReturnedAdGroupIdentity(canonical, { campaignId: parsedInput.campaignId });
    const changedAt = new Date();

    await reconcileAdGroup(context, canonical, undefined, changedAt);
    await recordAdGroupChanges(context, account, canonical.id, changedAt, [
        { eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: canonical.state },
        { eventType: 'bid_change', fieldName: 'bidAmount', previousValue: null, newValue: canonical.defaultBid },
    ]);

    return canonical;
};

export const updateAdGroup = async (context: OperationContext, input: unknown): Promise<CanonicalAdGroup> => {
    const parsedInput = parseInput(adGroupUpdateInputSchema, input, 'update_ad_group');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const [owned] = await context.db
        .select({ row: adGroup })
        .from(adGroup)
        .innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId))
        .where(
            and(
                eq(adGroup.adGroupId, parsedInput.adGroupId),
                eq(adGroup.adProduct, 'SPONSORED_PRODUCTS'),
                eq(campaign.adProduct, 'SPONSORED_PRODUCTS'),
                eq(campaign.accountId, account.adsAccountId),
                eq(campaign.countryCode, account.countryCode)
            )
        )
        .limit(1);
    const current = owned?.row;

    if (!current) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Ad group not found in the requested Advertiser Account.', {
            adGroupId: parsedInput.adGroupId,
        });
    }
    assertTerminalStateTransition(current.state, parsedInput.changes.state, 'Ad group');
    assertArchiveOnlyPatch(parsedInput.changes, 'Ad group');

    const response =
        parsedInput.changes.state === 'ARCHIVED'
            ? await callAmazon(context, 'deleteAdGroups', {
                  profileId: resolveProfileId(account),
                  region: resolveApiRegion(account.countryCode),
                  adGroups: [{ adGroupId: parsedInput.adGroupId }],
              })
            : await callAmazon(context, 'updateAdGroups', {
                  profileId: resolveProfileId(account),
                  region: resolveApiRegion(account.countryCode),
                  adGroups: [buildUpdatePayload(parsedInput.adGroupId, parsedInput.changes)],
              });
    const amazonAdGroup = extractAdGroup(response);
    const previous = mapArchiveAdGroup(current);
    const canonical = mapCanonicalAdGroup({
        amazonAdGroup,
        fallback: {
            ...previous,
            state: parsedInput.changes.state ?? previous.state,
            deliveryStatus: parsedInput.changes.state ? inferDeliveryStatus(parsedInput.changes.state) : previous.deliveryStatus,
            defaultBid: parsedInput.changes.defaultBid ?? previous.defaultBid,
        },
    });
    assertReturnedAdGroupIdentity(canonical, { campaignId: current.campaignId, adGroupId: current.adGroupId });
    const changedAt = new Date();

    await reconcileAdGroup(context, canonical, current, changedAt);
    const historyChanges: AdGroupHistoryChange[] = [];
    if (parsedInput.changes.state !== undefined) {
        historyChanges.push({ eventType: 'state_change', fieldName: 'state', previousValue: previous.state, newValue: canonical.state });
    }
    if (parsedInput.changes.defaultBid !== undefined) {
        historyChanges.push({ eventType: 'bid_change', fieldName: 'bidAmount', previousValue: previous.defaultBid, newValue: canonical.defaultBid });
    }
    await recordAdGroupChanges(context, account, canonical.id, changedAt, historyChanges);

    return canonical;
};

export const createAd = async (context: OperationContext, input: unknown): Promise<CanonicalAd> => {
    const parsedInput = parseInput(adCreateInputSchema, input, 'create_ad');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const ownedAdGroup = await findOwnedAdGroup(context, account, parsedInput.adGroupId);
    if (!ownedAdGroup) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Ad group not found in the requested Advertiser Account.', {
            adGroupId: parsedInput.adGroupId,
        });
    }

    const response = await callAdsAmazon(context, 'createAds', {
        profileId: resolveProfileId(account),
        region: resolveApiRegion(account.countryCode),
        ads: [buildAdCreatePayload(parsedInput)],
    });
    const amazonAd = extractAd(response);
    const canonical = mapCanonicalAd({
        amazonAd,
        fallback: {
            id: amazonAd.adId,
            campaignId: ownedAdGroup.campaignId,
            adGroupId: parsedInput.adGroupId,
            state: parsedInput.state,
            deliveryStatus: inferDeliveryStatus(parsedInput.state),
            asin: parsedInput.asin,
            productTitle: null,
        },
    });
    assertReturnedAdIdentity(canonical, { campaignId: ownedAdGroup.campaignId, adGroupId: ownedAdGroup.adGroupId });
    const changedAt = new Date();

    await reconcileAd(context, canonical, undefined, changedAt);
    await recordAdChanges(context, account, canonical.id, changedAt, [{ eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: canonical.state }]);

    return canonical;
};

export const updateAd = async (context: OperationContext, input: unknown): Promise<CanonicalAd> => {
    const parsedInput = parseInput(adUpdateInputSchema, input, 'update_ad');
    const account = await resolveAdvertiserAccount(context, { accountId: parsedInput.accountId });
    const [owned] = await context.db
        .select({ row: ad })
        .from(ad)
        .innerJoin(adGroup, and(eq(ad.adGroupId, adGroup.adGroupId), eq(ad.campaignId, adGroup.campaignId)))
        .innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId))
        .where(
            and(
                eq(ad.adId, parsedInput.adId),
                eq(ad.adProduct, 'SPONSORED_PRODUCTS'),
                eq(adGroup.adProduct, 'SPONSORED_PRODUCTS'),
                eq(campaign.adProduct, 'SPONSORED_PRODUCTS'),
                eq(campaign.accountId, account.adsAccountId),
                eq(campaign.countryCode, account.countryCode)
            )
        )
        .limit(1);
    const current = owned?.row;

    if (!current) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Ad not found in the requested Advertiser Account.', { adId: parsedInput.adId });
    }
    assertTerminalStateTransition(current.state, parsedInput.changes.state, 'Ad');

    const response =
        parsedInput.changes.state === 'ARCHIVED'
            ? await callAdsAmazon(context, 'deleteAds', {
                  profileId: resolveProfileId(account),
                  region: resolveApiRegion(account.countryCode),
                  ads: [{ adId: parsedInput.adId }],
              })
            : await callAdsAmazon(context, 'updateAds', {
                  profileId: resolveProfileId(account),
                  region: resolveApiRegion(account.countryCode),
                  ads: [buildAdUpdatePayload(parsedInput.adId, parsedInput.changes)],
              });
    const amazonAd = extractAd(response);
    const previous = mapArchiveAd(current);
    const canonical = mapCanonicalAd({
        amazonAd,
        fallback: {
            ...previous,
            state: parsedInput.changes.state ?? previous.state,
            deliveryStatus: parsedInput.changes.state ? inferDeliveryStatus(parsedInput.changes.state) : previous.deliveryStatus,
        },
    });
    assertReturnedAdIdentity(canonical, { campaignId: current.campaignId, adGroupId: current.adGroupId, adId: current.adId });
    const changedAt = new Date();

    await reconcileAd(context, canonical, current, changedAt);
    const historyChanges: AdHistoryChange[] = [];
    if (parsedInput.changes.state !== undefined) {
        historyChanges.push({ eventType: 'state_change', fieldName: 'state', previousValue: previous.state, newValue: canonical.state });
    }
    await recordAdChanges(context, account, canonical.id, changedAt, historyChanges);

    return canonical;
};

const parseInput = <T>(schema: { safeParse: (input: unknown) => { success: boolean; data?: T; error?: { issues: unknown[] } } }, input: unknown, operationName: string): T => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
        throw new OperationError('INVALID_INPUT', `${operationName} input is invalid.`, { issues: parsed.error?.issues ?? [] });
    }
    return parsed.data as T;
};

const assertCampaignOwnership = async (context: OperationContext, account: ResolvedAccount, campaignId: string) => {
    const [ownedCampaign] = await context.db
        .select({ campaignId: campaign.campaignId })
        .from(campaign)
        .where(and(eq(campaign.campaignId, campaignId), eq(campaign.adProduct, 'SPONSORED_PRODUCTS'), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode)))
        .limit(1);

    if (!ownedCampaign) {
        throw new OperationError('RESOURCE_NOT_FOUND', 'Campaign not found in the requested Advertiser Account.', { campaignId });
    }
};

const findOwnedAdGroup = async (context: OperationContext, account: ResolvedAccount, adGroupId: string) => {
    const [owned] = await context.db
        .select({ row: adGroup })
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
    return owned?.row;
};

const assertTerminalStateTransition = (currentState: string, requestedState: CanonicalAdGroup['state'] | undefined, entityLabel: string) => {
    if (currentState === 'ARCHIVED' && requestedState !== undefined && requestedState !== 'ARCHIVED') {
        throw new OperationError('INVALID_INPUT', `${entityLabel} state is terminal once ARCHIVED.`, {
            currentState,
            requestedState,
        });
    }
};

const buildCreatePayload = (input: AdGroupCreateInput) => ({
    adProduct: 'SPONSORED_PRODUCTS',
    campaignId: input.campaignId,
    name: input.name,
    state: input.state,
    bid: { defaultBid: input.defaultBid },
});

const buildUpdatePayload = (adGroupId: string, changes: AdGroupUpdateChanges) => {
    const payload: AmazonRecord = { adGroupId };
    if (changes.state !== undefined) {
        payload.state = changes.state;
    }
    if (changes.defaultBid !== undefined) {
        payload.bid = { defaultBid: changes.defaultBid };
    }
    return payload;
};

const buildAdCreatePayload = (input: AdCreateInput) => ({
    adGroupId: input.adGroupId,
    adProduct: 'SPONSORED_PRODUCTS',
    adType: 'PRODUCT_AD',
    state: input.state,
    creative: {
        productCreative: {
            productCreativeSettings: {
                advertisedProduct: {
                    productIdType: 'ASIN',
                    productId: input.asin,
                },
            },
        },
    },
});

const buildAdUpdatePayload = (adId: string, changes: { state?: CanonicalAd['state'] }) => {
    const payload: AmazonRecord = { adId };
    if (changes.state !== undefined) {
        payload.state = changes.state;
    }
    return payload;
};

const mapCanonicalAdGroup = ({ amazonAdGroup, fallback }: { amazonAdGroup: AmazonRecord; fallback: CanonicalAdGroup }): CanonicalAdGroup => {
    const canonical = {
        id: readString(amazonAdGroup.adGroupId) ?? fallback.id,
        campaignId: readString(amazonAdGroup.campaignId) ?? fallback.campaignId,
        name: readString(amazonAdGroup.name) ?? fallback.name,
        state: resolveState(amazonAdGroup, fallback.state),
        deliveryStatus: resolveDeliveryStatus(amazonAdGroup, fallback.deliveryStatus),
        defaultBid: resolveDefaultBid(amazonAdGroup) ?? fallback.defaultBid,
    } satisfies CanonicalAdGroup;
    const parsed = canonicalAdGroupSchema.safeParse(canonical);
    if (!parsed.success) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned an invalid Ad group result.', {
            amazon: { message: 'Ad group response did not match the canonical Ad group shape.', issues: parsed.error.issues },
        });
    }
    return parsed.data;
};

const assertReturnedAdGroupIdentity = (canonical: CanonicalAdGroup, expected: { campaignId: string; adGroupId?: string }) => {
    if (canonical.campaignId !== expected.campaignId || (expected.adGroupId !== undefined && canonical.id !== expected.adGroupId)) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned an Ad group outside the requested ancestry.', {
            amazon: { campaignId: canonical.campaignId, adGroupId: canonical.id },
        });
    }
};

const mapArchiveAdGroup = (row: typeof adGroup.$inferSelect): CanonicalAdGroup => ({
    id: row.adGroupId,
    campaignId: row.campaignId,
    name: row.name,
    state: parseState(row.state, 'PAUSED'),
    deliveryStatus: row.deliveryStatus,
    defaultBid: parseMoney(row.bidAmount) ?? 0,
});

const mapCanonicalAd = ({ amazonAd, fallback }: { amazonAd: AmazonRecord; fallback: CanonicalAd }): CanonicalAd => {
    const canonical = {
        id: readString(amazonAd.adId) ?? fallback.id,
        campaignId: readString(amazonAd.campaignId) ?? fallback.campaignId,
        adGroupId: readString(amazonAd.adGroupId) ?? fallback.adGroupId,
        state: resolveAdState(amazonAd, fallback.state),
        deliveryStatus: resolveDeliveryStatus(amazonAd, fallback.deliveryStatus),
        asin: resolveAdAsin(amazonAd) ?? fallback.asin,
        productTitle: resolveProductTitle(amazonAd) ?? fallback.productTitle,
    } satisfies CanonicalAd;
    const parsed = canonicalAdSchema.safeParse(canonical);
    if (!parsed.success) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned an invalid Ad result.', {
            amazon: { message: 'Ad response did not match the canonical Ad shape.', issues: parsed.error.issues },
        });
    }
    return parsed.data;
};

const assertReturnedAdIdentity = (canonical: CanonicalAd, expected: { campaignId: string; adGroupId: string; adId?: string }) => {
    if (canonical.campaignId !== expected.campaignId || canonical.adGroupId !== expected.adGroupId || (expected.adId !== undefined && canonical.id !== expected.adId)) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned an Ad outside the requested ancestry.', {
            amazon: { campaignId: canonical.campaignId, adGroupId: canonical.adGroupId, adId: canonical.id },
        });
    }
};

const mapArchiveAd = (row: typeof ad.$inferSelect): CanonicalAd => ({
    id: row.adId,
    campaignId: row.campaignId,
    adGroupId: row.adGroupId,
    state: parseAdState(row.state, 'PAUSED'),
    deliveryStatus: row.deliveryStatus,
    asin: row.productAsin ?? '',
    productTitle: row.productTitle,
});

const reconcileAd = async (context: OperationContext, canonical: CanonicalAd, current: typeof ad.$inferSelect | undefined, changedAt: Date) => {
    const adType = 'PRODUCT_AD';
    const values = {
        adId: canonical.id,
        adGroupId: canonical.adGroupId,
        campaignId: canonical.campaignId,
        adProduct: 'SPONSORED_PRODUCTS',
        adType,
        state: canonical.state,
        deliveryStatus: canonical.deliveryStatus,
        productAsin: canonical.asin,
        productTitle: canonical.productTitle,
        creationDateTime: current?.creationDateTime ?? changedAt,
        lastUpdatedDateTime: changedAt,
    };

    if (current) {
        await context.db
            .update(ad)
            .set(values)
            .where(and(eq(ad.adId, current.adId), eq(ad.adGroupId, current.adGroupId)));
        return;
    }

    await context.db
        .insert(ad)
        .values({ id: canonical.id, ...values })
        .onConflictDoUpdate({ target: ad.adId, set: values });
};

type AdHistoryChange = {
    eventType: 'state_change';
    fieldName: 'state';
    previousValue: string | number | null | undefined;
    newValue: string | number | null | undefined;
};

const recordAdChanges = async (context: OperationContext, account: ResolvedAccount, adId: string, changedAt: Date, changes: AdHistoryChange[]) => {
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
                entityType: 'ad',
                entityId: adId,
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

const reconcileAdGroup = async (context: OperationContext, canonical: CanonicalAdGroup, current: typeof adGroup.$inferSelect | undefined, changedAt: Date) => {
    const values = {
        adGroupId: canonical.id,
        campaignId: canonical.campaignId,
        name: canonical.name,
        adProduct: 'SPONSORED_PRODUCTS',
        state: canonical.state,
        deliveryStatus: canonical.deliveryStatus,
        bidAmount: canonical.defaultBid.toFixed(2),
        creationDateTime: current?.creationDateTime ?? changedAt,
        lastUpdatedDateTime: changedAt,
    };

    if (current) {
        await context.db
            .update(adGroup)
            .set(values)
            .where(and(eq(adGroup.adGroupId, current.adGroupId), eq(adGroup.campaignId, current.campaignId)));
        return;
    }

    await context.db
        .insert(adGroup)
        .values({ id: canonical.id, ...values })
        .onConflictDoUpdate({ target: adGroup.adGroupId, set: values });
};

type AdGroupHistoryChange = {
    eventType: 'bid_change' | 'state_change';
    fieldName: string;
    previousValue: string | number | null | undefined;
    newValue: string | number | null | undefined;
};

const recordAdGroupChanges = async (context: OperationContext, account: ResolvedAccount, adGroupId: string, changedAt: Date, changes: AdGroupHistoryChange[]) => {
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
                entityType: 'adGroup',
                entityId: adGroupId,
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
    operation: 'createAdGroups' | 'deleteAdGroups' | 'updateAdGroups',
    input: { profileId: number; region: 'na' | 'eu' | 'fe'; adGroups: AmazonRecord[] }
) => {
    try {
        return (await context.amazonAds[operation](input)) as AdGroupResponse;
    } catch (error) {
        throw mapAmazonException(error, 'Ad group');
    }
};

const callAdsAmazon = async (context: OperationContext, operation: 'createAds' | 'deleteAds' | 'updateAds', input: { profileId: number; region: 'na' | 'eu' | 'fe'; ads: AmazonRecord[] }) => {
    try {
        return (await context.amazonAds[operation](input)) as AdResponse;
    } catch (error) {
        throw mapAmazonException(error, 'Ad');
    }
};

const assertArchiveOnlyPatch = (changes: Record<string, unknown>, entityLabel: string) => {
    if (changes.state === 'ARCHIVED' && Object.keys(changes).length > 1) {
        throw new OperationError('INVALID_INPUT', `${entityLabel} ARCHIVED state must be the only requested change.`, {
            fields: Object.keys(changes),
        });
    }
};

const extractAdGroup = (response: AdGroupResponse): AmazonRecord & { adGroupId: string } => {
    const error = response.error?.[0];
    if (error) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads rejected the Ad group operation.', { amazon: sanitizeAmazonError(error) });
    }

    const success = response.success?.[0];
    const value = success?.adGroup ?? success;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned no Ad group result.', { amazon: { message: 'Missing Ad group success payload.' } });
    }
    const adGroupId = readString((value as AmazonRecord).adGroupId);
    if (!adGroupId) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned an Ad group result without an ID.', { amazon: { message: 'Missing adGroupId.' } });
    }
    return value as AmazonRecord & { adGroupId: string };
};

const extractAd = (response: AdResponse): AmazonRecord & { adId: string } => {
    const error = response.error?.[0];
    if (error) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads rejected the Ad operation.', { amazon: sanitizeAmazonError(error) });
    }

    const success = response.success?.[0];
    const value = success?.ad ?? success;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned no Ad result.', { amazon: { message: 'Missing Ad success payload.' } });
    }
    const adId = readString((value as AmazonRecord).adId);
    if (!adId) {
        throw new OperationError('AMAZON_REJECTED', 'Amazon Ads returned an Ad result without an ID.', { amazon: { message: 'Missing adId.' } });
    }
    return value as AmazonRecord & { adId: string };
};

const mapAmazonException = (error: unknown, entityLabel: string) => {
    if (error instanceof OperationError) {
        return error;
    }

    const statusCode = readStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);
    const unavailable = statusCode === undefined ? AMAZON_UNAVAILABLE_MESSAGE_REGEX.test(message) || AMAZON_STATUS_CODE_REGEX.test(message) : [408, 409, 429, 500, 502, 503, 504].includes(statusCode);
    return new OperationError(
        unavailable ? 'AMAZON_UNAVAILABLE' : 'AMAZON_REJECTED',
        unavailable ? 'Amazon Ads was unavailable after the synchronous retry policy.' : `Amazon Ads rejected the ${entityLabel} operation.`,
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

const resolveState = (record: AmazonRecord, fallback: CanonicalAdGroup['state']) => {
    const value = record.state;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return parseState(readString((value as AmazonRecord).state), fallback);
    }
    return parseState(readString(value), fallback);
};

const resolveAdState = (record: AmazonRecord, fallback: CanonicalAd['state']) => {
    const value = record.state;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return parseAdState(readString((value as AmazonRecord).state), fallback);
    }
    return parseAdState(readString(value), fallback);
};

const parseState = (value: string | undefined, fallback: CanonicalAdGroup['state']) => {
    const parsed = adGroupStateSchema.safeParse(value);
    return parsed.success ? parsed.data : fallback;
};

const parseAdState = (value: string | undefined, fallback: CanonicalAd['state']) => {
    const parsed = adStateSchema.safeParse(value);
    return parsed.success ? parsed.data : fallback;
};

const resolveDeliveryStatus = (record: AmazonRecord, fallback: string) => {
    const status = record.status;
    if (status && typeof status === 'object' && !Array.isArray(status)) {
        const value = readString((status as AmazonRecord).deliveryStatus) ?? readString((status as AmazonRecord).delivery_status);
        if (value) {
            return value;
        }
    }
    return readString(record.deliveryStatus) ?? fallback;
};

const resolveDefaultBid = (record: AmazonRecord) => {
    const bid = record.bid;
    const values = bid && typeof bid === 'object' && !Array.isArray(bid) ? (bid as AmazonRecord) : undefined;
    return parseMoney(record.defaultBid ?? values?.defaultBid ?? (values?.bid as AmazonRecord | undefined)?.default_bid);
};

const resolveAdAsin = (record: AmazonRecord) => {
    const creative = record.creative;
    const creativeRecord = creative && typeof creative === 'object' && !Array.isArray(creative) ? (creative as AmazonRecord) : undefined;
    const productCreative = creativeRecord?.productCreative ?? creativeRecord?.product_creative;
    const productCreativeRecord = productCreative && typeof productCreative === 'object' && !Array.isArray(productCreative) ? (productCreative as AmazonRecord) : undefined;
    const settings = productCreativeRecord?.productCreativeSettings ?? productCreativeRecord?.product_creative_settings;
    const settingsRecord = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as AmazonRecord) : undefined;
    const advertisedProduct = settingsRecord?.advertisedProduct ?? settingsRecord?.advertised_product;
    const advertisedProductRecord = advertisedProduct && typeof advertisedProduct === 'object' && !Array.isArray(advertisedProduct) ? (advertisedProduct as AmazonRecord) : undefined;
    return readString(record.asin) ?? readString(record.productAsin) ?? readString(advertisedProductRecord?.productId) ?? readString(advertisedProductRecord?.product_id);
};

const resolveProductTitle = (record: AmazonRecord) => {
    const creative = record.creative;
    const creativeRecord = creative && typeof creative === 'object' && !Array.isArray(creative) ? (creative as AmazonRecord) : undefined;
    const productCreative = creativeRecord?.productCreative ?? creativeRecord?.product_creative;
    const productCreativeRecord = productCreative && typeof productCreative === 'object' && !Array.isArray(productCreative) ? (productCreative as AmazonRecord) : undefined;
    const settings = productCreativeRecord?.productCreativeSettings ?? productCreativeRecord?.product_creative_settings;
    const settingsRecord = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as AmazonRecord) : undefined;
    const advertisedProduct = settingsRecord?.advertisedProduct ?? settingsRecord?.advertised_product;
    const advertisedProductRecord = advertisedProduct && typeof advertisedProduct === 'object' && !Array.isArray(advertisedProduct) ? (advertisedProduct as AmazonRecord) : undefined;
    const title = readString(record.productTitle) ?? readString(advertisedProductRecord?.title) ?? readString(advertisedProductRecord?.productTitle) ?? readString(advertisedProductRecord?.name);
    return title ? title.trim() || null : null;
};

const inferDeliveryStatus = (state: CanonicalAdGroup['state']) => (state === 'ENABLED' ? 'DELIVERING' : 'NOT_DELIVERING');

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
