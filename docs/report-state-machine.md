# Report State Machine

## Overview

The report state machine manages the lifecycle of Amazon Ads reports, from creation through processing. It ensures reports are created at appropriate intervals, polled for completion, and processed efficiently.

## Key Database Columns

The `reportDatasetMetadata` table tracks the state of each report dataset:

- **`reportId`**: The current Amazon Ads report ID (null after processing)
- **`lastProcessedReportId`**: The most recently processed report ID (for debugging)
- **`status`**: Current status (`missing`, `fetching`, `parsing`, `completed`, `error`)
- **`refreshing`**: Whether a refresh is currently in progress (prevents concurrent processing)
- **`nextRefreshAt`**: When this record should be checked next (drives polling)
- **`lastReportCreatedAt`**: When the last report was created (used for eligibility calculations)
- **`timestamp`**: The report dataset timestamp (UTC)
- **`aggregation`**: Report type (`hourly` or `daily`)
- **`entityType`**: Entity type (`target` or `product`)

## Scheduled Job and Polling

The `update-report-datasets` job runs every 5 minutes and performs two functions:

1. **Creates new metadata rows** for time periods within the retention window (via `update-report-dataset-for-account`)
2. **Polls for due records** by querying `nextRefreshAt <= now AND refreshing = false`, then enqueuing `update-report-status` jobs

This polling mechanism ensures:
- Pending reports are checked every ~5 minutes until they complete
- Completed reports wait until the next eligibility offset before creating a new report
- Only records that are actually due get processed (efficient)

## State Machine Logic

The `getNextAction` function determines what action to take:

1. **If `reportId` exists**: Fetch status from Amazon Ads API
   - If `COMPLETED` → return `'process'`
   - If not completed → return `'none'` (wait)
2. **If no `reportId`**: Check eligibility
   - If eligible → return `'create'`
   - If not eligible → return `'none'`

## Actions and Transitions

### `'create'` Action

- Creates a new report via Amazon Ads API
- Sets `reportId`, `status = 'fetching'`, `lastReportCreatedAt`
- Sets `nextRefreshAt = now + 5 minutes` (poll for completion)

### `'process'` Action

- Sets `status = 'parsing'`
- Downloads and parses the report data
- Sets `status = 'completed'`
- Clears `reportId`, sets `lastProcessedReportId` to the old `reportId`
- Recalculates `nextRefreshAt` to the next eligibility offset

### `'none'` Action

- If report is pending (reportId exists but not completed): Sets `nextRefreshAt = now + 5 minutes` (poll again soon)
- If not eligible: Sets `nextRefreshAt` to the next eligibility offset

## Eligibility Offsets

Reports are eligible for refresh at specific time offsets after the dataset timestamp:

- **Daily reports**: T+1, T+3, T+5, T+7, T+14, T+30, T+60 days
- **Hourly reports**: T+24, T+72, T+312 hours

A report is eligible if:
1. The age (NOW - timestamp) has reached or exceeded one of the eligible offsets
2. No report was already created at that offset (based on `lastReportCreatedAt`)

## Flow Diagram

```mermaid
flowchart TD
    subgraph scheduledJob [update-report-datasets - every 5min]
        CreateRows[Create new metadata rows per account]
        QueryDue["Query: nextRefreshAt <= now AND refreshing = false"]
        EnqueueStatus[Enqueue update-report-status jobs]
        CreateRows --> QueryDue --> EnqueueStatus
    end
    
    subgraph stateMachine [update-report-status job]
        CheckReportId{reportId exists?}
        FetchAmazon[Fetch status from Amazon]
        CheckCompleted{COMPLETED?}
        Process[Parse report]
        ClearId["Clear reportId, set lastProcessedReportId, nextRefreshAt = next offset"]
        StillPending["nextRefreshAt = now + 5min"]
        CheckEligible{Eligible?}
        CreateReport["Create report, nextRefreshAt = now + 5min"]
        NotEligible["nextRefreshAt = next offset"]
        
        CheckReportId -->|Yes| FetchAmazon
        CheckReportId -->|No| CheckEligible
        FetchAmazon --> CheckCompleted
        CheckCompleted -->|Yes| Process --> ClearId
        CheckCompleted -->|No| StillPending
        CheckEligible -->|Yes| CreateReport
        CheckEligible -->|No| NotEligible
    end
```

## Key Design Decisions

1. **`reportId` is cleared after processing**: Prevents reprocessing the same report. The state machine checks eligibility for a new report instead.

2. **`nextRefreshAt` drives polling**: Instead of polling all records, we only check records where `nextRefreshAt <= now`. This is efficient and scales well.

3. **Short polling interval for pending reports**: When a report is created or still pending, `nextRefreshAt` is set to 5 minutes in the future. This ensures users see data quickly without excessive API calls.

4. **Eligibility based on creation time**: The `lastReportCreatedAt` timestamp determines eligibility, not when the report was processed. This ensures we don't miss eligibility windows even if processing takes a long time.
