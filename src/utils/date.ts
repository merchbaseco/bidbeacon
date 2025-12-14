/**
 * Date utility functions using date-fns-tz for timezone-aware date operations.
 * All functions work with UTC timezone by default.
 */

import { addDays, addHours, startOfDay, startOfHour, subDays, subHours } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * Get the start of the hour in UTC for a given date.
 */
export function utcTopOfHour(date: Date): Date {
    return startOfHour(date);
}

/**
 * Get the start of the day in UTC for a given date.
 */
export function utcStartOfDay(date: Date): Date {
    return startOfDay(date);
}

/**
 * Get the current date/time in UTC.
 */
export function utcNow(): Date {
    return new Date();
}

/**
 * Add hours to a date in UTC.
 */
export function utcAddHours(date: Date, hours: number): Date {
    return addHours(date, hours);
}

/**
 * Subtract hours from a date in UTC.
 */
export function utcSubtractHours(date: Date, hours: number): Date {
    return subHours(date, hours);
}

/**
 * Add days to a date in UTC.
 */
export function utcAddDays(date: Date, days: number): Date {
    return addDays(date, days);
}

/**
 * Subtract days from a date in UTC.
 */
export function utcSubtractDays(date: Date, days: number): Date {
    return subDays(date, days);
}

/**
 * Get the start of the previous hour in UTC.
 */
export function utcPreviousHourStart(date: Date): Date {
    return utcSubtractHours(utcTopOfHour(date), 1);
}

/**
 * Get the start of the previous day in UTC.
 */
export function utcPreviousDayStart(date: Date): Date {
    return utcSubtractDays(utcStartOfDay(date), 1);
}

/**
 * Check if a date is at the start of a day (00:00:00) in UTC.
 */
export function isUtcStartOfDay(date: Date): boolean {
    const start = utcStartOfDay(date);
    return start.getTime() === date.getTime();
}

/**
 * Check if a date is at the start of an hour (XX:00:00) in UTC.
 */
export function isUtcStartOfHour(date: Date): boolean {
    const start = utcTopOfHour(date);
    return start.getTime() === date.getTime();
}

/**
 * Generate an array of hour start times between two dates (inclusive start, exclusive end).
 * Each date represents the start of an hour in UTC.
 */
export function* enumerateUtcHours(start: Date, end: Date): Generator<Date> {
    let current = utcTopOfHour(start);
    const endTime = end.getTime();

    while (current.getTime() < endTime) {
        yield current;
        current = utcAddHours(current, 1);
    }
}

/**
 * Generate an array of day start times between two dates (inclusive start, exclusive end).
 * Each date represents the start of a day in UTC.
 */
export function* enumerateUtcDays(start: Date, end: Date): Generator<Date> {
    let current = utcStartOfDay(start);
    const endTime = end.getTime();

    while (current.getTime() < endTime) {
        yield current;
        current = utcAddDays(current, 1);
    }
}

// ============================================================================
// Timezone-aware date functions
// ============================================================================

/**
 * Get the start of the hour in the specified timezone for a given date.
 */
export function zonedTopOfHour(date: Date, timezone: string): Date {
    const zonedDate = toZonedTime(date, timezone);
    const startOfHourZoned = startOfHour(zonedDate);
    return fromZonedTime(startOfHourZoned, timezone);
}

/**
 * Get the start of the day in the specified timezone for a given date.
 */
export function zonedStartOfDay(date: Date, timezone: string): Date {
    const zonedDate = toZonedTime(date, timezone);
    const startOfDayZoned = startOfDay(zonedDate);
    return fromZonedTime(startOfDayZoned, timezone);
}

/**
 * Get the current date/time (always returns UTC Date object).
 * The timezone parameter is kept for API consistency but not used.
 */
export function zonedNow(_timezone: string): Date {
    return new Date();
}

/**
 * Add hours to a date in the specified timezone.
 */
export function zonedAddHours(date: Date, hours: number, timezone: string): Date {
    const zonedDate = toZonedTime(date, timezone);
    const added = addHours(zonedDate, hours);
    return fromZonedTime(added, timezone);
}

/**
 * Subtract hours from a date in the specified timezone.
 */
export function zonedSubtractHours(date: Date, hours: number, timezone: string): Date {
    const zonedDate = toZonedTime(date, timezone);
    const subtracted = subHours(zonedDate, hours);
    return fromZonedTime(subtracted, timezone);
}

/**
 * Add days to a date in the specified timezone.
 */
export function zonedAddDays(date: Date, days: number, timezone: string): Date {
    const zonedDate = toZonedTime(date, timezone);
    const added = addDays(zonedDate, days);
    return fromZonedTime(added, timezone);
}

/**
 * Subtract days from a date in the specified timezone.
 */
export function zonedSubtractDays(date: Date, days: number, timezone: string): Date {
    const zonedDate = toZonedTime(date, timezone);
    const subtracted = subDays(zonedDate, days);
    return fromZonedTime(subtracted, timezone);
}

/**
 * Generate an array of hour start times between two dates in the specified timezone.
 * Each date represents the start of an hour in UTC (converted from timezone).
 */
export function* enumerateZonedHours(start: Date, end: Date, timezone: string): Generator<Date> {
    let current = zonedTopOfHour(start, timezone);
    const endTime = end.getTime();

    while (current.getTime() < endTime) {
        yield current;
        current = zonedAddHours(current, 1, timezone);
    }
}

/**
 * Generate an array of day start times between two dates in the specified timezone.
 * Each date represents the start of a day in UTC (converted from timezone).
 */
export function* enumerateZonedDays(start: Date, end: Date, timezone: string): Generator<Date> {
    let current = zonedStartOfDay(start, timezone);
    const endTime = end.getTime();

    while (current.getTime() < endTime) {
        yield current;
        current = zonedAddDays(current, 1, timezone);
    }
}
