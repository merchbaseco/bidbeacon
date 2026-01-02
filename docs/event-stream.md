# Job Sessions & Actions

BidBeacon treats every job execution as a **session** with a rich **actions** timeline. Each session row carries the input and an array of job‑specific actions that tell the story of what happened.

## Why we do this

- **Single source of truth** – every job run writes its input and actions into `job_sessions` once. No piecemeal logs.
- **Queryable history** – sessions are structured rows, so “what happened?” is a SQL query, not log archaeology.
- **Human‑readable dashboards** – the Event Stream renders each session plus its actions as readable status updates.
- **Machine‑friendly drill‑downs** – actions are JSON with timestamps, IDs, and counts so the UI can render badges and analytics can aggregate later.

## What counts as an action

- **Session envelopes** – every pg‑boss job runs inside `withJobSession`. That wrapper writes one session row with `input` and updates `status` as the job finishes.
- **Job milestones** – call `recorder.addAction(...)` whenever something meaningful happens (queue work, parse a report, skip, etc.).
- **Report lifecycle** – the report state machine emits actions so we can see which buckets were queued, processed, or skipped.

## Principles we follow

1. **Action‑specific payloads** – each job defines its own action shape (IDs, timestamps, counts) and keeps it self‑contained.
2. **Inputs stay in `job_sessions.input`** – job data is stored once at session start, not re‑logged elsewhere.
3. **Actions carry time** – each action includes `at` so the UI can order and label it.
4. **Structured timelines** – the front‑end renders the session first, then the action rows.
5. **No duplicate sinks** – if it’s in `job_sessions.actions`, we don’t log it elsewhere for the dashboard.

## Reading the stream

The dashboard’s *Event Stream* listens to `job-sessions:updated` WebSocket payloads. Each session displays:

- absolute + relative time
- session status + account tag
- action rows rendered with rich text

Example: for `update-report-dataset-for-account`, each enqueued `update-report-status` action shows a compact timestamp badge so you can see the queued report windows at a glance.

## When to add a new action

- A job queues work, processes data, or changes state.
- A branch decides to skip, retry, or short‑circuit a flow.
- You wish you had a sentence in the dashboard explaining “what just happened.”

When in doubt, emit the action. Actions are lightweight, structured, and instantly visible.
