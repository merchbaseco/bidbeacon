export type AmsAccountLookup = {
    findByAdGroupId: (adGroupId: string) => Promise<Array<string | null>>;
    findByAdvertiserId: (advertiserId: string) => Promise<Array<string | null>>;
    findByCampaignId: (campaignId: string) => Promise<Array<string | null>>;
};

export type AmsAccountResolutionReason = 'ambiguous_account' | 'unknown_account' | 'access_unavailable';

export class AmsAccountResolutionError extends Error {
    readonly reason: AmsAccountResolutionReason;

    constructor(reason: AmsAccountResolutionReason) {
        super('AMS message account resolution failed closed.');
        this.name = 'AmsAccountResolutionError';
        this.reason = reason;
    }
}

const DIRECT_ACCOUNT_DATASETS = ['sp-traffic', 'sp-conversion', 'budget-usage'];

export const resolveAmsAccountIds = async (payload: unknown, lookup: AmsAccountLookup): Promise<string[]> => {
    const records = Array.isArray(payload) ? payload : [payload];
    if (records.length === 0) {
        throw new AmsAccountResolutionError('unknown_account');
    }

    const accountIds = new Set<string>();
    for (const record of records) {
        accountIds.add(await resolveSingleAmsAccountId(record, lookup));
    }

    return [...accountIds].sort();
};

const resolveSingleAmsAccountId = async (payload: unknown, lookup: AmsAccountLookup): Promise<string> => {
    if (!isRecord(payload)) {
        throw new AmsAccountResolutionError('unknown_account');
    }

    const datasetId = getString(payload.dataset_id);
    if (!datasetId) {
        throw new AmsAccountResolutionError('unknown_account');
    }

    if (DIRECT_ACCOUNT_DATASETS.some(prefix => datasetId.startsWith(prefix))) {
        const advertiserId = getString(payload.advertiser_id);
        const marketplaceId = getString(payload.marketplace_id);
        if (!(advertiserId && marketplaceId)) {
            throw new AmsAccountResolutionError('unknown_account');
        }
        return resolveCandidates(() => lookup.findByAdvertiserId(advertiserId));
    }

    if (datasetId.startsWith('ads-campaign-management-ads')) {
        const candidateAccountIds: Array<string | null> = [];
        const campaignId = getString(payload.campaign_id);
        const adGroupId = getString(payload.ad_group_id);
        if (campaignId) {
            candidateAccountIds.push(await resolveCandidates(() => lookup.findByCampaignId(campaignId)));
        }
        if (adGroupId) {
            candidateAccountIds.push(await resolveCandidates(() => lookup.findByAdGroupId(adGroupId)));
        }
        if (candidateAccountIds.length === 0) {
            throw new AmsAccountResolutionError('unknown_account');
        }
        return resolveCandidateValues(candidateAccountIds);
    }

    if (datasetId.startsWith('ads-campaign-management-campaigns') || datasetId.startsWith('ads-campaign-management-adgroups') || datasetId.startsWith('ads-campaign-management-targets')) {
        const campaignId = getString(payload.campaign_id);
        if (!campaignId) {
            throw new AmsAccountResolutionError('unknown_account');
        }
        return resolveCandidates(() => lookup.findByCampaignId(campaignId));
    }

    throw new AmsAccountResolutionError('unknown_account');
};

const resolveCandidates = async (load: () => Promise<Array<string | null>>): Promise<string> => {
    try {
        return resolveCandidateValues(await load());
    } catch (error) {
        if (error instanceof AmsAccountResolutionError) {
            throw error;
        }
        throw new AmsAccountResolutionError('access_unavailable');
    }
};

const resolveCandidateValues = (candidates: Array<string | null>): string => {
    if (candidates.length === 0 || candidates.some(candidate => typeof candidate !== 'string' || candidate.length === 0)) {
        throw new AmsAccountResolutionError('unknown_account');
    }

    const accountIds = new Set(candidates);
    if (accountIds.size !== 1) {
        throw new AmsAccountResolutionError('ambiguous_account');
    }

    return candidates[0];
};

const getString = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
