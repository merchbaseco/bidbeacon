import { eq } from 'drizzle-orm';
import { createReport } from '@/amazon-ads/create-report.js';
import { reportConfigs } from '@/config/reports/configs.js';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';
import type { AggregationType, EntityType } from '@/types/reports.js';
import { utcAddHours } from '@/utils/date.js';

export type CreateReportForDatasetInput = {
    accountId: string;
    countryCode: string;
    timestamp: string;
    aggregation: AggregationType;
    entityType: EntityType;
};

/**
 * Creates a report via Amazon Ads API.
 * Returns the reportId if successful, throws an error otherwise.
 */
export async function createReportForDataset(input: CreateReportForDatasetInput): Promise<string> {
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
    let reportId: string;
    try {
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

        if (!response.success || response.success.length === 0) {
            throw new Error(
                `Failed to create ${input.aggregation} ${input.entityType} report - API response did not contain success data (account: ${input.accountId}, period: ${input.timestamp}, date range: ${startDate} to ${endDate})`
            );
        }

        reportId = response.success[0]?.report?.reportId || '';
        if (!reportId) {
            throw new Error(`Failed to create ${input.aggregation} ${input.entityType} report - no reportId returned from API (account: ${input.accountId}, period: ${input.timestamp})`);
        }
    } catch (error) {
        // Wrap error with context about what we were trying to create
        if (error instanceof Error) {
            throw new Error(
                `Failed to create ${input.aggregation} ${input.entityType} report for account ${input.accountId} (period: ${input.timestamp}, date range: ${startDate} to ${endDate}): ${error.message}`,
                { cause: error }
            );
        }
        throw error;
    }

    return reportId;
}
