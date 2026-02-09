import { addMilliseconds, differenceInCalendarDays, endOfDay, getDaysInMonth, startOfDay, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subWeeks, subYears } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const TIMEZONE_SUFFIX_REGEX = /[zZ]|[+-]\d{2}:\d{2}$/;

type PerformanceRangeKey = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_year' | 'last_30_days' | 'last_6_months' | 'last_12_months' | 'all_time';

type CustomDateRange = {
    start: string;
    end: string;
};

type PerformanceGranularity = 'hour' | 'day' | 'month';

type PerformanceRangeInput = {
    range: PerformanceRangeKey;
    timezone: string;
    now?: Date;
    allTimeStartUtc?: Date | null;
    customRange?: CustomDateRange | null;
};

type PerformanceRangeResult = {
    rangeStartZoned: Date;
    rangeEndZoned: Date;
    rangeEndExclusiveZoned: Date;
    rangeStartUtc: Date;
    rangeEndUtc: Date;
    rangeEndExclusiveUtc: Date;
    granularity: PerformanceGranularity;
    shouldCompare: boolean;
    compareStartZoned?: Date;
    compareEndExclusiveZoned?: Date;
    compareStartUtc?: Date;
    compareEndExclusiveUtc?: Date;
};

export const getPerformanceRange = (input: PerformanceRangeInput): PerformanceRangeResult => {
    const now = input.now ?? new Date();
    const zonedNow = toZonedTime(now, input.timezone);
    const endOfToday = endOfDay(zonedNow);
    const hasCustomRange = Boolean(input.customRange);

    let rangeStartZoned = startOfDay(zonedNow);
    let rangeEndZoned = endOfToday;
    let granularity: PerformanceGranularity = 'hour';

    if (input.customRange) {
        const normalized = normalizeCustomRange(input.customRange, input.timezone);
        rangeStartZoned = normalized.start;
        rangeEndZoned = normalized.end;
        granularity = getGranularityForCustomRange(rangeStartZoned, rangeEndZoned);
    } else {
        if (input.range === 'yesterday') {
            const yesterday = subDays(zonedNow, 1);
            rangeStartZoned = startOfDay(yesterday);
            rangeEndZoned = endOfDay(yesterday);
            granularity = 'hour';
        }

        if (input.range === 'this_week') {
            rangeStartZoned = startOfWeek(zonedNow, { weekStartsOn: 0 });
            rangeEndZoned = endOfToday;
            granularity = 'day';
        }

        if (input.range === 'this_month') {
            rangeStartZoned = startOfMonth(zonedNow);
            rangeEndZoned = endOfToday;
            granularity = 'day';
        }

        if (input.range === 'this_year') {
            rangeStartZoned = startOfYear(zonedNow);
            rangeEndZoned = endOfToday;
            granularity = 'month';
        }

        if (input.range === 'last_30_days') {
            rangeStartZoned = startOfDay(subDays(zonedNow, 29));
            rangeEndZoned = endOfToday;
            granularity = 'day';
        }

        if (input.range === 'last_6_months') {
            rangeStartZoned = startOfMonth(subMonths(zonedNow, 5));
            rangeEndZoned = endOfToday;
            granularity = 'month';
        }

        if (input.range === 'last_12_months') {
            rangeStartZoned = startOfMonth(subMonths(zonedNow, 11));
            rangeEndZoned = endOfToday;
            granularity = 'month';
        }

        if (input.range === 'all_time') {
            if (input.allTimeStartUtc) {
                rangeStartZoned = startOfDay(toZonedTime(input.allTimeStartUtc, input.timezone));
            }
            rangeEndZoned = endOfToday;
            granularity = 'month';
        }
    }

    const rangeEndExclusiveZoned = addMilliseconds(rangeEndZoned, 1);
    const rangeStartUtc = fromZonedTime(rangeStartZoned, input.timezone);
    const rangeEndUtc = fromZonedTime(rangeEndZoned, input.timezone);
    const rangeEndExclusiveUtc = fromZonedTime(rangeEndExclusiveZoned, input.timezone);

    const shouldCompare = hasCustomRange || input.range !== 'all_time';
    let compareStartZoned: Date | undefined;
    let compareEndExclusiveZoned: Date | undefined;

    if (shouldCompare) {
        if (hasCustomRange || isRollingRange(input.range)) {
            const durationMs = rangeEndExclusiveZoned.getTime() - rangeStartZoned.getTime();
            compareStartZoned = new Date(rangeStartZoned.getTime() - durationMs);
            compareEndExclusiveZoned = new Date(rangeEndExclusiveZoned.getTime() - durationMs);
        }

        if (!hasCustomRange && input.range === 'today') {
            compareStartZoned = startOfDay(subDays(rangeStartZoned, 1));
            compareEndExclusiveZoned = startOfDay(rangeStartZoned);
        }

        if (!hasCustomRange && input.range === 'yesterday') {
            compareStartZoned = startOfDay(subDays(rangeStartZoned, 1));
            compareEndExclusiveZoned = startOfDay(rangeStartZoned);
        }

        if (!hasCustomRange && input.range === 'this_week') {
            const compareWeekStart = startOfWeek(subWeeks(rangeStartZoned, 1), { weekStartsOn: 0 });
            const durationMs = rangeEndExclusiveZoned.getTime() - rangeStartZoned.getTime();
            compareStartZoned = compareWeekStart;
            compareEndExclusiveZoned = new Date(compareWeekStart.getTime() + durationMs);
        }

        if (!hasCustomRange && input.range === 'this_month') {
            const compareStart = startOfMonth(subMonths(rangeStartZoned, 1));
            const clampedDay = Math.min(rangeEndZoned.getDate(), getDaysInMonth(compareStart));
            const compareEndZoned = endOfDay(setDate(compareStart, clampedDay));
            compareStartZoned = compareStart;
            compareEndExclusiveZoned = addMilliseconds(compareEndZoned, 1);
        }

        if (!hasCustomRange && input.range === 'this_year') {
            const compareStart = startOfYear(subYears(rangeStartZoned, 1));
            const compareEndCandidate = clampMonthDay(compareStart, rangeEndZoned.getMonth(), rangeEndZoned.getDate());
            const compareEndZoned = endOfDay(compareEndCandidate);
            compareStartZoned = compareStart;
            compareEndExclusiveZoned = addMilliseconds(compareEndZoned, 1);
        }
    }

    const compareStartUtc = compareStartZoned ? fromZonedTime(compareStartZoned, input.timezone) : undefined;
    const compareEndExclusiveUtc = compareEndExclusiveZoned ? fromZonedTime(compareEndExclusiveZoned, input.timezone) : undefined;

    return {
        rangeStartZoned,
        rangeEndZoned,
        rangeEndExclusiveZoned,
        rangeStartUtc,
        rangeEndUtc,
        rangeEndExclusiveUtc,
        granularity,
        shouldCompare,
        compareStartZoned,
        compareEndExclusiveZoned,
        compareStartUtc,
        compareEndExclusiveUtc,
    };
};

const isRollingRange = (range: PerformanceRangeKey) => {
    return range === 'last_30_days' || range === 'last_6_months' || range === 'last_12_months';
};

const getGranularityForCustomRange = (start: Date, end: Date): PerformanceGranularity => {
    const daySpan = differenceInCalendarDays(startOfDay(end), startOfDay(start)) + 1;
    if (daySpan <= 1) {
        return 'hour';
    }
    if (daySpan <= 120) {
        return 'day';
    }
    return 'month';
};

const normalizeCustomRange = (range: CustomDateRange, timezone: string) => {
    const start = parseCustomBoundary(range.start, 'start', timezone);
    const end = parseCustomBoundary(range.end, 'end', timezone);
    if (start.getTime() <= end.getTime()) {
        return { start, end };
    }
    return { start: end, end: start };
};

const parseCustomBoundary = (value: string, boundary: 'start' | 'end', timezone: string) => {
    const trimmed = value.trim();
    const hasTime = trimmed.includes('T');
    const hasTimezone = TIMEZONE_SUFFIX_REGEX.test(trimmed);

    if (!hasTime) {
        const suffix = boundary === 'start' ? 'T00:00:00.000' : 'T23:59:59.999';
        const utc = fromZonedTime(`${trimmed}${suffix}`, timezone);
        return toZonedTime(utc, timezone);
    }

    if (!hasTimezone) {
        const utc = fromZonedTime(trimmed, timezone);
        return toZonedTime(utc, timezone);
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        const utc = fromZonedTime(trimmed, timezone);
        return toZonedTime(utc, timezone);
    }

    return toZonedTime(parsed, timezone);
};

const setDate = (date: Date, dayOfMonth: number) => {
    const next = new Date(date);
    next.setDate(dayOfMonth);
    return next;
};

const clampMonthDay = (base: Date, monthIndex: number, dayOfMonth: number) => {
    const candidate = new Date(base);
    candidate.setMonth(monthIndex, 1);
    const maxDay = getDaysInMonth(candidate);
    candidate.setDate(Math.min(dayOfMonth, maxDay));
    return candidate;
};
