/**
 * Round a date up to the nearest minute boundary.
 * This ensures stable query keys across components by preventing
 * millisecond-level timestamp differences from creating separate queries.
 */
export function roundUpToNearestMinute(date: Date): Date {
    return new Date(Math.ceil(date.getTime() / 60000) * 60000);
}

export function formatDate(input: string, showTime: boolean = true) {
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: showTime ? 'short' : undefined,
    }).format(new Date(input));
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
