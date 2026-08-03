import { createHash } from 'node:crypto';

export const BIDBEACON_CUTOVER_INVARIANTS = {
    advertiserAccountCount: 11,
    advertiserAccountIdCount: 4,
    legacyKeyAccessRowCount: 4,
    legacyKeyCount: 1,
    membershipRowCount: 7,
    preferenceRowCount: 1,
    clerkSubjectCount: 2,
    targetMembershipRowCount: 4,
    targetStableUserCount: 1,
} as const;

export const BIDBEACON_TOMBSTONED_SUBJECT_CLEANUP_INVARIANTS = {
    cleanupKind: 'deleted_subject_duplicate_memberships',
    clerkLookupStatus: 'not_found',
    retiredMembershipCount: 3,
    retiredPreferenceCount: 0,
    retiredLegacyKeyCount: 0,
    retiredLegacyKeyAccessRowCount: 0,
} as const;

export type LegacyMembership = {
    adsAccountId: string;
    clerkUserId: string;
    id: string;
};

export type LegacyPreference = {
    clerkUserId: string;
    selectedAdsAccountId: string | null;
    selectedProfileId: string | null;
};

export type LegacyKey = {
    clerkUserId: string;
    id: string;
};

export type LegacyKeyAccess = {
    adsAccountId: string;
    clerkUserId: string;
};

export type TombstonedSubjectCleanupAudit = {
    cleanupKind: 'deleted_subject_duplicate_memberships';
    clerkLookupStatus: 'not_found';
    retiredClerkUserId: string;
    retiredLegacyKeyAccessRowCount: number;
    retiredLegacyKeyCount: number;
    retiredMembershipIds: string[];
    retiredPreferenceCount: number;
    retainedClerkUserId: string;
    retainedMerchbaseUserId: string;
    stableUserResolution: 'clerk_public_metadata';
};

export type AccessMigrationAudit = {
    advertiserAccountCount: number;
    advertiserAccountIds: string[];
    legacyKeyAccessRows: LegacyKeyAccess[];
    legacyKeyAccessRowCount: number;
    legacyKeyCount: number;
    legacyKeys: LegacyKey[];
    memberships: LegacyMembership[];
    preferences: LegacyPreference[];
    tombstonedSubjectCleanup: TombstonedSubjectCleanupAudit;
};

type AccessMigrationCounts = {
    advertiserAccountCount: number;
    advertiserAccountIdCount: number;
    clerkSubjectCount: number;
    legacyKeyAccessCount: number;
    legacyKeyCount: number;
    membershipCount: number;
    preferenceCount: number;
};

export type AccessMigrationPlan = {
    legacyKeyAccessMappings: Array<{
        adsAccountId: string;
        merchbaseUserId: string;
    }>;
    membershipMappings: Array<{
        adsAccountId: string;
        id: string;
        merchbaseUserId: string;
    }>;
    planDigest: string;
    preferenceMappings: Array<{
        merchbaseUserId: string;
        selectedAdsAccountId: string | null;
        selectedProfileId: string | null;
    }>;
    preservedFormerLegacyKeyScopeCount: number;
    retiredMembershipAccountIds: string[];
    retiredMembershipIds: string[];
    sourceCounts: AccessMigrationCounts;
    targetCounts: AccessMigrationCounts & {
        formerLegacyKeyScopeCount: number;
        stableUserCount: number;
    };
};

type AccessMigrationPlanData = Omit<AccessMigrationPlan, 'planDigest'>;

export const createAccessMigrationPlan = (input: AccessMigrationAudit): AccessMigrationPlan => {
    assertSourceAudit(input);

    const cleanup = input.tombstonedSubjectCleanup;
    const retiredMembershipIdSet = new Set(cleanup.retiredMembershipIds);
    const retiredMemberships = input.memberships.filter(row => retiredMembershipIdSet.has(row.id));
    const retainedMemberships = input.memberships.filter(row => !retiredMembershipIdSet.has(row.id));
    const retainedAccountIds = new Set(retainedMemberships.map(row => row.adsAccountId));
    const retiredMembershipAccountIds = retiredMemberships.map(row => row.adsAccountId).sort();

    if (retiredMemberships.length !== BIDBEACON_TOMBSTONED_SUBJECT_CLEANUP_INVARIANTS.retiredMembershipCount) {
        throw new Error('Cutover blocked: retired membership IDs do not identify exactly the audited retired rows.');
    }
    if (new Set(retiredMembershipAccountIds).size !== BIDBEACON_TOMBSTONED_SUBJECT_CLEANUP_INVARIANTS.retiredMembershipCount) {
        throw new Error('Cutover blocked: retired membership rows are not three distinct duplicate account memberships.');
    }
    if (retiredMemberships.some(row => !retainedAccountIds.has(row.adsAccountId))) {
        throw new Error('Cutover blocked: a retired membership is not duplicated by the retained subject.');
    }
    if (retainedMemberships.some(row => row.clerkUserId !== cleanup.retainedClerkUserId)) {
        throw new Error('Cutover blocked: a retained membership belongs to an unexpected Clerk subject.');
    }
    if (new Set(retainedMemberships.map(row => row.adsAccountId)).size !== retainedMemberships.length) {
        throw new Error('Cutover blocked: retained membership rows collide on a stable-user/account pair.');
    }

    const membershipMappings = retainedMemberships
        .map(row => ({
            adsAccountId: row.adsAccountId,
            id: row.id,
            merchbaseUserId: cleanup.retainedMerchbaseUserId,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));

    const legacyKeyAccessMappings = input.legacyKeyAccessRows
        .map(row => ({
            adsAccountId: row.adsAccountId,
            merchbaseUserId: cleanup.retainedMerchbaseUserId,
        }))
        .sort((left, right) => `${left.merchbaseUserId}:${left.adsAccountId}`.localeCompare(`${right.merchbaseUserId}:${right.adsAccountId}`));

    assertKeyAccessPreserved(membershipMappings, legacyKeyAccessMappings);

    const preference = input.preferences[0];
    if (preference.selectedAdsAccountId && !retainedAccountIds.has(preference.selectedAdsAccountId)) {
        throw new Error('Cutover blocked: the selected preference account lacks retained membership coverage.');
    }
    const preferenceMappings = [
        {
            merchbaseUserId: cleanup.retainedMerchbaseUserId,
            selectedAdsAccountId: preference.selectedAdsAccountId,
            selectedProfileId: preference.selectedProfileId,
        },
    ];

    const planData = {
        legacyKeyAccessMappings,
        membershipMappings,
        preferenceMappings,
        preservedFormerLegacyKeyScopeCount: legacyKeyAccessMappings.length,
        retiredMembershipAccountIds,
        retiredMembershipIds: [...retiredMembershipIdSet].sort(),
        sourceCounts: {
            advertiserAccountCount: input.advertiserAccountCount,
            advertiserAccountIdCount: input.advertiserAccountIds.length,
            clerkSubjectCount: new Set(input.memberships.map(row => row.clerkUserId)).size,
            legacyKeyAccessCount: input.legacyKeyAccessRowCount,
            legacyKeyCount: input.legacyKeyCount,
            membershipCount: input.memberships.length,
            preferenceCount: input.preferences.length,
        },
        targetCounts: {
            advertiserAccountCount: input.advertiserAccountCount,
            advertiserAccountIdCount: input.advertiserAccountIds.length,
            clerkSubjectCount: 0,
            formerLegacyKeyScopeCount: legacyKeyAccessMappings.length,
            legacyKeyAccessCount: legacyKeyAccessMappings.length,
            legacyKeyCount: 0,
            membershipCount: membershipMappings.length,
            preferenceCount: preferenceMappings.length,
            stableUserCount: 1,
        },
    } satisfies AccessMigrationPlanData;

    assertCutoverInvariants(planData, input.advertiserAccountIds);

    return {
        ...planData,
        planDigest: createHash('sha256').update(JSON.stringify(planData)).digest('hex'),
    };
};

export const assertCutoverInvariants = (plan: AccessMigrationPlanData | AccessMigrationPlan, advertiserAccountIds: string[]) => {
    const { sourceCounts, targetCounts } = plan;
    if (sourceCounts.advertiserAccountCount !== BIDBEACON_CUTOVER_INVARIANTS.advertiserAccountCount) {
        throw new Error('Cutover blocked: advertiser-account row count changed.');
    }
    if (sourceCounts.advertiserAccountIdCount !== BIDBEACON_CUTOVER_INVARIANTS.advertiserAccountIdCount) {
        throw new Error('Cutover blocked: distinct advertiser-account coverage changed.');
    }
    if (sourceCounts.membershipCount !== BIDBEACON_CUTOVER_INVARIANTS.membershipRowCount) {
        throw new Error('Cutover blocked: membership row count changed.');
    }
    if (sourceCounts.clerkSubjectCount !== BIDBEACON_CUTOVER_INVARIANTS.clerkSubjectCount) {
        throw new Error('Cutover blocked: source Clerk-subject count changed.');
    }
    if (sourceCounts.preferenceCount !== BIDBEACON_CUTOVER_INVARIANTS.preferenceRowCount) {
        throw new Error('Cutover blocked: preference row count changed.');
    }
    if (sourceCounts.legacyKeyCount !== BIDBEACON_CUTOVER_INVARIANTS.legacyKeyCount || sourceCounts.legacyKeyAccessCount !== BIDBEACON_CUTOVER_INVARIANTS.legacyKeyAccessRowCount) {
        throw new Error('Cutover blocked: legacy credential inventory changed.');
    }
    if (targetCounts.membershipCount !== BIDBEACON_CUTOVER_INVARIANTS.targetMembershipRowCount) {
        throw new Error('Cutover blocked: target retained membership count changed.');
    }
    if (targetCounts.stableUserCount !== BIDBEACON_CUTOVER_INVARIANTS.targetStableUserCount) {
        throw new Error('Cutover blocked: target stable-user count changed.');
    }
    if (targetCounts.preferenceCount !== sourceCounts.preferenceCount) {
        throw new Error('Cutover blocked: preference preservation count changed.');
    }
    if (targetCounts.formerLegacyKeyScopeCount !== sourceCounts.legacyKeyAccessCount) {
        throw new Error('Cutover blocked: former legacy key-scope coverage changed.');
    }
    if (targetCounts.legacyKeyCount !== 0) {
        throw new Error('Cutover blocked: the retired local key is still present in the target plan.');
    }

    const accountIds = new Set(advertiserAccountIds);
    const targetAccountIds = new Set(plan.membershipMappings.map(row => row.adsAccountId));
    if (accountIds.size !== advertiserAccountIds.length || [...accountIds].some(accountId => !targetAccountIds.has(accountId))) {
        throw new Error('Cutover blocked: target membership mappings do not cover every advertiser account ID.');
    }
    if (targetAccountIds.size !== targetCounts.membershipCount) {
        throw new Error('Cutover blocked: target retained membership rows collide on account coverage.');
    }

    const membershipKeys = new Set(plan.membershipMappings.map(row => `${row.merchbaseUserId}:${row.adsAccountId}`));
    if (plan.legacyKeyAccessMappings.some(row => !membershipKeys.has(`${row.merchbaseUserId}:${row.adsAccountId}`))) {
        throw new Error('Cutover blocked: a former legacy key scope would lose stable-user access.');
    }
};

const assertSourceAudit = (input: AccessMigrationAudit) => {
    const cleanup = input.tombstonedSubjectCleanup;
    if (
        !cleanup ||
        cleanup.cleanupKind !== BIDBEACON_TOMBSTONED_SUBJECT_CLEANUP_INVARIANTS.cleanupKind ||
        cleanup.clerkLookupStatus !== BIDBEACON_TOMBSTONED_SUBJECT_CLEANUP_INVARIANTS.clerkLookupStatus ||
        cleanup.stableUserResolution !== 'clerk_public_metadata'
    ) {
        throw new Error('Cutover blocked: the retired Clerk subject was not verified as tombstoned.');
    }
    if (
        !(cleanup.retiredClerkUserId.startsWith('user_') && cleanup.retainedClerkUserId.startsWith('user_') && cleanup.retainedMerchbaseUserId.startsWith('mbu_')) ||
        cleanup.retiredClerkUserId === cleanup.retainedClerkUserId
    ) {
        throw new Error('Cutover blocked: the audit must identify one distinct retired Clerk subject and one retained stable-user mapping.');
    }
    if (
        cleanup.retiredMembershipIds.length !== BIDBEACON_TOMBSTONED_SUBJECT_CLEANUP_INVARIANTS.retiredMembershipCount ||
        new Set(cleanup.retiredMembershipIds).size !== cleanup.retiredMembershipIds.length
    ) {
        throw new Error('Cutover blocked: the audit must identify exactly three unique retired membership row IDs.');
    }
    if (
        cleanup.retiredPreferenceCount !== BIDBEACON_TOMBSTONED_SUBJECT_CLEANUP_INVARIANTS.retiredPreferenceCount ||
        cleanup.retiredLegacyKeyCount !== BIDBEACON_TOMBSTONED_SUBJECT_CLEANUP_INVARIANTS.retiredLegacyKeyCount ||
        cleanup.retiredLegacyKeyAccessRowCount !== BIDBEACON_TOMBSTONED_SUBJECT_CLEANUP_INVARIANTS.retiredLegacyKeyAccessRowCount
    ) {
        throw new Error('Cutover blocked: the retired subject owns a preference or legacy credential.');
    }

    if (
        input.advertiserAccountCount !== BIDBEACON_CUTOVER_INVARIANTS.advertiserAccountCount ||
        input.advertiserAccountIds.length !== BIDBEACON_CUTOVER_INVARIANTS.advertiserAccountIdCount ||
        new Set(input.advertiserAccountIds).size !== input.advertiserAccountIds.length
    ) {
        throw new Error('Cutover blocked: advertiser-account inventory changed or is not distinct.');
    }
    if (input.memberships.length !== BIDBEACON_CUTOVER_INVARIANTS.membershipRowCount || new Set(input.memberships.map(row => row.id)).size !== input.memberships.length) {
        throw new Error('Cutover blocked: membership inventory changed or contains duplicate row IDs.');
    }
    if (input.legacyKeyCount !== BIDBEACON_CUTOVER_INVARIANTS.legacyKeyCount || input.legacyKeyAccessRowCount !== BIDBEACON_CUTOVER_INVARIANTS.legacyKeyAccessRowCount) {
        throw new Error('Cutover blocked: legacy credential inventory changed.');
    }

    const sourceSubjects = new Set(input.memberships.map(row => row.clerkUserId));
    if (!(sourceSubjects.has(cleanup.retainedClerkUserId) && sourceSubjects.has(cleanup.retiredClerkUserId)) || sourceSubjects.size !== BIDBEACON_CUTOVER_INVARIANTS.clerkSubjectCount) {
        throw new Error('Cutover blocked: source memberships do not contain exactly the retained and tombstoned subjects.');
    }

    const retiredMembershipIds = new Set(cleanup.retiredMembershipIds);
    const retiredMemberships = input.memberships.filter(row => retiredMembershipIds.has(row.id));
    if (retiredMemberships.length !== cleanup.retiredMembershipIds.length || retiredMemberships.some(row => row.clerkUserId !== cleanup.retiredClerkUserId)) {
        throw new Error('Cutover blocked: retired membership IDs do not belong to the verified tombstoned subject.');
    }
    const retainedMemberships = input.memberships.filter(row => !retiredMembershipIds.has(row.id));
    if (retainedMemberships.length !== BIDBEACON_CUTOVER_INVARIANTS.targetMembershipRowCount || retainedMemberships.some(row => row.clerkUserId !== cleanup.retainedClerkUserId)) {
        throw new Error('Cutover blocked: retained membership inventory is not exactly four rows for the active subject.');
    }

    const accountIds = new Set(input.advertiserAccountIds);
    if (input.memberships.some(row => !accountIds.has(row.adsAccountId))) {
        throw new Error('Cutover blocked: a membership references an advertiser account outside the audited inventory.');
    }
    if (new Set(retainedMemberships.map(row => row.adsAccountId)).size !== retainedMemberships.length) {
        throw new Error('Cutover blocked: retained membership rows collide on an advertiser account.');
    }

    if (input.preferences.length !== BIDBEACON_CUTOVER_INVARIANTS.preferenceRowCount) {
        throw new Error('Cutover blocked: preference row count changed.');
    }
    if (input.preferences.some(row => row.clerkUserId !== cleanup.retainedClerkUserId)) {
        throw new Error('Cutover blocked: preference ownership is not exclusively retained by the active subject.');
    }
    if (input.legacyKeys.length !== input.legacyKeyCount) {
        throw new Error('Cutover blocked: legacy key inventory does not match its declared count.');
    }
    if (input.legacyKeys.some(key => key.clerkUserId !== cleanup.retainedClerkUserId)) {
        throw new Error('Cutover blocked: legacy key ownership is not exclusively retained by the active subject.');
    }
    if (input.legacyKeyAccessRows.length !== input.legacyKeyAccessRowCount) {
        throw new Error('Cutover blocked: legacy key-access inventory does not match its declared count.');
    }
    if (input.legacyKeyAccessRows.some(row => row.clerkUserId !== cleanup.retainedClerkUserId)) {
        throw new Error('Cutover blocked: legacy key scopes are not exclusively owned by the active subject.');
    }
    if (new Set(input.legacyKeyAccessRows.map(row => row.adsAccountId)).size !== input.legacyKeyAccessRows.length) {
        throw new Error('Cutover blocked: legacy key scopes contain duplicate account rows.');
    }
};

const assertKeyAccessPreserved = (memberships: AccessMigrationPlan['membershipMappings'], keyAccessRows: AccessMigrationPlan['legacyKeyAccessMappings']) => {
    const membershipKeys = new Set(memberships.map(row => `${row.merchbaseUserId}:${row.adsAccountId}`));
    if (keyAccessRows.some(row => !membershipKeys.has(`${row.merchbaseUserId}:${row.adsAccountId}`))) {
        throw new Error('Cutover blocked: a former legacy key scope would lose its stable-user membership.');
    }
};
