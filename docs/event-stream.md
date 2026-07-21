# Job Metrics & Events

BidBeacon treats every job execution as a **metric** with an optional **event** timeline. Each job run creates a `job_metrics` row with the input and status, while human-facing milestones are written to the `events` table.

## Why we do this

- **Two clear sources** - `job_metrics` answers "did the job run and succeed?" while `events` answers "what happened?"
- **Queryable history** - both tables are structured rows, so "what happened?" is a SQL query, not log archaeology.
- **Human-readable dashboards** - the Event Stream renders events as concise, scannable status updates.
- **Machine-friendly drill-downs** - event payloads carry IDs and counts so the UI can render badges and analytics can aggregate later.

## What counts as an event

- **Job envelopes** - every pg-boss job runs inside `withJobMetrics`. That wrapper writes one `job_metrics` row with `input` and updates `status` as the job finishes.
- **Milestones** - call `recorder.addEvent(...)` whenever something meaningful happens (queue work, parse a report, skip, etc.).
- **Report lifecycle** - the report state machine emits events so we can see which buckets were queued, processed, or skipped.

## Principles we follow

1. **Event-specific payloads** - each job defines its own event shape (IDs, counts, metadata) and keeps it self-contained.
2. **Inputs stay in `job_metrics.input`** - job data is stored once at job start, not re-logged elsewhere.
3. **Events carry time** - each event row has `created_at` so the UI can order and label it.
4. **Structured timelines** - the front-end renders events directly without needing to infer steps.
5. **Always at least one event** - every job run should emit a human-useful event, even if nothing changed.

## Reading the stream

The dashboard's *Event Stream* listens to `events:updated` WebSocket payloads. Each event displays:

- account-local timestamp
- job name and outcome (`ok` or `error`)
- optional message and badges

Example: for `update-report-status`, each report bucket emits a badge so you can see which report window is being processed at a glance.

Report lifecycle payloads also include `periodAgeMs`, `refreshDueAt`, and `refreshDelayMs`. Processed-report events include `changedCount`, the number of inserted or materially updated performance rows. Use `refreshDelayMs` to verify that governor or scheduler changes do not delay due data, and `changedCount` to see how much each reconciliation actually corrected.

## When to add a new event

- A job queues work, processes data, or changes state.
- A branch decides to skip, retry, or short-circuit a flow.
- You wish you had a sentence in the dashboard explaining "what just happened."

When in doubt, emit the event. Events are lightweight, structured, and instantly visible.
