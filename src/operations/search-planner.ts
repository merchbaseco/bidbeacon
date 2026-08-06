import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { z } from 'zod';
import { PLACEMENT_VALUES } from '@/lib/placement-report/normalize-placement';
import { OperationError } from './operation-errors';
import { createSearchQueryFingerprint } from './search-cursor';
import {
    type CampaignSearchField,
    getSearchDefaultFields,
    getSearchField,
    isSearchFieldCompatible,
    isSearchHourSegmentField,
    isSearchPerformanceField,
    isSearchSegmentField,
    SEARCH_FIELDS,
    SEARCH_OPERATORS,
    SEARCH_RESOURCES,
    type SearchField,
    type SearchFieldDefinition,
    type SearchOperator,
    type SearchResource,
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
                resource: z.enum(SEARCH_RESOURCES),
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
    field: SearchField;
    operator: SearchOperator;
    value: string | number | readonly (string | number)[];
};

export type SearchOrder = {
    field: SearchField;
    direction: 'asc' | 'desc';
};

export type SearchPlan = {
    accountId: string;
    resource: SearchResource;
    fields: readonly SearchField[];
    filters: readonly SearchFilter[];
    dateRange?: SearchDateRange;
    orderBy: readonly SearchOrder[];
    limit: number;
    cursor?: string;
    performance: boolean;
    segmented: boolean;
    segmentFields: readonly SearchField[];
    hourly: boolean;
    placement: boolean;
    fingerprint: string;
};

export type CampaignSearchPlan = SearchPlan & {
    resource: 'campaign';
    fields: readonly CampaignSearchField[];
};

export const planSearch = (input: unknown, options: { timezone: string; now?: Date }): SearchPlan => {
    const parsedInput = searchInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw invalidInput('Search input is invalid.', { issues: parsedInput.error.issues });
    }
    if (usesSearchField(parsedInput.data, 'segments.placement') && usesSearchField(parsedInput.data, 'segments.hour')) {
        throw invalidInput('segments.placement cannot be combined with segments.hour.');
    }
    if (parsedInput.data.resource !== 'campaign' && usesSearchField(parsedInput.data, 'segments.placement')) {
        throw invalidInput('segments.placement is only compatible with Campaign Search.', {
            field: 'segments.placement',
            resource: parsedInput.data.resource,
        });
    }
    if (!isSearchResource(parsedInput.data.resource)) {
        throw invalidInput('Search resource is not available in this operation slice.', {
            resource: parsedInput.data.resource,
            supportedResources: [...SEARCH_RESOURCES],
        });
    }

    const resource = parsedInput.data.resource;
    const fields = resolveFields(resource, parsedInput.data.fields);
    const filters = resolveFilters(resource, parsedInput.data.filters ?? []);
    const requestedOrder = resolveOrder(resource, parsedInput.data.orderBy ?? []);
    const usedFields = [...fields, ...filters.map(filter => filter.field), ...requestedOrder.map(order => order.field)];
    const performance = usedFields.some(isSearchPerformanceField);
    const segmentFields = [...new Set([...fields, ...requestedOrder.map(order => order.field)].filter(isSearchSegmentField))];
    const segmented = segmentFields.length > 0;
    const hourly = usedFields.some(isSearchHourSegmentField);
    const placement = usedFields.includes('segments.placement');

    if (placement && hourly) {
        throw invalidInput('segments.placement cannot be combined with segments.hour.');
    }
    if (hourly && !usedFields.includes('segments.date')) {
        throw invalidInput('segments.hour requires the compatible segments.date Field.', {
            field: 'segments.hour',
            compatibleFields: fieldsForResource(resource).filter(field => field === 'segments.date' || field === 'segments.hour'),
        });
    }
    if (segmentFields.includes('segments.hour') && !segmentFields.includes('segments.date')) {
        throw invalidInput('segments.hour requires segments.date at the selected row grain.', {
            field: 'segments.hour',
            compatibleFields: fieldsForResource(resource).filter(field => field === 'segments.date' || field === 'segments.hour'),
        });
    }
    if (!performance && parsedInput.data.dateRange) {
        throw invalidInput('dateRange requires a metric or segment Field.');
    }

    const dateRange = performance ? resolveDateRange(parsedInput.data.dateRange, options) : undefined;
    const orderBy = appendTieBreakers(resource, requestedOrder.length > 0 ? requestedOrder : getDefaultOrder(resource, performance, segmented, segmentFields), segmentFields);
    const fingerprint = createSearchQueryFingerprint({
        accountId: parsedInput.data.accountId,
        resource,
        fields,
        filters,
        dateRange: dateRange ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : null,
        orderBy,
    });

    return {
        accountId: parsedInput.data.accountId,
        resource,
        fields,
        filters,
        dateRange,
        orderBy,
        limit: parsedInput.data.limit,
        cursor: parsedInput.data.cursor,
        performance,
        segmented,
        segmentFields,
        hourly,
        placement,
        fingerprint,
    };
};

export const planCampaignSearch = (input: unknown, options: { timezone: string; now?: Date }): CampaignSearchPlan => {
    const plan = planSearch(input, options);
    if (plan.resource !== 'campaign') {
        throw invalidInput('Search resource is not available in the Campaign Search operation slice.', { resource: plan.resource, supportedResources: ['campaign'] });
    }
    return plan as CampaignSearchPlan;
};

const resolveFields = (resource: SearchResource, fields: readonly string[] | undefined): SearchField[] => {
    const resolved = fields ?? getSearchDefaultFields(resource);
    const seen = new Set<string>();
    const invalidFields: string[] = [];

    for (const field of resolved) {
        if (!isSearchFieldCompatible(resource, field)) {
            invalidFields.push(field);
        }
        if (seen.has(field)) {
            throw invalidInput('Search fields must be unique.', { field });
        }
        seen.add(field);
    }

    if (invalidFields.length > 0) {
        throw invalidInput(`Search contains a Field that is not compatible with ${resource}.`, {
            fields: invalidFields,
            allowedFields: fieldsForResource(resource),
        });
    }

    return resolved as SearchField[];
};

const resolveFilters = (resource: SearchResource, filters: readonly z.infer<typeof searchFilterInputSchema>[]): SearchFilter[] =>
    filters.map(filter => {
        const field = getSearchField(filter.field);
        if (!(field && isSearchFieldCompatible(resource, filter.field))) {
            throw invalidInput(`Search filter Field is not compatible with ${resource}.`, { field: filter.field, allowedFields: fieldsForResource(resource) });
        }
        if (!field.filterOperators.includes(filter.operator)) {
            throw invalidInput('Search filter operator is not valid for the selected Field.', {
                field: filter.field,
                operator: filter.operator,
                allowedOperators: field.filterOperators,
            });
        }

        const value = validateFilterValue(field, filter.operator, filter.value);
        return { field: field.field, operator: filter.operator, value };
    });

const resolveOrder = (resource: SearchResource, orderBy: readonly z.infer<typeof searchOrderInputSchema>[]): SearchOrder[] => {
    const seen = new Set<string>();
    return orderBy.map(order => {
        const field = getSearchField(order.field);
        if (!(field && isSearchFieldCompatible(resource, order.field))) {
            throw invalidInput(`Search ordering Field is not compatible with ${resource}.`, { field: order.field, allowedFields: fieldsForResource(resource) });
        }
        if (seen.has(order.field)) {
            throw invalidInput('Search ordering Fields must be unique.', { field: order.field });
        }
        seen.add(order.field);
        return { field: field.field, direction: order.direction };
    });
};

const validateFilterValue = (field: SearchFieldDefinition, operator: SearchOperator, value: unknown): SearchFilter['value'] => {
    if (operator === 'in') {
        if (!Array.isArray(value) || value.length === 0 || value.some(item => !(isScalarValue(field, item) && isValidFieldValue(field, item)))) {
            throw invalidInput('The in operator requires a non-empty array of values matching the Field type.', { field: field.field });
        }
        if (field.field === 'segments.placement' && value.some(item => !isPublicPlacement(item))) {
            throw invalidInput('Placement filters must use the public placement vocabulary.', { field: field.field, allowedValues: PLACEMENT_VALUES });
        }
        return value as string[] | number[];
    }

    if (operator === 'contains') {
        if (field.kind !== 'string' || typeof value !== 'string') {
            throw invalidInput('The contains operator requires a string Field and string value.', { field: field.field });
        }
        return value;
    }

    if (!(isScalarValue(field, value) && isValidFieldValue(field, value))) {
        throw invalidInput('Search filter value does not match the Field type.', { field: field.field });
    }
    if (field.field === 'segments.placement' && !isPublicPlacement(value)) {
        throw invalidInput('Placement filters must use the public placement vocabulary.', { field: field.field, allowedValues: PLACEMENT_VALUES });
    }

    return value;
};

const isScalarValue = (field: SearchFieldDefinition, value: unknown): value is string | number => {
    if (field.kind === 'number') {
        return typeof value === 'number' && Number.isFinite(value);
    }
    if (typeof value !== 'string') {
        return false;
    }
    return field.kind !== 'date' || isIsoDate(value);
};

const isValidFieldValue = (field: SearchFieldDefinition, value: string | number) =>
    field.field !== 'segments.hour' || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23);

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

const getDefaultOrder = (resource: SearchResource, performance: boolean, segmented: boolean, segmentFields: readonly SearchField[]): SearchOrder[] => {
    if (performance && segmented) {
        const order: SearchOrder[] = [];
        if (segmentFields.includes('segments.date')) {
            order.push({ field: 'segments.date', direction: 'asc' });
        }
        if (segmentFields.includes('segments.hour')) {
            order.push({ field: 'segments.hour', direction: 'asc' });
        }
        if (segmentFields.includes('segments.placement')) {
            order.push({ field: 'segments.placement', direction: 'asc' });
        }
        return order;
    }
    if (performance) {
        return [{ field: 'metrics.spend', direction: 'desc' }];
    }
    if (resource === 'product') {
        return [
            { field: 'product.title', direction: 'asc' },
            { field: 'product.asin', direction: 'asc' },
        ];
    }
    return [resource === 'ad' ? { field: 'ad.id', direction: 'asc' } : { field: resource === 'campaign' ? 'campaign.name' : 'adGroup.name', direction: 'asc' }];
};

const appendTieBreakers = (resource: SearchResource, orderBy: readonly SearchOrder[], segmentFields: readonly SearchField[]): SearchOrder[] => {
    const resolved = [...orderBy];
    for (const field of segmentFields) {
        if (!resolved.some(order => order.field === field)) {
            resolved.push({ field, direction: 'asc' });
        }
    }
    const tieBreaker = resource === 'campaign' ? 'campaign.id' : resource === 'ad_group' ? 'adGroup.id' : resource === 'ad' ? 'ad.id' : 'product.asin';
    if (!resolved.some(order => order.field === tieBreaker)) {
        resolved.push({ field: tieBreaker, direction: 'asc' });
    }
    return resolved;
};

const fieldsForResource = (resource: SearchResource) => SEARCH_FIELDS.filter(field => isSearchFieldCompatible(resource, field));

const isSearchResource = (resource: string): resource is SearchResource => (SEARCH_RESOURCES as readonly string[]).includes(resource);

const isIsoDate = (value: string) => {
    if (!ISO_DATE_REGEX.test(value)) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const invalidInput = (message: string, details: Record<string, unknown> = {}) => new OperationError('INVALID_INPUT', message, details);

const isPublicPlacement = (value: unknown): value is (typeof PLACEMENT_VALUES)[number] => typeof value === 'string' && (PLACEMENT_VALUES as readonly string[]).includes(value);

const usesSearchField = (input: { fields?: readonly string[]; filters?: readonly { field: string }[]; orderBy?: readonly { field: string }[] }, field: string) =>
    input.fields?.includes(field) || input.filters?.some(filter => filter.field === field) || input.orderBy?.some(order => order.field === field);
