import { fromZonedTime } from 'date-fns-tz';

const HOURLY_TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2})T(\d{2}):/;

export function parseHourlyTimestamp(hourValue: string, timezone: string): { bucketStart: Date; bucketDate: string; bucketHour: number } {
    const localDateMatch = hourValue.match(HOURLY_TIMESTAMP_REGEX);
    if (!localDateMatch) {
        throw new Error(`Invalid hour.value format: ${hourValue}`);
    }

    const bucketDate = localDateMatch[1];
    const bucketHour = Number.parseInt(localDateMatch[2], 10);

    const localDateTimeString = `${bucketDate}T${String(bucketHour).padStart(2, '0')}:00:00`;
    const bucketStart = fromZonedTime(localDateTimeString, timezone);

    return { bucketStart, bucketDate, bucketHour };
}

export function parseDailyTimestamp(dateValue: string, timezone: string): { bucketStart: Date; bucketDate: string } {
    const bucketDate = dateValue;
    const { bucketStart } = parseHourlyTimestamp(`${dateValue}T00:00:00`, timezone);
    return { bucketStart, bucketDate };
}

export function normalizeHourlyValue(hourValue: string, dateValue?: string): string {
    if (hourValue.includes('T')) {
        return hourValue;
    }

    if (!dateValue) {
        throw new Error(`Missing date.value for hour.value: ${hourValue}`);
    }

    const numericHour = Number(hourValue);
    if (!Number.isFinite(numericHour)) {
        throw new Error(`Invalid hour.value format: ${hourValue}`);
    }

    const paddedHour = String(Math.trunc(numericHour)).padStart(2, '0');
    return `${dateValue}T${paddedHour}:00:00`;
}
