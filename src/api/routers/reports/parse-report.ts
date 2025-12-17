import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { and, eq } from 'drizzle-orm';
import { retrieveReport } from '@/amazon-ads/retrieve-report.js';
import { reportConfigs } from '@/config/reports/configs.js';
import { db } from '@/db/index.js';
import { advertiserAccount, performanceDaily, performanceHourly, reportDatasetMetadata, target } from '@/db/schema.js';
import { keepOnlyAscii } from '@/utils/string.js';
import { getTimezoneForCountry } from '@/utils/timezones.js';

const gunzipAsync = promisify(gunzip);

const PREDEFINED_MATCH_TYPE_MAP = {
    'close-match': 'SEARCH_CLOSE_MATCH',
    'loose-match': 'SEARCH_LOOSE_MATCH',
    substitutes: 'PRODUCT_SUBSTITUTES',
    complements: 'PRODUCT_COMPLEMENTS',
} as const;

type PredefinedValue = keyof typeof PREDEFINED_MATCH_TYPE_MAP;

function convertToTargetExportMatchType(matchType: string, targetValue: string): string {
    switch (matchType) {
        case 'PHRASE':
        case 'BROAD':
        case 'EXACT':
            return matchType;

        case 'TARGETING_EXPRESSION':
            return targetValue.includes('expanded') ? 'PRODUCT_SIMILAR' : 'PRODUCT_EXACT';

        case 'TARGETING_EXPRESSION_PREDEFINED': {
            const validPredefinedValues = Object.keys(PREDEFINED_MATCH_TYPE_MAP);
            if (!validPredefinedValues.includes(targetValue)) {
                throw new Error(`Invalid predefined expression value: ${targetValue}. Expected one of: ${validPredefinedValues.join(', ')}`);
            }
            return PREDEFINED_MATCH_TYPE_MAP[targetValue as PredefinedValue];
        }

        default:
            throw new Error(`Failed to convert target ${matchType} in convertToTargetExportMatchType. targetValue: ${targetValue}`);
    }
}

async function lookupTargetId(row: {
    'adGroup.id': string;
    'target.value': string;
    'target.matchType': string;
    'searchTerm.value': string;
}): Promise<{ entityType: string; entityId: string; matchType: string | undefined }> {
    const adGroupId = row['adGroup.id'];
    const targetValue = row['target.value'];
    const matchType = row['target.matchType'];
    const matchedTargetValue = keepOnlyAscii(row['searchTerm.value']);

    if (!targetValue || !matchType) {
        if (!matchedTargetValue) {
            console.error('[lookupTargetId] Failed to find target (fallback mode - all values empty). Row:', JSON.stringify(row, null, 2));
            throw new Error(
                `Could not find target for adGroupId: ${adGroupId}, matchedTargetValue: ${matchedTargetValue} (fallback mode - target.value and target.matchType were empty, but searchTerm.value is also empty)`
            );
        }

        const result = await db.query.target.findFirst({
            where: and(eq(target.adGroupId, adGroupId), eq(target.targetKeyword, matchedTargetValue), eq(target.targetMatchType, 'EXACT')),
            columns: { targetId: true },
        });

        if (!result) {
            console.error('[lookupTargetId] Failed to find target (fallback mode). Row:', JSON.stringify(row, null, 2));
            throw new Error(`Could not find target for adGroupId: ${adGroupId}, matchedTargetValue: ${matchedTargetValue} (fallback mode - target.value and target.matchType were empty)`);
        }

        return {
            entityType: matchedTargetValue,
            entityId: result.targetId,
            matchType: 'EXACT',
        };
    }

    const targetExportMatchType = convertToTargetExportMatchType(matchType, targetValue);

    switch (matchType) {
        case 'PHRASE':
        case 'BROAD':
        case 'EXACT': {
            const result = await db.query.target.findFirst({
                where: and(eq(target.adGroupId, adGroupId), eq(target.targetKeyword, targetValue), eq(target.targetMatchType, targetExportMatchType)),
                columns: { targetId: true },
            });

            if (!result) {
                console.error('[lookupTargetId] Failed to find target (PHRASE/BROAD/EXACT). Row:', JSON.stringify(row, null, 2));
                throw new Error(`Could not find target for adGroupId: ${adGroupId}, targetValue: ${targetValue}, matchType: ${matchType} (converted: ${targetExportMatchType})`);
            }

            return {
                entityType: targetValue,
                entityId: result.targetId,
                matchType: targetExportMatchType,
            };
        }

        case 'TARGETING_EXPRESSION': {
            const asin = parseAsinFromTargetValue(targetValue);

            if (!asin) {
                console.error('[lookupTargetId] Failed to parse ASIN from targetValue. Row:', JSON.stringify(row, null, 2));
                throw new Error(`Could not parse ASIN from targetValue: ${targetValue}`);
            }

            const result = await db.query.target.findFirst({
                where: and(eq(target.adGroupId, adGroupId), eq(target.targetAsin, asin), eq(target.targetMatchType, targetExportMatchType)),
                columns: { targetId: true },
            });

            if (!result) {
                console.error('[lookupTargetId] Failed to find target (TARGETING_EXPRESSION). Row:', JSON.stringify(row, null, 2));
                throw new Error(`Could not find target for adGroupId: ${adGroupId}, asin: ${asin}, matchType: ${matchType} (converted: ${targetExportMatchType})`);
            }

            return {
                entityType: targetValue,
                entityId: result.targetId,
                matchType: targetExportMatchType,
            };
        }

        case 'TARGETING_EXPRESSION_PREDEFINED': {
            const result = await db.query.target.findFirst({
                where: and(eq(target.adGroupId, adGroupId), eq(target.targetMatchType, targetExportMatchType), eq(target.targetType, 'AUTO')),
                columns: { targetId: true },
            });

            if (!result) {
                console.error('[lookupTargetId] Failed to find target (TARGETING_EXPRESSION_PREDEFINED). Row:', JSON.stringify(row, null, 2));
                throw new Error(`Could not find target for adGroupId: ${adGroupId}, matchType: ${matchType} (converted: ${targetExportMatchType}), targetType: AUTO`);
            }

            return {
                entityType: targetValue,
                entityId: result.targetId,
                matchType: targetExportMatchType,
            };
        }

        default:
            console.error('[lookupTargetId] Unknown matchType. Row:', JSON.stringify(row, null, 2));
            throw new Error(`Failed to find targetId for matchType: ${matchType}`);
    }
}

function parseAsinFromTargetValue(targetValue: string): string | null {
    const match = targetValue.match(/asin(?:-expanded)?="([^"]+)"/);
    return match?.[1] ?? null;
}

function parseHourlyTimestamp(hourValue: string, timezone: string): { bucketStart: Date; bucketDate: string; bucketHour: number } {
    const localDateMatch = hourValue.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):/);
    if (!localDateMatch) {
        throw new Error(`Invalid hour.value format: ${hourValue}`);
    }

    const bucketDate = localDateMatch[1];
    const bucketHour = parseInt(localDateMatch[2], 10);

    const localDateTimeString = `${bucketDate}T${String(bucketHour).padStart(2, '0')}:00:00`;

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const roughUtc = new Date(`${localDateTimeString}Z`);

    const parts = formatter.formatToParts(roughUtc);
    const formattedHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const formattedDay = parseInt(parts.find(p => p.type === 'day')?.value ?? '0', 10);
    const roughDay = roughUtc.getUTCDate();
    const roughHour = roughUtc.getUTCHours();

    let offsetHours = formattedHour - roughHour;
    if (formattedDay !== roughDay) {
        offsetHours += formattedDay > roughDay ? 24 : -24;
    }

    const bucketStart = new Date(roughUtc.getTime() - offsetHours * 60 * 60 * 1000);

    return { bucketStart, bucketDate, bucketHour };
}

function parseDailyTimestamp(dateValue: string, timezone: string): { bucketStart: Date; bucketDate: string } {
    const bucketDate = dateValue;
    const { bucketStart } = parseHourlyTimestamp(`${dateValue}T00:00:00`, timezone);
    return { bucketStart, bucketDate };
}

export async function parseReportHandler(input: { accountId: string; countryCode: string; timestamp: string; aggregation: 'hourly' | 'daily'; entityType: 'target' | 'product' }) {
    const date = new Date(input.timestamp);
    const reportConfig = reportConfigs[input.aggregation][input.entityType];

    console.log(`[API] Parse report request received: ${input.aggregation}/${input.entityType} for ${input.accountId} at ${input.timestamp}`);

    const account = await db.query.advertiserAccount.findFirst({
        where: eq(advertiserAccount.adsAccountId, input.accountId),
        columns: {
            adsAccountId: true,
            profileId: true,
        },
    });

    if (!account) {
        throw new Error('Advertiser account not found');
    }

    if (!account.profileId) {
        throw new Error('Profile ID not found for this account');
    }

    const reportMetadata = await db.query.reportDatasetMetadata.findFirst({
        where: and(
            eq(reportDatasetMetadata.accountId, input.accountId),
            eq(reportDatasetMetadata.timestamp, date),
            eq(reportDatasetMetadata.aggregation, input.aggregation),
            eq(reportDatasetMetadata.entityType, input.entityType)
        ),
    });

    if (!reportMetadata) {
        throw new Error('Report metadata not found');
    }

    if (!reportMetadata.reportId) {
        throw new Error('No reportId found for this report. Create the report first.');
    }

    const retrieveResponse = await retrieveReport(
        {
            profileId: Number(account.profileId),
            reportIds: [reportMetadata.reportId],
        },
        'na'
    );

    const report = retrieveResponse.success?.[0]?.report;
    if (!report) {
        throw new Error('Report not found in retrieve response');
    }

    if (report.status !== 'COMPLETED') {
        throw new Error(`Report is not ready. Current status: ${report.status}`);
    }

    const reportParts = report.completedReportParts;
    if (!reportParts || reportParts.length === 0) {
        throw new Error('No completed report parts found');
    }

    const reportUrl = reportParts[0]?.url;
    if (!reportUrl) {
        throw new Error('No URL found in report parts');
    }

    console.log(`[API] Downloading report from URL...`);

    const response = await fetch(reportUrl, {
        signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
        throw new Error(`Failed to download report: ${response.status} ${response.statusText}`);
    }

    const compressedData = await response.arrayBuffer();
    const decompressedData = await gunzipAsync(Buffer.from(compressedData));
    const rawJson = JSON.parse(decompressedData.toString());

    const { z } = await import('zod');
    const rows = z.array(reportConfig.rowSchema).parse(rawJson);

    console.log(`[API] Parsed ${rows.length} rows from report`);

    const timezone = getTimezoneForCountry(input.countryCode);

    let insertedCount = 0;
    for (const row of rows) {
        const { entityId, matchType } = await lookupTargetId(row);

        if (reportConfig.aggregation === 'hourly') {
            const hourValue = (row as { 'hour.value': string })['hour.value'];
            const { bucketStart, bucketDate, bucketHour } = parseHourlyTimestamp(hourValue, timezone);

            await db
                .insert(performanceHourly)
                .values({
                    accountId: input.accountId,
                    bucketStart,
                    bucketDate,
                    bucketHour,
                    campaignId: row['campaign.id'],
                    adGroupId: row['adGroup.id'],
                    adId: row['ad.id'],
                    entityType: reportConfig.entityType,
                    entityId,
                    targetMatchType: matchType,
                    impressions: row['metric.impressions'],
                    clicks: row['metric.clicks'],
                    spend: String(row['metric.totalCost']),
                    sales: String(row['metric.sales']),
                    orders: row['metric.purchases'],
                })
                .onConflictDoUpdate({
                    target: [performanceHourly.accountId, performanceHourly.bucketStart, performanceHourly.adId, performanceHourly.entityType, performanceHourly.entityId],
                    set: {
                        campaignId: row['campaign.id'],
                        adGroupId: row['adGroup.id'],
                        targetMatchType: matchType,
                        impressions: row['metric.impressions'],
                        clicks: row['metric.clicks'],
                        spend: String(row['metric.totalCost']),
                        sales: String(row['metric.sales']),
                        orders: row['metric.purchases'],
                    },
                });
        } else {
            const dateValue = (row as { 'date.value': string })['date.value'];
            const { bucketStart, bucketDate } = parseDailyTimestamp(dateValue, timezone);

            await db
                .insert(performanceDaily)
                .values({
                    accountId: input.accountId,
                    bucketStart,
                    bucketDate,
                    campaignId: row['campaign.id'],
                    adGroupId: row['adGroup.id'],
                    adId: row['ad.id'],
                    entityType: reportConfig.entityType,
                    entityId,
                    targetMatchType: matchType,
                    impressions: row['metric.impressions'],
                    clicks: row['metric.clicks'],
                    spend: String(row['metric.totalCost']),
                    sales: String(row['metric.sales']),
                    orders: row['metric.purchases'],
                })
                .onConflictDoUpdate({
                    target: [performanceDaily.accountId, performanceDaily.bucketDate, performanceDaily.adId, performanceDaily.entityType, performanceDaily.entityId],
                    set: {
                        campaignId: row['campaign.id'],
                        adGroupId: row['adGroup.id'],
                        targetMatchType: matchType,
                        impressions: row['metric.impressions'],
                        clicks: row['metric.clicks'],
                        spend: String(row['metric.totalCost']),
                        sales: String(row['metric.sales']),
                        orders: row['metric.purchases'],
                    },
                });
        }

        insertedCount++;
    }

    await db
        .update(reportDatasetMetadata)
        .set({
            status: 'completed',
            error: null,
        })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, input.accountId),
                eq(reportDatasetMetadata.timestamp, date),
                eq(reportDatasetMetadata.aggregation, input.aggregation),
                eq(reportDatasetMetadata.entityType, input.entityType)
            )
        );

    console.log(`[API] Parse report completed. Inserted/updated ${insertedCount} rows.`);

    return {
        success: true,
        data: {
            rowsProcessed: insertedCount,
        },
    };
}
