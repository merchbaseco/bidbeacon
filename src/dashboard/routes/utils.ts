export function formatDate(input: string) {
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(input));
}

/**
 * Format a date as a natural relative time (e.g., "in 2 hours", "in 3 days", "in 5 minutes")
 * Returns "Overdue" if the date is in the past
 */
export function formatRelativeTime(input: string | null): string {
    if (!input) {
        return '—';
    }

    const date = new Date(input);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    // For past dates, show "Overdue"
    if (diffMs < 0) {
        return 'Overdue';
    }

    // For future dates, show as "in X days" or "in X hours"
    if (diffDays > 0) {
        return `in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
    }

    if (diffHours > 0) {
        return `in ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'}`;
    }

    if (diffMinutes > 0) {
        return `in ${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'}`;
    }

    return 'now';
}

export async function postJson(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { message?: string };
}
