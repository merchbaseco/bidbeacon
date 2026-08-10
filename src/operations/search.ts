import { getAdvertiserAccountMetadata } from '@/utils/advertiser-account-metadata';
import { resolveAdvertiserAccount } from './advertiser-accounts';
import type { OperationContext } from './operation-context';
import { OperationError } from './operation-errors';
import { queryCampaignSearchCoverage, queryTargetSearchCoverage } from './search-coverage';
import { decodeSearchCursor, encodeSearchCursor } from './search-cursor';
import { summarizeSearchMetrics } from './search-metrics';
import { planSearch, searchOutputSchema } from './search-planner';
import { compareSearchRowToBoundary, filterSearchRows, querySearchRows, type SearchRow, sortSearchRows } from './search-query';

export type SearchExecutionOptions = {
    now?: Date;
};

export const search = async (context: OperationContext, input: unknown, options: SearchExecutionOptions = {}) => {
    const accountId = input && typeof input === 'object' && 'accountId' in input ? (input as { accountId?: unknown }).accountId : undefined;
    const account = await resolveAdvertiserAccount(context, { accountId });
    const metadata = getAdvertiserAccountMetadata(account.countryCode);
    const plan = planSearch(input, { timezone: metadata.timezone, now: options.now });
    const cursorBoundary = plan.cursor ? decodeSearchCursor(plan.cursor, plan.fingerprint).boundary : undefined;
    if (cursorBoundary && cursorBoundary.length !== plan.orderBy.length) {
        throw new OperationError('CURSOR_INVALID', 'The Search cursor is malformed or bound to a different query.');
    }

    const [queriedRows, coverage] = await Promise.all([
        querySearchRows(context, account, plan),
        plan.performance && plan.dateRange
            ? plan.resource === 'target'
                ? queryTargetSearchCoverage(context, account, plan.dateRange, metadata.timezone)
                : queryCampaignSearchCoverage(context, account, plan.dateRange, metadata.timezone)
            : Promise.resolve(undefined),
    ]);

    const filteredRows = filterSearchRows(queriedRows, plan.filters, plan.segmentFields);
    const sortedRows = sortSearchRows(filteredRows, plan.orderBy);
    const rowsAfterCursor = cursorBoundary ? sortedRows.filter(row => compareSearchRowToBoundary(row, cursorBoundary, plan.orderBy) > 0) : sortedRows;
    const pageRows = rowsAfterCursor.slice(0, plan.limit);
    const hasNextPage = rowsAfterCursor.length > pageRows.length;
    const nextCursor = hasNextPage
        ? encodeSearchCursor(
              plan.fingerprint,
              plan.orderBy.map(order => pageRows.at(-1)?.values[order.field])
          )
        : undefined;

    const enrichedRows = await enrichProductTitles(context, metadata.marketplaceId, plan.resource, plan.fields, pageRows);
    const result: {
        context: Record<string, unknown>;
        summary?: Record<string, number | null>;
        rows: Record<string, unknown>[];
        nextCursor?: string;
    } = {
        context: {
            account: { id: account.id, timezone: metadata.timezone, currency: metadata.currency },
            resource: plan.resource,
            fields: [...plan.fields],
            ...(plan.dateRange ? { dateRange: plan.dateRange } : {}),
            orderBy: [...plan.orderBy],
            ...(coverage ? { coverage } : {}),
        },
        ...(plan.performance ? { summary: summarizeSearchMetrics(filteredRows) } : {}),
        rows: enrichedRows.map(row => Object.fromEntries(plan.fields.map(field => [field, row.values[field]]))),
    };

    if (nextCursor) {
        result.nextCursor = nextCursor;
    }

    return searchOutputSchema.parse(result);
};

const enrichProductTitles = async (context: OperationContext, marketplaceId: string, resource: string, fields: readonly string[], rows: SearchRow[]) => {
    const titleField = resource === 'product' ? 'product.title' : resource === 'ad' ? 'ad.productTitle' : null;
    const asinField = resource === 'product' ? 'product.asin' : resource === 'ad' ? 'ad.asin' : null;
    if (!(titleField && asinField && fields.includes(titleField))) {
        return rows;
    }

    const asins = [...new Set(rows.flatMap(row => (typeof row.values[asinField] === 'string' ? [(row.values[asinField] as string).toUpperCase()] : [])))];
    if (asins.length === 0) {
        return rows;
    }

    try {
        const resolved = await context.products.resolveProducts({ marketplaceId, asins });
        const titles = new Map(resolved.map(product => [product.asin.toUpperCase(), product.title]));
        return rows.map(row => {
            const asin = row.values[asinField];
            const title = typeof asin === 'string' ? titles.get(asin.toUpperCase()) : undefined;
            return title === undefined ? row : { values: { ...row.values, [titleField]: title } };
        });
    } catch {
        return rows;
    }
};
