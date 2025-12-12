/**
 * Job: Request report for a specific date.
 * Takes year, month, and day parameters to request a report for that date.
 */

import { z } from 'zod';
import { boss } from '@/jobs/boss.js';

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
});

export const requestReportForDateJob = boss
    .createJob('request-report-for-date')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const { data } of jobs) {
            const { year, month, day } = data;

            // TODO: Implement report request logic
            console.log(`Requesting report for date: ${year}-${month}-${day}`);
        }
    });
