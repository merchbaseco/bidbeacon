import { z } from 'zod';
import { withTracking } from '@/utils/api-tracker';
import { type ApiRegion, getApiBaseUrl } from './config';
import { refreshAccessToken } from './reauth';
import { AMAZON_ADS_API_RETRY, throttledFetch } from './throttled-fetch';

const historyFilterSchema = z.enum(['BID_AMOUNT', 'BUDGET_AMOUNT', 'END_DATE', 'IN_BUDGET', 'NAME', 'PLACEMENT_GROUP', 'SMART_BIDDING_STRATEGY', 'START_DATE', 'STATUS']);

const historyEventTypeSchema = z.object({
    eventTypeIds: z.array(z.string()).max(10).optional(),
    filters: z.array(historyFilterSchema).max(10).optional(),
    parents: z
        .array(
            z.object({
                adGroupId: z.string().optional(),
                campaignId: z.string().optional(),
                useProfileIdAdvertiser: z.boolean().optional(),
            })
        )
        .max(10)
        .optional(),
});

const historyEventTypesSchema = z
    .object({
        AD: historyEventTypeSchema.optional(),
        AD_GROUP: historyEventTypeSchema.optional(),
        CAMPAIGN: historyEventTypeSchema.optional(),
        KEYWORD: historyEventTypeSchema.optional(),
        NEGATIVE_KEYWORD: historyEventTypeSchema.optional(),
        PRODUCT_TARGETING: historyEventTypeSchema.optional(),
        THEME: historyEventTypeSchema.optional(),
    })
    .refine(eventTypes => Object.values(eventTypes).some(Boolean), { message: 'At least one event type is required.' });

const getChangeHistoryRequestSchema = z.object({
    count: z.number().int().min(50).max(200).optional(),
    eventTypes: historyEventTypesSchema,
    fromDate: z.number().int(),
    nextToken: z.string().optional(),
    pageOffset: z.number().int().optional(),
    sort: z
        .object({
            direction: z.enum(['ASC', 'DESC']).optional(),
            key: z.enum(['DATE']).optional(),
        })
        .optional(),
    toDate: z.number().int(),
});

const historyEventSchema = z.object({
    changeType: z.string(),
    entityId: z.string(),
    entityType: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    newValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    previousValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    timestamp: z.number().int(),
});

const getChangeHistoryResponseSchema = z.object({
    events: z.array(historyEventSchema).default([]),
    nextToken: z.string().optional(),
    totalResults: z.number().int().optional(),
});

type GetChangeHistoryRequest = z.infer<typeof getChangeHistoryRequestSchema>;
export type ChangeHistoryEvent = z.infer<typeof historyEventSchema>;
export type GetChangeHistoryResponse = z.infer<typeof getChangeHistoryResponseSchema>;

export type GetChangeHistoryOptions = {
    profileId: number;
    fromDate: number;
    toDate: number;
    nextToken?: string;
    count?: number;
    eventTypes: z.infer<typeof historyEventTypesSchema>;
};

export const DEFAULT_CHANGE_HISTORY_EVENT_TYPES: z.infer<typeof historyEventTypesSchema> = {
    CAMPAIGN: {
        filters: ['STATUS', 'BUDGET_AMOUNT'],
    },
    AD_GROUP: {
        filters: ['STATUS', 'BID_AMOUNT'],
    },
    AD: {
        filters: ['STATUS'],
    },
    KEYWORD: {
        filters: ['STATUS', 'BID_AMOUNT'],
    },
    PRODUCT_TARGETING: {
        filters: ['STATUS', 'BID_AMOUNT'],
    },
    NEGATIVE_KEYWORD: {
        filters: ['STATUS'],
    },
};

export const getChangeHistory = async (options: GetChangeHistoryOptions, region: ApiRegion = 'na'): Promise<GetChangeHistoryResponse> => {
    return withTracking({ apiName: 'getChangeHistory', region }, async () => {
        const accessToken = await refreshAccessToken();
        const clientId = process.env.ADS_API_CLIENT_ID;
        const baseUrl = getApiBaseUrl(region);
        const url = `${baseUrl}/history`;

        if (!clientId) {
            throw new Error('Missing ADS_API_CLIENT_ID environment variable');
        }

        const requestBody: GetChangeHistoryRequest = getChangeHistoryRequestSchema.parse({
            count: options.count ?? 200,
            eventTypes: options.eventTypes,
            fromDate: options.fromDate,
            toDate: options.toDate,
            nextToken: options.nextToken,
            sort: {
                direction: 'ASC',
                key: 'DATE',
            },
        });

        const response = await throttledFetch(url, {
            method: 'POST',
            headers: {
                'Amazon-Advertising-API-ClientId': clientId,
                'Amazon-Advertising-API-Scope': String(options.profileId),
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/vnd.historyresponse.v1.1+json',
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(30_000),
            retry: AMAZON_ADS_API_RETRY,
        });

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Failed to fetch change history: ${response.status} ${response.statusText}. ${errorText}`);
            (error as Error & { statusCode?: number }).statusCode = response.status;
            throw error;
        }

        const json = await response.json();
        return getChangeHistoryResponseSchema.parse(json);
    });
};
