import { createContextLogger } from '@/utils/logger';
import { handleAdGroups, handleAds, handleBudgetUsage, handleCampaigns, handleSpConversion, handleSpTraffic, handleTargets } from './handlers/index.js';

/**
 * Route AMS payload to the appropriate handler based on datasetId
 * @param payload - Parsed AMS payload (can be single object or array)
 */
export async function routePayload(payload: unknown): Promise<void> {
    // Handle array of records
    if (Array.isArray(payload)) {
        for (let i = 0; i < payload.length; i++) {
            await routeSinglePayload(payload[i]);
        }
        return;
    }

    // Handle single record
    await routeSinglePayload(payload);
}

/**
 * Route a single AMS payload record
 */
async function routeSinglePayload(payload: unknown): Promise<void> {
    if (typeof payload !== 'object' || payload === null) {
        throw new Error('Payload must be an object');
    }

    const payloadObj = payload as Record<string, unknown>;
    const datasetId = payloadObj.dataset_id;

    if (typeof datasetId !== 'string') {
        throw new Error('Payload must contain a string dataset_id field');
    }

    const routerLogger = createContextLogger({ component: 'router', datasetId });

    // Route based on datasetId prefix
    if (datasetId.startsWith('sp-traffic')) {
        await handleSpTraffic(payload);
    } else if (datasetId.startsWith('sp-conversion')) {
        await handleSpConversion(payload);
    } else if (datasetId.startsWith('budget-usage')) {
        await handleBudgetUsage(payload);
    } else if (datasetId.startsWith('ads-campaign-management-campaigns')) {
        await handleCampaigns(payload);
    } else if (datasetId.startsWith('ads-campaign-management-adgroups')) {
        await handleAdGroups(payload);
    } else if (datasetId.startsWith('ads-campaign-management-ads')) {
        await handleAds(payload);
    } else if (datasetId.startsWith('ads-campaign-management-targets')) {
        await handleTargets(payload);
    } else {
        // Log unknown dataset before throwing error
        routerLogger.error({ datasetId }, 'Unknown datasetId - message will be retried and eventually routed to DLQ');
        // Throw error so unknown datasets go through SQS retry → DLQ for triage
        throw new Error(`Unknown datasetId: ${datasetId}. Message will be retried and eventually routed to DLQ.`);
    }
}
