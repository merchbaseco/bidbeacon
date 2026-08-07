import { ServiceAccessError } from '@merchbaseco/access';
import { describe, expect, it, vi } from 'vitest';
import { authenticateMcpRequest, createBidBeaconMcpAuth, type McpAuthDependencies } from './auth';

const oauthToken = 'oat_test-token';
const accessibleAccountId = '00000000-0000-4000-8000-000000000001';

const createDependencies = (overrides: Partial<McpAuthDependencies> = {}): McpAuthDependencies => ({
    authorize: vi.fn().mockResolvedValue({
        accessibleAccountIds: [accessibleAccountId],
        merchbaseUserId: 'mbu_test',
    }),
    ...overrides,
});

describe('BidBeacon MCP authentication', () => {
    it('requires a bearer token before shared authorization', async () => {
        const dependencies = createDependencies();

        await expect(authenticateMcpRequest(undefined, dependencies)).resolves.toEqual({ status: 'unauthorized' });
        expect(dependencies.authorize).not.toHaveBeenCalled();
    });

    it('never sends an API key to the MCP OAuth authorizer', async () => {
        const dependencies = createDependencies();

        await expect(authenticateMcpRequest('Bearer ak_not-for-mcp', dependencies)).resolves.toEqual({ status: 'unauthorized' });
        expect(dependencies.authorize).not.toHaveBeenCalled();
    });

    it('returns portable MCP auth info and stable account access context', async () => {
        const result = await authenticateMcpRequest(`Bearer ${oauthToken}`, createDependencies());

        expect(result).toMatchObject({
            accessibleAccountIds: [accessibleAccountId],
            authInfo: {
                clientId: 'clerk',
                extra: { merchbaseUserId: 'mbu_test' },
                scopes: ['openid', 'email', 'profile'],
                token: oauthToken,
            },
            merchbaseUserId: 'mbu_test',
            status: 'authenticated',
        });
    });

    it('maps insufficient OAuth scope to a forbidden challenge', async () => {
        const dependencies = createDependencies({
            authorize: vi.fn().mockRejectedValue(new ServiceAccessError('insufficient_scope')),
        });

        await expect(authenticateMcpRequest(`Bearer ${oauthToken}`, dependencies)).resolves.toEqual({
            missingScopes: ['openid', 'email', 'profile'],
            status: 'forbidden',
        });
    });

    it('fails closed when local access is denied', async () => {
        const dependencies = createDependencies({
            authorize: vi.fn().mockRejectedValue(new ServiceAccessError('access_denied')),
        });

        await expect(authenticateMcpRequest(`Bearer ${oauthToken}`, dependencies)).resolves.toEqual({ missingScopes: [], status: 'forbidden' });
    });

    it('reports verifier or projection outages as unavailable', async () => {
        const dependencies = createDependencies({
            authorize: vi.fn().mockRejectedValue(new ServiceAccessError('access_unavailable')),
        });

        await expect(authenticateMcpRequest(`Bearer ${oauthToken}`, dependencies)).resolves.toEqual({ status: 'unavailable' });
    });

    it('rejects unknown authorization failures', async () => {
        const dependencies = createDependencies({ authorize: vi.fn().mockRejectedValue(new Error('invalid')) });

        await expect(authenticateMcpRequest(`Bearer ${oauthToken}`, dependencies)).resolves.toEqual({ status: 'unauthorized' });
    });

    it('uses only the shared OAuth access adapter', async () => {
        const authorize = vi.fn().mockResolvedValue({
            credentialKind: 'oauth',
            merchbaseUserId: 'mbu_test',
            principal: { accessibleAccountIds: [accessibleAccountId] },
        });
        const dependencies = createBidBeaconMcpAuth({ oauthAccess: { authorize } } as never);

        await expect(authenticateMcpRequest(`Bearer ${oauthToken}`, dependencies)).resolves.toMatchObject({
            accessibleAccountIds: [accessibleAccountId],
            merchbaseUserId: 'mbu_test',
            status: 'authenticated',
        });
        expect(authorize).toHaveBeenCalledWith(oauthToken);
    });
});
