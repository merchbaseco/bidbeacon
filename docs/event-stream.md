# Wide Events Philosophy

BidBeacon's backend now treats every observable action as a **wide event** – a single, self‑contained row that carries the full narrative for that moment in time.

## Why we do this

- **Single source of truth** – every job run, state change, and background task writes its story into Postgres once. There are no lossy console logs or piecemeal breadcrumbs to reconcile.
- **Queryable history** – because events land in structured tables (`job_sessions`, `job_events`, etc.), we can answer “what happened?” with SQL instead of grepping logs.
- **Human‑readable dashboards** – the dashboard’s event stream simply reads the latest rows and renders them as sentences (“Updated reports dataset for 12/21 02:00 (HT2MJM/US)”).
- **Machine‑friendly drill‑downs** – each row includes timestamps, context (account, aggregation, dataset window), and arbitrary metadata (`metadata` json) so we can expand details or run analytics later.

## What counts as a “wide event”

- **Session envelopes** – every pg-boss job runs inside `withJobSession`. That wrapper emits:
  - `started` → “Started summarizing hourly targets for 12/21 02:00 (HT2MJM/US)”
  - optional `event(...)` calls while the job is doing work (“Updated status on 5 datasets: …”)
  - `succeeded`/`failed` → final status message plus duration/error context
- **Worker milestones** – queue listeners, schedulers, and sync tasks call the recorder whenever something meaningful happens (e.g., account enqueue, AMS cleanup).
- **Report lifecycle** – the report state machine surfaces its decisions as events so we can see *which* buckets were queued, parsed, or skipped.

## Principles we follow

1. **Sentence first** – each event should read like a status update a human could paste into Slack: clear verb + subject + key data (account, bucket, counts).
2. **Full payload** – never emit “see logs for details.” Include the metrics/IDs/duration directly in the event row.
3. **Context in context** – job session context (`accountId`, `countryCode`, `aggregation`, `bucketDate`, `bucketStart`) must be populated before emitting so every event carries the tagging data.
4. **Structured timelines** – the front‑end draws the exact order it receives. If multiple steps belong to the same job, we group them by `sessionId` but still show each row so nothing is hidden.
5. **No duplicate sinks** – if information is in `job_events`, we don’t log it elsewhere. Wide events replace traditional logging for backend jobs.

## Reading the stream

The dashboard’s *Event Stream* panel listens to `job-events:updated` WebSocket payloads. Each entry displays:

- absolute + relative time
- message (derived from `job_sessions` context + job-specific wording)
- optional badges (status, account tag)
- nested rows for intra-session events (“Updated status on 5 datasets: (12/21 02:00)…“)

This makes it trivial to watch the worker’s pulse over the last few minutes without tailing logs or drilling into pg‑boss.

## When to add a new event

- A job does something noteworthy (queues other work, parses a report, syncs AMS data).
- A branch in logic decides to skip, retry, or short‑circuit a flow.
- You wish you had a sentence in the dashboard explaining “what just happened.”

When in doubt, emit it. Wide events are cheap, fully structured, and instantly visible.***
