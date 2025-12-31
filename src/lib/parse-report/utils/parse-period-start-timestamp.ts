export function parseHourlyTimestamp(hourValue: string, timezone: string): { bucketStart: Date; bucketDate: string; bucketHour: number } {
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
