import type { AccountAccessGateReason, AccountAccessGateResult } from '@/jobs/account-access-gate';
import { AmsAccountResolutionError, type AmsAccountResolutionReason } from './account-resolution';

export type AmsMessage = {
    Body?: string;
    MessageId?: string;
    ReceiptHandle?: string;
};

export type AmsMessageProcessorDependencies = {
    checkAccountAccess: (accountId: string) => Promise<AccountAccessGateResult>;
    deleteMessage: (receiptHandle: string) => Promise<void>;
    resolveAccountIds: (payload: unknown) => Promise<string[]>;
    routePayload: (payload: unknown) => Promise<void>;
};

export type AmsMessageProcessResult =
    | { accountIds: string[]; datasetId: string; status: 'processed' }
    | { accountIds: string[]; datasetId: string; reason: Exclude<AccountAccessGateReason, 'allowed'> | AmsAccountResolutionReason; status: 'skipped' };

export const parseAmsPayload = (body: string | undefined): unknown => {
    if (!body) {
        throw new Error('Message body is empty');
    }

    try {
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== 'object') {
            throw new Error('Message body is not a valid JSON object');
        }
        return payload;
    } catch (error) {
        throw new Error(`Failed to parse AMS payload: ${error instanceof Error ? error.message : String(error)}`);
    }
};

export const processAmsMessage = async (message: AmsMessage, dependencies: AmsMessageProcessorDependencies): Promise<AmsMessageProcessResult> => {
    if (!message.ReceiptHandle) {
        throw new Error('Message missing ReceiptHandle');
    }

    const payload = parseAmsPayload(message.Body);
    const datasetId = getDatasetId(payload);
    let accountIds: string[];

    try {
        accountIds = await dependencies.resolveAccountIds(payload);
    } catch (error) {
        return {
            accountIds: [],
            datasetId,
            reason: error instanceof AmsAccountResolutionError ? error.reason : 'access_unavailable',
            status: 'skipped',
        };
    }

    if (accountIds.length === 0) {
        return { accountIds, datasetId, reason: 'unknown_account', status: 'skipped' };
    }

    for (const accountId of accountIds) {
        let access: AccountAccessGateResult;
        try {
            access = await dependencies.checkAccountAccess(accountId);
        } catch {
            access = { allowed: false, reason: 'access_unavailable' };
        }

        if (!access.allowed) {
            return { accountIds, datasetId, reason: access.reason, status: 'skipped' };
        }
    }

    await dependencies.routePayload(payload);
    await dependencies.deleteMessage(message.ReceiptHandle);
    return { accountIds, datasetId, status: 'processed' };
};

const getDatasetId = (payload: unknown) => {
    const records = Array.isArray(payload) ? payload : [payload];
    const first = records[0];
    if (!first || typeof first !== 'object' || Array.isArray(first) || typeof first.dataset_id !== 'string') {
        return 'unknown';
    }
    return first.dataset_id;
};
