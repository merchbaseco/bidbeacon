import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { z } from 'zod';
import { OperationError } from './operation-errors';
import { createSearchQueryFingerprint } from './search-cursor';
import {
    CAMPAIGN_DEFAULT_FIELDS,
    type CampaignSearchField,
    campaignSearchFieldRegistry,
    getCampaignSearchField,
    isCampaignPerformanceField,
    isCampaignSegmentField,
    SEARCH_OPERATORS,
    type SearchFieldDefinition,
    type SearchOperator,
} from './search-field-registry';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const searchFilterInputSchema = z
    .object({
        field: z.string(),
        operator: z.enum(SEARCH_OPERATORS),
        value: z.unknown(),
    })
    .strict();

const searchOrderInputSchema = z
    .object({
        field: z.string(),
        direction: z.enum(['asc', 'desc']),
    })
    .strict();

const searchDateRangeInputSchema = z
    .object({
        startDate: z.string(),
        endDate: z.string(),
    })
    .strict();

export const searchInputSchema = z
    .object({
        accountId: z.string().uuid(),
        resource: z.string(),
        fields: z.array(z.string()).min(1).optional(),
        filters: z.array(searchFilterInputSchema).optional(),
        dateRange: searchDateRangeInputSchema.optional(),
        orderBy: z.array(searchOrderInputSchema).min(1).optional(),
        limit: z.number().int().min(1).max(200).default(20),
        cursor: z.string().min(1).optional(),
    })
    .strict();

const searchCoverageIssueSchema = z.union([
    z.object({ date: z.string(), status: z.enum(['PENDING', 'FAILED', 'UNKNOWN']) }).strict(),
    z.object({ date: z.string(), status: z.literal('PARSE_ERRORS'), errorCount: z.number().int().nonnegative() }).strict(),
]);

export const searchOutputSchema = z
    .object({
        context: z
            .object({
                account: z.object({ id: z.string().uuid(), timezone: z.string(), currency: z.string() }).strict(),
                resource: z.literal('campaign'),
                fields: z.array(z.string()),
                dateRange: z
                    .object({ startDate: z.string(), endDate: z.string(), source: z.enum(['DEFAULT', 'EXPLICIT']) })
                    .strict()
                    .optional(),
                orderBy: z.array(z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) }).strict()),
                coverage: z
                    .object({ status: z.enum(['COMPLETE', 'INCOMPLETE', 'UNKNOWN']), issues: z.array(searchCoverageIssueSchema) })
                    .strict()
                    .optional(),
            })
            .strict(),
        rows: z.array(z.record(z.unknown())),
        nextCursor: z.string().optional(),
    })
    .strict();

export type SearchDateRange = {
    startDate: string;
    endDate: string;
    source: 'DEFAULT' | 'EXPLICIT';
};

export type SearchFilter = {
    field: CampaignSearchField;
    operator: SearchOperator;
    value: string | number | readonly (string | number)[];
};

export type SearchOrder = {
    field: CampaignSearchField;
    direction: 'asc' | 'desc';
};

export type CampaignSearchPlan = {
    accountId: string;
    resource: 'campaign';
    fields: readonly CampaignSearchField[];
    filters: readonly SearchFilter[];
    dateRange?: SearchDateRange;
    orderBy: readonly SearchOrder[];
    limit: number;
    cursor?: string;
    performance: boolean;
    segmented: boolean;
    fingerprint: string;
};

export const planCampaignSearch = (input: unknown, options: { timezone: string; now?: Date }): CampaignSearchPlan => {
    const parsedInput = searchInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw invalidInput('Search input is invalid.', { issues: parsedInput.error.issues });
    }
    if (parsedInput.data.resource !== 'campaign') {
        throw invalidInput('Search resource is not available in this operation slice.', { resource: parsedInput.data.resource, supportedResources: ['campaign'] });
    }

    const fields = resolveFields(parsedInput.data.fields);
    const filters = resolveFilters(parsedInput.data.filters ?? []);
    const requestedOrder = resolveOrder(parsedInput.data.orderBy ?? []);
    const performance =
        fields.some(isCampaignPerformanceField) || filters.some(filter => isCampaignPerformanceField(filter.field)) || requestedOrder.some(order => isCampaignPerformanceField(order.field));
    const segmented = fields.some(isCampaignSegmentField) || requestedOrder.some(order => isCampaignSegmentField(order.field));

    if (!performance && parsedInput.data.dateRange) {
        throw invalidInput('dateRange requires a metric or segment Field.');
    }

    const dateRange = performance ? resolveDateRange(parsedInput.data.dateRange, options) : undefined;
    const orderBy = appendCampaignTieBreaker(requestedOrder.length > 0 ? requestedOrder : getDefaultOrder(performance, segmented));
    const fingerprint = createSearchQueryFingerprint({
        accountId: parsedInput.data.accountId,
        resource: parsedInput.data.resource,
        fields,
        filters,
        dateRange: dateRange ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : null,
        orderBy,
    });

    return {
        accountId: parsedInput.data.accountId,
        resource: 'campaign',
        fields,
        filters,
        dateRange,
        orderBy,
        limit: parsedInput.data.limit,
        cursor: parsedInput.data.cursor,
        performance,
        segmented,
        fingerprint,
    };
};

const resolveFields = (fields: readonly string[] | undefined): CampaignSearchField[] => {
    const resolved = fields ?? CAMPAIGN_DEFAULT_FIELDS;
    const seen = new Set<string>();
    const invalidFields: string[] = [];

    for (const field of resolved) {
        if (!getCampaignSearchField(field)) {
            invalidFields.push(field);
        }
        if (seen.has(field)) {
            throw invalidInput('Search fields must be unique.', { field });
        }
        seen.add(field);
    }

    if (invalidFields.length > 0) {
        throw invalidInput('Search contains a Field that is not compatible with campaign.', {
            fields: invalidFields,
            allowedFields: Object.keys(campaignSearchFieldRegistry),
        });
    }

    return resolved as CampaignSearchField[];
};

const resolveFilters = (filters: readonly z.infer<typeof searchFilterInputSchema>[]): SearchFilter[] =>
    filters.map(filter => {
        const definition = getCampaignSearchField(filter.field);
        if (!definition) {
            throw invalidInput('Search filter Field is not compatible with campaign.', { field: filter.field });
        }
        if (!definition.filterOperators.includes(filter.operator)) {
            throw invalidInput('Search filter operator is not valid for the selected Field.', {
                field: filter.field,
                operator: filter.operator,
                allowedOperators: definition.filterOperators,
            });
        }

        const value = validateFilterValue(definition, filter.operator, filter.value);
        return { field: definition.field, operator: filter.operator, value };
    });

const resolveOrder = (orderBy: readonly z.infer<typeof searchOrderInputSchema>[]): SearchOrder[] => {
    const seen = new Set<string>();
    return orderBy.map(order => {
        const definition = getCampaignSearchField(order.field);
        if (!definition) {
            throw invalidInput('Search ordering Field is not compatible with campaign.', { field: order.field });
        }
        if (seen.has(order.field)) {
            throw invalidInput('Search ordering Fields must be unique.', { field: order.field });
        }
        seen.add(order.field);
        return { field: definition.field, direction: order.direction };
    });
};

const validateFilterValue = (definition: SearchFieldDefinition, operator: SearchOperator, value: unknown): SearchFilter['value'] => {
    if (operator === 'in') {
        if (!Array.isArray(value) || value.length === 0 || value.some(item => !isScalarValue(definition, item))) {
            throw invalidInput('The in operator requires a non-empty array of values matching the Field type.', { field: definition.field });
        }
        return value as string[] | number[];
    }

    if (operator === 'contains') {
        if (definition.kind !== 'string' || typeof value !== 'string') {
            throw invalidInput('The contains operator requires a string Field and string value.', { field: definition.field });
        }
        return value;
    }

    if (!isScalarValue(definition, value)) {
        throw invalidInput('Search filter value does not match the Field type.', { field: definition.field });
    }

    return value;
};

const isScalarValue = (definition: SearchFieldDefinition, value: unknown): value is string | number => {
    if (definition.kind === 'number') {
        return typeof value === 'number' && Number.isFinite(value);
    }
    if (typeof value !== 'string') {
        return false;
    }
    return definition.kind !== 'date' || isIsoDate(value);
};

const resolveDateRange = (input: z.infer<typeof searchDateRangeInputSchema> | undefined, options: { timezone: string; now?: Date }): SearchDateRange => {
    if (input) {
        if (!(isIsoDate(input.startDate) && isIsoDate(input.endDate))) {
            throw invalidInput('Search dates must use YYYY-MM-DD and name valid calendar dates.');
        }
        if (input.startDate > input.endDate) {
            throw invalidInput('Search dateRange.startDate must be on or before endDate.');
        }
        return { startDate: input.startDate, endDate: input.endDate, source: 'EXPLICIT' };
    }

    const now = options.now ?? new Date();
    const localNow = toZonedTime(now, options.timezone);
    return {
        startDate: format(subDays(localNow, 6), 'yyyy-MM-dd'),
        endDate: format(localNow, 'yyyy-MM-dd'),
        source: 'DEFAULT',
    };
};

const getDefaultOrder = (performance: boolean, segmented: boolean): SearchOrder[] => {
    if (performance && segmented) {
        return [{ field: 'segments.date', direction: 'asc' }];
    }
    if (performance) {
        return [{ field: 'metrics.spend', direction: 'desc' }];
    }
    return [{ field: 'campaign.name', direction: 'asc' }];
};

const appendCampaignTieBreaker = (orderBy: readonly SearchOrder[]): SearchOrder[] => {
    if (orderBy.some(order => order.field === 'campaign.id')) {
        return [...orderBy];
    }
    return [...orderBy, { field: 'campaign.id', direction: 'asc' }];
};

const isIsoDate = (value: string) => {
    if (!ISO_DATE_REGEX.test(value)) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const invalidInput = (message: string, details: Record<string, unknown> = {}) => new OperationError('INVALID_INPUT', message, details);
