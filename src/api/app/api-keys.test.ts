import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiKey, apiKeyAccountAccess } from '@/db/schema';

const dbMock = vi.hoisted(() => {
    const txDeleteWhere = vi.fn();
    const txInsertValues = vi.fn();
    const tx = {
        delete: vi.fn(() => ({ where: txDeleteWhere })),
        insert: vi.fn(() => ({ values: txInsertValues })),
    };

    const deleteWhere = vi.fn();

    return {
        tx,
        txDeleteWhere,
        txInsertValues,
        deleteWhere,
        db: {
            select: vi.fn(),
            transaction: vi.fn(),
            delete: vi.fn(() => ({ where: deleteWhere })),
            query: {
                apiKey: {
                    findFirst: vi.fn(),
                },
            },
        },
    };
});

vi.mock('@/db/index', () => ({
    db: dbMock.db,
}));

const baseContext = {
    authType: 'clerk' as const,
    user: { sub: 'user_123' },
    accessibleAccountIds: ['account-1', 'account-2'],
    request: {},
};

describe('apiKeysRouter', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        dbMock.db.transaction.mockImplementation(async callback => callback(dbMock.tx));
        dbMock.db.query.apiKey.findFirst.mockResolvedValue({
            id: '11111111-1111-4111-8111-111111111111',
            createdBy: 'user_123',
        });
        dbMock.txDeleteWhere.mockResolvedValue(undefined);
        dbMock.txInsertValues.mockResolvedValue(undefined);
        dbMock.deleteWhere.mockResolvedValue(undefined);
    });

    it('deletes existing keys before creating a new one', async () => {
        const { apiKeysRouter } = await import('./api-keys');
        const caller = apiKeysRouter.createCaller(baseContext);

        await caller.create({
            label: 'dashboard-key',
            adsAccountIds: ['account-1', 'account-2'],
        });

        expect(dbMock.tx.delete).toHaveBeenCalledWith(apiKey);
        expect(dbMock.txDeleteWhere).toHaveBeenCalledTimes(1);
        expect(dbMock.tx.insert).toHaveBeenCalledWith(apiKey);
        expect(dbMock.tx.insert).toHaveBeenCalledWith(apiKeyAccountAccess);
        expect(dbMock.txDeleteWhere.mock.invocationCallOrder[0]).toBeLessThan(dbMock.txInsertValues.mock.invocationCallOrder[0]);
    });

    it('deletes the key row when revoking', async () => {
        const { apiKeysRouter } = await import('./api-keys');
        const caller = apiKeysRouter.createCaller(baseContext);

        await caller.revoke({
            apiKeyId: '11111111-1111-4111-8111-111111111111',
        });

        expect(dbMock.db.delete).toHaveBeenCalledWith(apiKey);
        expect(dbMock.deleteWhere).toHaveBeenCalledTimes(1);
    });
});
