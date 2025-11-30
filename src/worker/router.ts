import {
    handleSpTraffic,
    handleSpConversion,
    handleBudgetUsage,
    handleCampaigns,
    handleAdGroups,
    handleAds,
    handleTargets,
} from './handlers/index.js';

/**
 * Route AMS payload to the appropriate handler based on datasetId
 * @param payload - Parsed AMS payload (can be single object or array)
 */
export async function routePayload(payload: unknown): Promise<void> {
    // Handle array of records
    if (Array.isArray(payload)) {
        for (const record of payload) {
            await routeSinglePayload(record);
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
    const datasetId = payloadObj.datasetId;

    if (typeof datasetId !== 'string') {
        throw new Error('Payload must contain a string datasetId field');
    }

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
        console.warn(`[Router] Unknown datasetId: ${datasetId}. Skipping message.`);
        // Don't throw - just log and skip unknown datasets
    }
}

