import { createFileRoute, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { z } from 'zod';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';

type Aggregation = 'daily' | 'hourly';

type ReportDatasetMetadata = {
    accountId: string;
    timestamp: string;
    aggregation: Aggregation;
    status: string;
    lastRefreshed: string | null;
    reportId: string;
    error: string | null;
};

type LoaderData = {
    rows: ReportDatasetMetadata[];
    accountId: string;
    aggregation: Aggregation;
    range: { from: string; to: string };
    days: number;
};

const searchSchema = z.object({
    accountId: z.string().optional(),
    aggregation: z.enum(['daily', 'hourly']).optional(),
    days: z.coerce.number().int().min(1).max(120).optional(),
});

export const Route = createFileRoute('/')({
    validateSearch: search => searchSchema.parse(search),
    loader: async ({ context, search, signal }) => {
        const accountId = search.accountId ?? DEFAULT_ACCOUNT_ID;
        const aggregation = (search.aggregation as Aggregation | undefined) ?? 'daily';
        const days = search.days ?? 30;

        const now = new Date();
        const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        const statusUrl = new URL('/api/dashboard/status', context.apiBaseUrl);
        statusUrl.searchParams.set('accountId', accountId);
        statusUrl.searchParams.set('aggregation', aggregation);
        statusUrl.searchParams.set('from', from.toISOString());
        statusUrl.searchParams.set('to', now.toISOString());

        const response = await fetch(statusUrl, { signal });
        if (!response.ok) {
            const message = await response.text();
            throw new Error(`Failed to load dashboard status: ${response.status} ${message}`);
        }

        const body = (await response.json()) as { success: boolean; data: ReportDatasetMetadata[] };

        return {
            rows: body.data,
            accountId,
            aggregation,
            range: { from: from.toISOString(), to: now.toISOString() },
            days,
        } satisfies LoaderData;
    },
    staleTime: 10_000,
});

export default function DashboardPage() {
    const { rows, accountId, aggregation, range, days } = Route.useLoaderData();
    const router = useRouter();
    const navigate = useNavigate({ from: Route.fullPath });
    const search = useSearch({ from: Route.fullPath });

    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    const stats = useMemo(() => {
        const total = rows.length;
        const completed = rows.filter(row => row.status === 'completed').length;
        const failed = rows.filter(row => row.status === 'failed').length;
        const fetching = rows.filter(row => row.status === 'fetching').length;
        const missing = rows.filter(row => row.status === 'missing').length;

        const latest = rows[0];
        const lastRefreshed = latest?.lastRefreshed ?? null;

        return { total, completed, failed, fetching, missing, lastRefreshed };
    }, [rows]);

    const apiBaseUrl = router.options.context.apiBaseUrl;

    const onSearchChange = (next: Partial<typeof search>) => {
        setMessage(null);
        setError(null);
        navigate({
            replace: true,
            search: prev => ({
                ...prev,
                ...next,
            }),
        });
    };

    const triggerUpdate = async () => {
        setPending('update');
        setMessage(null);
        setError(null);

        try {
            const result = await postJson(`${apiBaseUrl}/api/dashboard/trigger-update`, {
                accountId,
            });
            setMessage(result.message ?? 'Update job queued');
            await router.invalidate();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to queue update');
        } finally {
            setPending(null);
        }
    };

    const reprocessAt = async (timestamp: string) => {
        setPending(timestamp);
        setMessage(null);
        setError(null);

        try {
            const result = await postJson(`${apiBaseUrl}/api/dashboard/reprocess`, {
                accountId,
                timestamp,
                aggregation,
            });
            setMessage(result.message ?? 'Reprocess job queued');
            await router.invalidate();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to queue reprocess');
        } finally {
            setPending(null);
        }
    };

    return (
        <div className="stack">
            <div className="controls">
                <label>
                    <span className="muted">Account ID</span>
                    <input
                        className="input"
                        value={accountId}
                        onChange={event => onSearchChange({ accountId: event.target.value })}
                    />
                </label>

                <label>
                    <span className="muted">Aggregation</span>
                    <select
                        value={aggregation}
                        onChange={event =>
                            onSearchChange({ aggregation: event.target.value as Aggregation })
                        }
                    >
                        <option value="daily">Daily</option>
                        <option value="hourly">Hourly</option>
                    </select>
                </label>

                <label>
                    <span className="muted">Range</span>
                    <select
                        value={String(days)}
                        onChange={event => onSearchChange({ days: Number(event.target.value) })}
                    >
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="60">Last 60 days</option>
                        <option value="90">Last 90 days</option>
                    </select>
                </label>

                <div className="actions">
                    <button
                        className="button"
                        type="button"
                        onClick={triggerUpdate}
                        disabled={pending !== null}
                    >
                        {pending === 'update' ? 'Queuing…' : 'Trigger Update'}
                    </button>
                    <button
                        className="button secondary"
                        type="button"
                        onClick={() => router.invalidate()}
                        disabled={pending !== null}
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {(message || error) && (
                <div className="card">
                    {message ? <p className="muted">✅ {message}</p> : null}
                    {error ? (
                        <p className="muted" style={{ color: '#fca5a5' }}>
                            ⚠️ {error}
                        </p>
                    ) : null}
                </div>
            )}

            <div className="card-grid">
                <div className="card">
                    <h3>Latest refresh</h3>
                    <p className="value">
                        {stats.lastRefreshed ? formatDate(stats.lastRefreshed) : '—'}
                    </p>
                    <p className="muted">
                        Window {formatDate(range.from)} → {formatDate(range.to)}
                    </p>
                </div>
                <div className="card">
                    <h3>Completed</h3>
                    <p className="value">{stats.completed}</p>
                    <p className="muted">{stats.total} rows total</p>
                </div>
                <div className="card">
                    <h3>Failed</h3>
                    <p className="value">{stats.failed}</p>
                    <p className="muted">Needs reprocessing</p>
                </div>
                <div className="card">
                    <h3>Fetching / Missing</h3>
                    <p className="value">
                        {stats.fetching} / {stats.missing}
                    </p>
                    <p className="muted">In-progress or waiting</p>
                </div>
            </div>

            <div className="card">
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div>
                        <h3 style={{ margin: '0 0 4px 0' }}>Report datasets</h3>
                        <p className="muted">
                            {rows.length === 0
                                ? 'No data for this window'
                                : `${rows.length} rows for ${aggregation}`}
                        </p>
                    </div>
                </header>

                {rows.length === 0 ? (
                    <div className="empty">No records found in this window.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Status</th>
                                    <th>Last refreshed</th>
                                    <th>Report ID</th>
                                    <th>Error</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => (
                                    <tr key={`${row.timestamp}-${row.aggregation}`}>
                                        <td>
                                            <div className="pill">{formatDate(row.timestamp)}</div>
                                        </td>
                                        <td>
                                            <StatusPill status={row.status} />
                                        </td>
                                        <td>
                                            {row.lastRefreshed
                                                ? formatDate(row.lastRefreshed)
                                                : '—'}
                                        </td>
                                        <td>
                                            <span className="badge">{row.reportId}</span>
                                        </td>
                                        <td style={{ color: '#fca5a5', maxWidth: 240 }}>
                                            {row.error ?? '—'}
                                        </td>
                                        <td>
                                            <div className="actions">
                                                <button
                                                    className="button secondary"
                                                    type="button"
                                                    disabled={pending !== null}
                                                    onClick={() => reprocessAt(row.timestamp)}
                                                >
                                                    {pending === row.timestamp
                                                        ? 'Queuing…'
                                                        : 'Reprocess'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatusPill({ status }: { status: string }) {
    const colorClass =
        status === 'completed'
            ? 'success'
            : status === 'failed'
              ? 'danger'
              : status === 'fetching'
                ? 'warning'
                : 'info';

    return <span className={`status-pill ${colorClass}`}>{status}</span>;
}

function formatDate(input: string) {
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(input));
}

async function postJson(url: string, body: Record<string, unknown>) {
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
