# Database Queries

## For Claude Code

When you need to inspect the production database (verify data, debug issues, check record counts), use a sub-agent pattern that keeps query results isolated from the main conversation context.

## Pattern

Launch a general-purpose agent via the Task tool with specific database access instructions:

```typescript
Task({
  subagent_type: 'general-purpose',
  prompt: `Query the BidBeacon production database to answer: [YOUR QUESTION HERE]

  Database access instructions:
  1. SSH into production server:
     ssh -i "/Users/zknicker/Library/Mobile Documents/com~apple~CloudDocs/Business/MerchBase/SSH/hetzner" zknicker@merchbase.co

  2. On the server, use docker exec to run queries inside the postgres container:
     docker exec -it postgres psql -U bidbeacon -d bidbeacon -c "SELECT ..."

  3. For multi-line output or complex queries, you can enter interactive psql:
     docker exec -it postgres psql -U bidbeacon -d bidbeacon

  4. Exit SSH when done

  5. Return concise summary of findings

  Schema reference: src/db/schema.ts
  Common tables: advertiser_account, report_dataset_metadata, performance_hourly, performance_daily`
})
```

## Example Usage

### Check Recent Reports
```typescript
// Main conversation
Task with prompt: "Query the database to find all reports created in the last 24 hours.
Show their statuses and any errors."
```

### Verify Account Data
```typescript
Task with prompt: "Query the database to count advertiser accounts by status
(enabled vs disabled). Also show the most recently updated account."
```

### Debug API Issues
```typescript
Task with prompt: "Query the database to find all API calls to 'create-report'
in the last hour. Show success rate and average duration."
```

### Check Performance Data
```typescript
Task with prompt: "Query performance_hourly to get the last 24 hours of metrics
for account ID 12345. Sum up impressions, clicks, and spend."
```

## Schema Reference

Key tables (see `src/db/schema.ts` for complete schema):

### Core Tables
- `advertiser_account` - Amazon Ads accounts with entity_id, ads_account_id, country_code, enabled status
- `report_dataset_metadata` - Report tracking (status, reportId, periodStart, aggregation, entityType)
- `account_dataset_metadata` - Account-level dataset metadata

### Performance Tables
- `performance_hourly` - Hourly metrics (bucket_start, bucket_date, bucket_hour, impressions, clicks, spend)
- `performance_daily` - Daily rollups (bucket_date, impressions, clicks, spend, conversions)

### AMS Stream Data
- `ams_sp_traffic` - Sponsored Products traffic stream (impressions, clicks)
- `ams_sp_conversion` - Sponsored Products conversion stream (purchases, sales)
- `ams_cm_campaigns` / `ams_cm_ad_groups` / `ams_cm_ads` / `ams_cm_targets` - Campaign Manager entities

### Tracking Tables
- `job_sessions` - Background job runs (job_name, boss_job_id, started_at, finished_at, status, counters)
- `job_events` - Timeline of wide events for each job session (stage/message/context metadata)
- `api_metrics` - API call tracking (api_name, timestamp, success, duration_ms)
- `ams_metrics` - AMS stream processing metrics

### Ad Entities
- `campaign` / `ad_group` / `ad` / `target` - Synced Amazon Ads entities

## Important Notes

### SSH Connection Details
- **Server**: merchbase.co (production server)
- **SSH User**: zknicker
- **SSH Key**: `/Users/zknicker/Library/Mobile Documents/com~apple~CloudDocs/Business/MerchBase/SSH/hetzner`
- **Postgres Container**: postgres (Docker container running on the server)
- **Database User**: bidbeacon
- **Database Name**: bidbeacon
- **No password needed**: Docker exec connects directly to container

### Query Execution Method
**Use docker exec on the server** - This is simpler and more reliable than SSH tunnels:
```bash
# One-line query
docker exec -it postgres psql -U bidbeacon -d bidbeacon -c "SELECT COUNT(*) FROM advertiser_account;"

# Interactive psql session
docker exec -it postgres psql -U bidbeacon -d bidbeacon
# Then run queries interactively
# \dt to list tables
# \d table_name to describe a table
# \q to quit
```

### Timezone Handling
- `performance_hourly.bucket_start` is in UTC (canonical timestamp)
- `performance_hourly.bucket_date` and `bucket_hour` are in account's local timezone
- Query by bucket_start for UTC ranges, bucket_date for local time

### Read-Only Convention
Database queries should be SELECT-only to avoid accidentally modifying production data. The sub-agent has full access, so use caution.
