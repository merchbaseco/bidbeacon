import { formatInTimeZone } from 'date-fns-tz';
import type { InferInsertModel } from 'drizzle-orm';
import type { performanceDaily, performanceHourly } from '@/db/schema';
import { zonedStartOfDay, zonedSubtractDays } from '@/utils/date';
import type { SeededRandom } from './random';
import type { SeedTarget } from './types';

/**
 * Impressions, clicks, spend, sales, and purchases for the seeded targets.
 *
 * The dashboard's default view is "today" at hourly granularity, and its
 * comparison ranges read the daily table, so the seed writes both. The last two
 * days are generated hour by hour and their daily rows are the sum of those
 * hours, which keeps the two tables telling the same story; older days are
 * generated at day grain directly. Today stops at the current local hour, so
 * the newest day reads as in-progress rather than mysteriously complete.
 *
 * Rows are written only where there were impressions. A real report has no row
 * for a keyword that did not serve, and the empty hours are what give the chart
 * its shape.
 */

type DailyRow = InferInsertModel<typeof performanceDaily>;
type HourlyRow = InferInsertModel<typeof performanceHourly>;

/** Share of a day's demand landing in each local hour. Sums to 1. */
const HOUR_SHARES = [0.008, 0.005, 0.004, 0.004, 0.006, 0.012, 0.022, 0.034, 0.045, 0.055, 0.063, 0.066, 0.065, 0.062, 0.058, 0.055, 0.054, 0.056, 0.062, 0.068, 0.069, 0.055, 0.038, 0.021];
const HOURLY_DAY_COUNT = 2;
const BASE_DAILY_IMPRESSIONS = 780;
const CENTS = 100;
const HOUR_MS = 60 * 60 * 1000;

export const buildPerformance = (input: { accountId: string; dayCount: number; now: Date; random: SeededRandom; targets: SeedTarget[]; timezone: string }) => {
    const daily: DailyRow[] = [];
    const hourly: HourlyRow[] = [];

    for (let dayOffset = input.dayCount - 1; dayOffset >= 0; dayOffset -= 1) {
        const bucketStart = zonedStartOfDay(zonedSubtractDays(input.now, dayOffset, input.timezone), input.timezone);
        const bucketDate = formatInTimeZone(bucketStart, input.timezone, 'yyyy-MM-dd');
        const dayFactor = buildDayFactor({ bucketStart, dayOffset, random: input.random, timezone: input.timezone, totalDays: input.dayCount });
        const hourGrain = dayOffset < HOURLY_DAY_COUNT;
        // Walk real hours to the next local midnight rather than assuming 24 of
        // them, and read each bucket's local label back off its instant, the way
        // the stream summariser does. A DST day is then 23 or 25 buckets with
        // correct labels, and no two buckets share a `bucket_start`.
        const dayEndInstant = Math.min(zonedStartOfDay(zonedSubtractDays(input.now, dayOffset - 1, input.timezone), input.timezone).getTime(), input.now.getTime());

        for (const target of input.targets) {
            if (target.startDayOffset < dayOffset) {
                continue;
            }

            const impressionMean = target.salesWeight * BASE_DAILY_IMPRESSIONS * dayFactor;
            if (!hourGrain) {
                const measured = measure(input.random, target, impressionMean);
                if (measured.impressions === 0) {
                    continue;
                }
                daily.push({ accountId: input.accountId, bucketDate, bucketStart, ...entityColumns(target), ...measured });
                continue;
            }

            const dayTotal = { clicks: 0, impressions: 0, purchases: 0, sales: 0, spend: 0 };
            for (let instant = bucketStart.getTime(); instant < dayEndInstant; instant += HOUR_MS) {
                const hourStart = new Date(instant);
                const localHour = Number(formatInTimeZone(hourStart, input.timezone, 'H'));
                const share = HOUR_SHARES[localHour] ?? 0;
                const measured = measure(input.random, target, impressionMean * share);
                if (measured.impressions === 0) {
                    continue;
                }

                dayTotal.clicks += measured.clicks;
                dayTotal.impressions += measured.impressions;
                dayTotal.purchases += measured.purchases;
                dayTotal.sales += Number(measured.sales);
                dayTotal.spend += Number(measured.spend);

                hourly.push({
                    accountId: input.accountId,
                    bucketDate: formatInTimeZone(hourStart, input.timezone, 'yyyy-MM-dd'),
                    bucketHour: localHour,
                    bucketStart: hourStart,
                    ...entityColumns(target),
                    ...measured,
                });
            }

            if (dayTotal.impressions === 0) {
                continue;
            }

            daily.push({
                accountId: input.accountId,
                bucketDate,
                bucketStart,
                ...entityColumns(target),
                clicks: dayTotal.clicks,
                impressions: dayTotal.impressions,
                purchases: dayTotal.purchases,
                sales: dayTotal.sales.toFixed(2),
                spend: dayTotal.spend.toFixed(2),
            });
        }
    }

    return { daily, hourly };
};

const entityColumns = (target: SeedTarget) => ({
    adGroupId: target.adGroupId,
    adId: target.adId,
    campaignId: target.campaignId,
    // The stream summariser leaves this null on target rows; the match type is
    // read from the target itself, and the seed writes what the job writes.
    entityId: target.targetId,
    entityType: 'target' as const,
    targetMatchType: null,
});

/** One bucket of measured demand for a target. */
const measure = (random: SeededRandom, target: SeedTarget, impressionMean: number) => {
    const impressions = random.poisson(impressionMean);
    if (impressions === 0) {
        return { clicks: 0, impressions: 0, purchases: 0, sales: '0.00', spend: '0.00' };
    }

    const clicks = Math.min(impressions, random.poisson(impressions * random.between(0.003, 0.011)));
    const costPerClick = target.bidAmount * random.between(0.55, 0.94);
    const spend = Math.round(clicks * costPerClick * CENTS) / CENTS;
    const purchases = Math.min(clicks, random.poisson(clicks * target.conversionRate));
    const sales = Math.round(purchases * target.unitPrice * random.between(1, 1.45) * CENTS) / CENTS;

    return { clicks, impressions, purchases, sales: sales.toFixed(2), spend: spend.toFixed(2) };
};

/**
 * Weekends run hotter, the account is gently growing, and one day in the window
 * spikes — enough shape that a chart of the week is worth looking at.
 */
const buildDayFactor = (input: { bucketStart: Date; dayOffset: number; random: SeededRandom; timezone: string; totalDays: number }) => {
    const weekday = formatInTimeZone(input.bucketStart, input.timezone, 'i');
    const weekend = weekday === '6' || weekday === '7' ? 1.28 : 1;
    const trend = 1 + (input.totalDays - input.dayOffset) / (input.totalDays * 4);
    const spike = input.dayOffset === Math.floor(input.totalDays / 3) ? 1.9 : 1;

    return weekend * trend * spike * input.random.between(0.85, 1.15);
};
