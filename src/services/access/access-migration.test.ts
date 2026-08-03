import { describe, expect, it } from 'vitest';
import { type AccessMigrationAudit, assertCutoverInvariants, createAccessMigrationPlan } from './access-migration';

const PLAN_DIGEST_REGEX = /^[a-f0-9]{64}$/;
const retainedClerkUserId = 'user_retained_subject';
const retiredClerkUserId = 'user_retired_subject';
const retainedMerchbaseUserId = 'mbu_retained_user';
const advertiserAccountIds = ['account-1', 'account-2', 'account-3', 'account-4'];
const retiredMembershipIds = ['retired-membership-1', 'retired-membership-2', 'retired-membership-3'];

const audit: AccessMigrationAudit = {
    advertiserAccountCount: 11,
    advertiserAccountIds,
    legacyKeyAccessRows: advertiserAccountIds.map(adsAccountId => ({ adsAccountId, clerkUserId: retainedClerkUserId })),
    legacyKeyAccessRowCount: 4,
    legacyKeyCount: 1,
    legacyKeys: [{ clerkUserId: retainedClerkUserId, id: 'legacy-key-1' }],
    memberships: [
        { adsAccountId: 'account-1', clerkUserId: retainedClerkUserId, id: 'retained-membership-1' },
        { adsAccountId: 'account-2', clerkUserId: retainedClerkUserId, id: 'retained-membership-2' },
        { adsAccountId: 'account-3', clerkUserId: retainedClerkUserId, id: 'retained-membership-3' },
        { adsAccountId: 'account-4', clerkUserId: retainedClerkUserId, id: 'retained-membership-4' },
        { adsAccountId: 'account-2', clerkUserId: retiredClerkUserId, id: retiredMembershipIds[0] },
        { adsAccountId: 'account-3', clerkUserId: retiredClerkUserId, id: retiredMembershipIds[1] },
        { adsAccountId: 'account-4', clerkUserId: retiredClerkUserId, id: retiredMembershipIds[2] },
    ],
    preferences: [{ clerkUserId: retainedClerkUserId, selectedAdsAccountId: 'account-1', selectedProfileId: 'profile-1' }],
    tombstonedSubjectCleanup: {
        clerkLookupStatus: 'not_found',
        cleanupKind: 'deleted_subject_duplicate_memberships',
        retiredClerkUserId,
        retiredLegacyKeyAccessRowCount: 0,
        retiredLegacyKeyCount: 0,
        retiredMembershipIds,
        retiredPreferenceCount: 0,
        retainedClerkUserId,
        retainedMerchbaseUserId,
        stableUserResolution: 'clerk_public_metadata',
    },
};

describe('tombstoned-subject access migration plan', () => {
    it('plans four retained mappings and preserves effective access and preferences', () => {
        const plan = createAccessMigrationPlan(audit);

        expect(plan.membershipMappings).toEqual([
            { adsAccountId: 'account-1', id: 'retained-membership-1', merchbaseUserId: retainedMerchbaseUserId },
            { adsAccountId: 'account-2', id: 'retained-membership-2', merchbaseUserId: retainedMerchbaseUserId },
            { adsAccountId: 'account-3', id: 'retained-membership-3', merchbaseUserId: retainedMerchbaseUserId },
            { adsAccountId: 'account-4', id: 'retained-membership-4', merchbaseUserId: retainedMerchbaseUserId },
        ]);
        expect(plan.retiredMembershipIds).toEqual([...retiredMembershipIds].sort());
        expect(plan.retiredMembershipAccountIds).toEqual(['account-2', 'account-3', 'account-4']);
        expect(plan.preferenceMappings).toEqual([{ merchbaseUserId: retainedMerchbaseUserId, selectedAdsAccountId: 'account-1', selectedProfileId: 'profile-1' }]);
        expect(plan.legacyKeyAccessMappings).toHaveLength(4);
        expect(plan.preservedFormerLegacyKeyScopeCount).toBe(4);
        expect(plan.sourceCounts).toEqual({
            advertiserAccountCount: 11,
            advertiserAccountIdCount: 4,
            clerkSubjectCount: 2,
            legacyKeyAccessCount: 4,
            legacyKeyCount: 1,
            membershipCount: 7,
            preferenceCount: 1,
        });
        expect(plan.targetCounts).toEqual({
            advertiserAccountCount: 11,
            advertiserAccountIdCount: 4,
            clerkSubjectCount: 0,
            formerLegacyKeyScopeCount: 4,
            legacyKeyAccessCount: 4,
            legacyKeyCount: 0,
            membershipCount: 4,
            preferenceCount: 1,
            stableUserCount: 1,
        });
        expect(plan.planDigest).toMatch(PLAN_DIGEST_REGEX);

        assertCutoverInvariants(plan, advertiserAccountIds);
    });

    it('requires the one explicit deleted-subject cleanup contract and exact retired rows', () => {
        expect(() => createAccessMigrationPlan({ ...audit, tombstonedSubjectCleanup: undefined as never })).toThrow('retired Clerk subject was not verified');
        expect(() =>
            createAccessMigrationPlan({
                ...audit,
                tombstonedSubjectCleanup: { ...audit.tombstonedSubjectCleanup, stableUserResolution: 'email' as never },
            })
        ).toThrow('retired Clerk subject was not verified');
        expect(() =>
            createAccessMigrationPlan({
                ...audit,
                tombstonedSubjectCleanup: { ...audit.tombstonedSubjectCleanup, retiredMembershipIds: ['retired-membership-1', 'retired-membership-2'] },
            })
        ).toThrow('exactly three unique retired membership row IDs');
        expect(() =>
            createAccessMigrationPlan({
                ...audit,
                memberships: audit.memberships.map(row => (row.id === retiredMembershipIds[0] ? { ...row, adsAccountId: 'account-5' } : row)),
            })
        ).toThrow('references an advertiser account outside');
    });

    it('fails closed on coverage, retained collisions, ownership, and inventory drift', () => {
        expect(() =>
            createAccessMigrationPlan({
                ...audit,
                memberships: audit.memberships.map(row => (row.id === 'retained-membership-4' ? { ...row, adsAccountId: 'account-3' } : row)),
            })
        ).toThrow('retained membership rows collide');

        expect(() =>
            createAccessMigrationPlan({
                ...audit,
                preferences: [{ ...audit.preferences[0], clerkUserId: retiredClerkUserId }],
            })
        ).toThrow('preference ownership');
        expect(() =>
            createAccessMigrationPlan({
                ...audit,
                legacyKeys: [{ ...audit.legacyKeys[0], clerkUserId: retiredClerkUserId }],
            })
        ).toThrow('legacy key ownership');
        expect(() =>
            createAccessMigrationPlan({
                ...audit,
                legacyKeyAccessRows: [{ ...audit.legacyKeyAccessRows[0], clerkUserId: retiredClerkUserId }, ...audit.legacyKeyAccessRows.slice(1)],
            })
        ).toThrow('legacy key scopes');
        expect(() => createAccessMigrationPlan({ ...audit, advertiserAccountCount: 10 })).toThrow('inventory changed');
        expect(() => createAccessMigrationPlan({ ...audit, memberships: audit.memberships.slice(0, 6) })).toThrow('membership inventory changed');
    });

    it('rejects missing account coverage and source count drift before creating a plan', () => {
        expect(() => createAccessMigrationPlan({ ...audit, advertiserAccountIds: ['account-1', 'account-2', 'account-3', 'account-5'] })).toThrow('references an advertiser account outside');
        expect(() =>
            createAccessMigrationPlan({
                ...audit,
                preferences: [{ ...audit.preferences[0], selectedAdsAccountId: 'account-5' }],
            })
        ).toThrow('selected preference account lacks retained membership coverage');
        expect(() => createAccessMigrationPlan({ ...audit, legacyKeyCount: 0 })).toThrow('legacy credential inventory changed');
        expect(() => createAccessMigrationPlan({ ...audit, legacyKeyAccessRowCount: 3 })).toThrow('legacy credential inventory changed');
        expect(() => createAccessMigrationPlan({ ...audit, preferences: [] })).toThrow('preference row count changed');
    });
});
