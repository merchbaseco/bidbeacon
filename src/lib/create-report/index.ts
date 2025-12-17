import { toZonedTime } from 'date-fns-tz';
import { and, eq } from 'drizzle-orm';
import { createReport } from '@/amazon-ads/create-report.js';
import { reportConfigs } from '@/config/reports/configs.js';
import { db } from '@/db/index.js';
import { advertiserAccount, reportDatasetMetadata } from '@/db/schema.js';
import type { AggregationType, EntityType } from '@/types/reports.js';
import { utcAddHours, utcNow } from '@/utils/date.js';
import { emitReportDatasetMetadataUpdated } from '@/utils/emit-report-dataset-metadata-updated.js';
import { getTimezoneForCountry } from '@/utils/timezones.js';

export type CreateReportForDatasetInput = {
    accountId: string;
    countryCode: string;
    timestamp: string;
    aggregation: AggregationType;
    entityType: EntityType;
};

/**
 * Creates a report for a dataset and updates the metadata.
 * Returns the reportId if successful, null otherwise.
 */
export async function createReportForDataset(input: CreateReportForDatasetInput): Promise<string | null> {
    const reportConfig = reportConfigs[input.aggregation][input.entityType];
    const date = new Date(input.timestamp);

    // Find the advertiser account
    const account = await db.query.advertiserAccount.findFirst({
        where: eq(advertiserAccount.adsAccountId, input.accountId),
        columns: {
            adsAccountId: true,
        },
    });

    if (!account) {
        throw new Error('Advertiser account not found');
    }

    // Calculate date window
    const windowStart = new Date(input.timestamp);
    const windowEnd = input.aggregation === 'hourly' ? utcAddHours(windowStart, 1) : windowStart;

    const formatDate = (date: Date): string => {
        const isoString = date.toISOString();
        const datePart = isoString.split('T')[0];
        if (!datePart) {
            throw new Error('Failed to format date');
        }
        return datePart;
    };

    const startDate = formatDate(windowStart);
    const endDate = formatDate(windowEnd);

    // Create the report via Amazon Ads API
    const response = await createReport(
        {
            accessRequestedAccounts: [
                {
                    advertiserAccountId: account.adsAccountId,
                },
            ],
            reports: [
                {
                    format: reportConfig.format,
                    periods: [
                        {
                            datePeriod: {
                                startDate,
                                endDate,
                            },
                        },
                    ],
                    query: {
                        fields: reportConfig.fields,
                    },
                },
            ],
        },
        'na'
    );

    if (response.success && response.success.length > 0) {
        const reportId = response.success[0]?.report?.reportId;
        if (reportId) {
            // Convert current UTC time to country's timezone and store as timezone-less timestamp
            const timezone = getTimezoneForCountry(input.countryCode);
            const nowUtc = utcNow();
            const zonedTime = toZonedTime(nowUtc, timezone);
            const lastReportCreatedAt = new Date(zonedTime.getFullYear(), zonedTime.getMonth(), zonedTime.getDate(), zonedTime.getHours(), zonedTime.getMinutes(), zonedTime.getSeconds());

            // Update metadata with reportId and status
            const [updatedRow] = await db
                .update(reportDatasetMetadata)
                .set({
                    reportId,
                    status: 'fetching',
                    lastRefreshed: utcNow(),
                    lastReportCreatedAt,
                    error: null,
                })
                .where(
                    and(
                        eq(reportDatasetMetadata.accountId, input.accountId),
                        eq(reportDatasetMetadata.timestamp, date),
                        eq(reportDatasetMetadata.aggregation, input.aggregation),
                        eq(reportDatasetMetadata.entityType, input.entityType)
                    )
                )
                .returning();

            if (updatedRow) {
                emitReportDatasetMetadataUpdated(updatedRow);
            }

            return reportId;
        }
    }

    return null;
}
