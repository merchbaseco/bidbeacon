import {
    handleAdGroups,
    handleAds,
    handleBudgetUsage,
    handleCampaigns,
    handleSpConversion,
    handleSpTraffic,
    handleTargets,
} from './handlers/index.js';

/**
 * Route AMS payload to the appropriate handler based on datasetId
 * @param payload - Parsed AMS payload (can be single object or array)
 */
export async function routePayload(payload: unknown): Promise<void> {
    // Handle array of records
    if (Array.isArray(payload)) {
        console.log(`[Router] Payload is an array with ${payload.length} records`);
        for (let i = 0; i < payload.length; i++) {
            console.log(`[Router] Processing record ${i + 1}/${payload.length}`);
            await routeSinglePayload(payload[i]);
        }
        return;
    }

    // Handle single record
    console.log('[Router] Payload is a single record');
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

    console.log(`[Router] Routing payload with datasetId: ${datasetId}`);

    // Route based on datasetId prefix
    if (datasetId.startsWith('sp-traffic')) {
        console.log('[Router] → Calling handleSpTraffic handler');
        await handleSpTraffic(payload);
        console.log('[Router] ✓ handleSpTraffic completed');
    } else if (datasetId.startsWith('sp-conversion')) {
        console.log('[Router] → Calling handleSpConversion handler');
        await handleSpConversion(payload);
        console.log('[Router] ✓ handleSpConversion completed');
    } else if (datasetId.startsWith('budget-usage')) {
        console.log('[Router] → Calling handleBudgetUsage handler');
        await handleBudgetUsage(payload);
        console.log('[Router] ✓ handleBudgetUsage completed');
    } else if (datasetId.startsWith('ads-campaign-management-campaigns')) {
        console.log('[Router] → Calling handleCampaigns handler');
        await handleCampaigns(payload);
        console.log('[Router] ✓ handleCampaigns completed');
    } else if (datasetId.startsWith('ads-campaign-management-adgroups')) {
        console.log('[Router] → Calling handleAdGroups handler');
        await handleAdGroups(payload);
        console.log('[Router] ✓ handleAdGroups completed');
    } else if (datasetId.startsWith('ads-campaign-management-ads')) {
        console.log('[Router] → Calling handleAds handler');
        await handleAds(payload);
        console.log('[Router] ✓ handleAds completed');
    } else if (datasetId.startsWith('ads-campaign-management-targets')) {
        console.log('[Router] → Calling handleTargets handler');
        await handleTargets(payload);
        console.log('[Router] ✓ handleTargets completed');
    } else {
        // Throw error so unknown datasets go through SQS retry → DLQ for triage
        throw new Error(`Unknown datasetId: ${datasetId}. Message will be retried and eventually routed to DLQ.`);
    }
}
