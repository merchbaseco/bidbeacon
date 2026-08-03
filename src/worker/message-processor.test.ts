import { describe, expect, it, vi } from 'vitest';
import { AmsAccountResolutionError } from './account-resolution';
import { type AmsMessageProcessorDependencies, processAmsMessage } from './message-processor';

const message = {
    Body: JSON.stringify({ advertiser_id: 'entity-1', dataset_id: 'sp-traffic-2026', marketplace_id: 'marketplace-1' }),
    MessageId: 'message-1',
    ReceiptHandle: 'receipt-1',
};

const createDependencies = (overrides: Partial<AmsMessageProcessorDependencies> = {}): AmsMessageProcessorDependencies => ({
    checkAccountAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'allowed' }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    resolveAccountIds: vi.fn().mockResolvedValue(['account-1']),
    routePayload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
});

describe('AMS message access boundary', () => {
    it('checks each account once, routes allowed work, and deletes only after handlers finish', async () => {
        const dependencies = createDependencies();

        await expect(processAmsMessage(message, dependencies)).resolves.toMatchObject({ status: 'processed', accountIds: ['account-1'] });
        expect(dependencies.checkAccountAccess).toHaveBeenCalledOnce();
        expect(dependencies.checkAccountAccess).toHaveBeenCalledWith('account-1');
        expect(dependencies.routePayload).toHaveBeenCalledOnce();
        expect(dependencies.deleteMessage).toHaveBeenCalledOnce();
    });

    it.each([
        ['denied', { allowed: false, reason: 'access_denied' as const }],
        ['unavailable', { allowed: false, reason: 'access_unavailable' as const }],
        ['no current members', { allowed: false, reason: 'no_current_members' as const }],
    ])('does not route or delete future work when access is %s', async (_label, access) => {
        const dependencies = createDependencies({ checkAccountAccess: vi.fn().mockResolvedValue(access) });

        await expect(processAmsMessage(message, dependencies)).resolves.toMatchObject({ status: 'skipped', reason: access.reason });
        expect(dependencies.routePayload).not.toHaveBeenCalled();
        expect(dependencies.deleteMessage).not.toHaveBeenCalled();
    });

    it('keeps unknown-account messages queued without attempting an access check', async () => {
        const dependencies = createDependencies({ resolveAccountIds: vi.fn().mockRejectedValue(new AmsAccountResolutionError('unknown_account')) });

        await expect(processAmsMessage(message, dependencies)).resolves.toMatchObject({ status: 'skipped', reason: 'unknown_account' });
        expect(dependencies.checkAccountAccess).not.toHaveBeenCalled();
        expect(dependencies.routePayload).not.toHaveBeenCalled();
        expect(dependencies.deleteMessage).not.toHaveBeenCalled();
    });

    it('treats resolver and access exceptions as unavailable and does not delete', async () => {
        const resolverDependencies = createDependencies({ resolveAccountIds: vi.fn().mockRejectedValue(new Error('database unavailable')) });
        await expect(processAmsMessage(message, resolverDependencies)).resolves.toMatchObject({ status: 'skipped', reason: 'access_unavailable' });
        expect(resolverDependencies.deleteMessage).not.toHaveBeenCalled();

        const accessDependencies = createDependencies({ checkAccountAccess: vi.fn().mockRejectedValue(new Error('access service unavailable')) });
        await expect(processAmsMessage(message, accessDependencies)).resolves.toMatchObject({ status: 'skipped', reason: 'access_unavailable' });
        expect(accessDependencies.routePayload).not.toHaveBeenCalled();
        expect(accessDependencies.deleteMessage).not.toHaveBeenCalled();
    });

    it('does not delete when a handler fails after the pre-handler gate', async () => {
        const dependencies = createDependencies({ routePayload: vi.fn().mockRejectedValue(new Error('handler failed')) });

        await expect(processAmsMessage(message, dependencies)).rejects.toThrow('handler failed');
        expect(dependencies.deleteMessage).not.toHaveBeenCalled();
    });

    it('gates a multi-account message before routing and never partially routes it', async () => {
        const dependencies = createDependencies({
            checkAccountAccess: vi.fn().mockResolvedValueOnce({ allowed: true, reason: 'allowed' }).mockResolvedValueOnce({ allowed: false, reason: 'access_denied' }),
            resolveAccountIds: vi.fn().mockResolvedValue(['account-1', 'account-2']),
        });

        await expect(processAmsMessage(message, dependencies)).resolves.toMatchObject({ status: 'skipped', reason: 'access_denied' });
        expect(dependencies.checkAccountAccess).toHaveBeenCalledTimes(2);
        expect(dependencies.routePayload).not.toHaveBeenCalled();
        expect(dependencies.deleteMessage).not.toHaveBeenCalled();
    });
});
