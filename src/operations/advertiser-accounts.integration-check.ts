// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps
// this file out of the default Vitest discovery (`vitest.config.ts` includes
// `*.test.ts` only) on purpose: every test here boots a WebAssembly Postgres
// and applies the production migrations, which costs seconds per test and far
// more on a cold CI runner. It runs in the `test:integration` lane instead, via
// `vitest.integration.config.ts`. `bun run check` runs both lanes; the Quality
// workflow runs `check:fast`, the fast lane only. Add new database-backed
// suites with the same suffix — the lane is structural, with no list to keep.
import { applyAccessSnapshot, createCloudflareServiceAccess, type CloudflareAssertion } from '@merchbaseco/access';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advertiserAccount, userAccountAccess, userPreferences } from '@/db/schema';
import { createAccessProjectionStore } from '@/services/access/access-projection-store';
import { resolveBidBeaconPrincipal } from '@/services/access/bidbeacon-access';
import { listAdvertiserAccounts, resolveAdvertiserAccount } from './advertiser-accounts';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext } from './operation-context';
import { accountScopedInputSchema } from './operation-schema';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import { buildAdvertiserAccount } from './testing/fixtures';

vi.mock('@/db/index', () => ({ db: {} }));

const usAccountId = '00000000-0000-4000-8000-000000000001';
const caAccountId = '00000000-0000-4000-8000-000000000002';
const inaccessibleAccountId = '00000000-0000-4000-8000-000000000003';
const issuer = 'https://merchbase-test.cloudflareaccess.com';
const authorityOrigin = 'https://access-internal.test';

describe('advertiser-account operations', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it.each(['session', 'api_key'] as const)('lists only the caller-accessible marketplace-specific accounts for a %s principal', async credentialKind => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values([
            buildAdvertiserAccount({
                id: usAccountId,
                adsAccountId: 'shared-amazon-account',
                accountName: 'US advertiser',
                countryCode: 'US',
                profileId: '1001',
            }),
            buildAdvertiserAccount({
                id: caAccountId,
                adsAccountId: 'shared-amazon-account',
                accountName: 'Canada advertiser',
                countryCode: 'CA',
                profileId: '1002',
            }),
            buildAdvertiserAccount({
                id: inaccessibleAccountId,
                adsAccountId: 'other-amazon-account',
                accountName: 'Other advertiser',
                countryCode: 'US',
                profileId: '2001',
            }),
        ]);
        await database.db.insert(userAccountAccess).values([
            {
                advertiserAccountId: caAccountId,
                adsAccountId: 'shared-amazon-account',
                merchbaseUserId: 'mbu_operation_test',
            },
            {
                advertiserAccountId: usAccountId,
                adsAccountId: 'shared-amazon-account',
                merchbaseUserId: 'mbu_operation_test',
            },
        ]);
        await database.db.insert(userPreferences).values({
            merchbaseUserId: 'mbu_operation_test',
            selectedAdsAccountId: 'other-amazon-account',
            selectedProfileId: '2001',
        });

        const authorization = await authorizeOperationPrincipal(database, credentialKind);
        expect(authorization.verify).toHaveBeenCalledWith(authorization.credential);
        const context = createOperationContext({
            amazonAds: createFakeAmazonAdsGateway(),
            db: database.db,
            principal: authorization.principal,
        });

        await expect(listAdvertiserAccounts(context, {})).resolves.toEqual({
            accounts: [
                {
                    amazonAdsAccountId: 'shared-amazon-account',
                    countryCode: 'CA',
                    currency: 'CAD',
                    id: caAccountId,
                    marketplaceId: 'A2EUQ1WTGCTBG2',
                    name: 'Canada advertiser',
                    profileId: '1002',
                    timezone: 'America/Los_Angeles',
                },
                {
                    amazonAdsAccountId: 'shared-amazon-account',
                    countryCode: 'US',
                    currency: 'USD',
                    id: usAccountId,
                    marketplaceId: 'ATVPDKIKX0DER',
                    name: 'US advertiser',
                    profileId: '1001',
                    timezone: 'America/Los_Angeles',
                },
            ],
        });
    });

    it('authorizes only an explicit BidBeacon account UUID and rejects Amazon routing identifiers', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdvertiserAccount({ id: usAccountId }));
        const context = createOperationContext({
            amazonAds: createFakeAmazonAdsGateway(),
            db: database.db,
            principal: {
                accessibleAccountIds: [usAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'mbu_operation_test',
            },
        });

        await expect(resolveAdvertiserAccount(context, { accountId: usAccountId })).resolves.toMatchObject({ id: usAccountId });
        await expect(resolveAdvertiserAccount(context, { accountId: inaccessibleAccountId })).rejects.toMatchObject({ code: 'ACCOUNT_ACCESS_DENIED' });
        await expect(resolveAdvertiserAccount(context, { accountId: 'amzn1.ads-account.g.legacy' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(listAdvertiserAccounts(context, { accountId: usAccountId })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        expect(() => accountScopedInputSchema.parse({ accountId: usAccountId, countryCode: 'US' })).toThrow();
    });

    it('requires shared authentication for account discovery', async () => {
        const context = createOperationContext({
            amazonAds: createFakeAmazonAdsGateway(),
            db: {} as never,
        });

        await expect(listAdvertiserAccounts(context, {})).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    });
});

const authorizeOperationPrincipal = async (database: TestDatabase, credentialKind: 'api_key' | 'session') => {
    const credential = credentialKind === 'api_key' ? 'ak_operation_test' : 'session.jwt.token';
    const now = Date.now();
    const subject = credentialKind === 'api_key' ? 'key_operation_test' : 'person_operation_test';
    const verified: CloudflareAssertion =
        credentialKind === 'api_key'
            ? { clientId: subject, expiresAt: now + 60_000, issuedAt: now, issuer, kind: 'machine' }
            : { expiresAt: now + 60_000, issuedAt: now, issuer, kind: 'person', subject };
    const verifier = { verify: vi.fn().mockResolvedValue(verified) };
    const projections = createAccessProjectionStore(database.db as never, authorityOrigin);
    await applyAccessSnapshot({
        authorityOrigin,
        issuer,
        projections,
        service: 'bidbeacon',
        snapshot: {
            access: 'granted',
            accessValidUntil: null,
            eventId: `operation-${credentialKind}`,
            identities: [
                {
                    ...(credentialKind === 'api_key' ? { expiresAt: null, kind: 'api_key' as const } : { kind: 'person' as const }),
                    state: 'active',
                    subject,
                },
            ],
            issuer,
            merchbaseUserId: 'mbu_operation_test',
            service: 'bidbeacon',
            sourceUpdatedAt: 1000,
        },
    });
    const access = createCloudflareServiceAccess({
        acceptedPrincipalKinds: credentialKind === 'api_key' ? ['api_key'] : ['person'],
        authorityOrigin,
        issuer,
        loadSnapshot: async () => null,
        now: () => now,
        projections,
        resolveServicePrincipal: ({ merchbaseUserId }) => resolveBidBeaconPrincipal(database.db as never, merchbaseUserId),
        service: 'bidbeacon',
        verifier,
    });
    const authorized = await access.authorize(credential);
    return {
        verify: verifier.verify,
        credential,
        principal: {
            ...authorized.principal,
            credentialKind: authorized.credentialKind === 'person' ? 'session' : authorized.credentialKind,
        },
    };
};
