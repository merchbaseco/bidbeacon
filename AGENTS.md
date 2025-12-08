# BidBeacon Agent Context

Context and tribal knowledge for working with BidBeacon, particularly the AMS worker.

## Architecture

Two services, same Docker image, separate containers:
- **API Server**: Fastify HTTP API (`node dist/index.js`)
- **Worker**: SQS processor for Amazon Marketing Stream (`node dist/worker.js`)

Both share the same PostgreSQL database.

## Key Design Decisions

1. **No raw events table** - Only validated data enters DB. Invalid messages fail validation and get retried by SQS (eventually DLQ).
2. **Separate containers** - Worker crashes don't affect API. Can scale independently.
3. **Idempotency via unique indexes** - `idempotency_id` for metrics, composite keys for campaign management. Retries are harmless.
4. **Canonical SQS shutdown** - Set flag, finish current batch, exit. Visibility timeout handles in-flight messages.

## Important Context

- **SNS envelopes**: Messages arrive wrapped in SNS. Worker parses `Type` field - only `Notification` types contain AMS data.
- **Dataset routing**: Uses `datasetId` prefix (e.g., `sp-traffic`, `ads-campaign-management-campaigns`).
- **AWS region**: Must match queue region. Check queue URL - `sqs.us-east-1.amazonaws.com` means `us-east-1`.
- **Error handling**: Failed messages aren't deleted, so SQS retries. Only delete on success or unknown dataset types.

## Adding New Dataset Handler

1. Zod schema in `schemas.ts` (use `.passthrough()` for tolerance)
2. Handler in `handlers/` (validate → map → upsert)
3. Export from `handlers/index.ts`
4. Route in `router.ts` by `datasetId` prefix
5. Unique index in `schema.ts` for idempotency
6. Migration: `yarn db:generate`

## DLQ Triage Workflow

When messages fail validation, they're retried by SQS and eventually end up in the Dead Letter Queue (DLQ). Use this workflow to triage and fix DLQ issues.

### 1. Check DLQ Status

Monitor DLQ metrics via the CLI or API:
- CLI shows DLQ message count and sparkline
- API endpoint: `GET /api/worker/metrics` → `dlq.approximateVisible`

### 2. Peek at DLQ Messages (Local Script)

Use the local `peek-dlq` script to inspect messages without deleting them:

```bash
# Basic usage - peek at 10 messages
yarn peek-dlq

# Peek at more messages
yarn peek-dlq --limit 50

# Filter by specific dataset
yarn peek-dlq --dataset ads-campaign-management-campaigns
```

**Requirements:**
- `.env` file with `AWS_QUEUE_URL` (or `AMS_QUEUE_URL`) and AWS credentials
- Script automatically loads `.env` and converts ARN to URL if needed
- Messages are peeked (not deleted) - they become visible again after 30 seconds

### 3. Identify Validation Errors

The script groups messages by `dataset_id` and shows payload previews. Common validation issues:

- **Type mismatches**: Field expected as object but received as string (or vice versa)
- **Missing required fields**: Schema expects field but AMS doesn't send it
- **Null values**: Schema expects array/object but receives null
- **Format variations**: AMS sends different formats for the same field

### 4. Fix Schema Issues

Update the schema in `src/worker/schemas.ts`:

1. **Make fields optional** if AMS doesn't always send them:
   ```typescript
   field: z.string().optional()
   ```

2. **Accept multiple formats** using `z.union()`:
   ```typescript
   field: z.union([z.string(), z.object({...})]).optional()
   ```

3. **Allow null values**:
   ```typescript
   field: z.array(z.string()).nullable().optional()
   ```

4. **Use `.passthrough()`** on the schema for tolerance of unknown fields

### 5. Common Patterns

**State fields**: AMS sends `state` as a simple string (e.g., `"PAUSED"`, `"ENABLED"`), not an object:
```typescript
state: z.string().optional()  // ✅ Correct
state: z.object({...}).optional()  // ❌ Too strict
```

**Tags**: Can be array or object depending on AMS version:
```typescript
tags: z.union([z.array(z.unknown()), z.record(z.unknown())]).optional()
```

**Budgets**: Can be object or array:
```typescript
budgets: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional()
```

### 6. Deploy and Verify

1. Deploy the schema fixes
2. Monitor DLQ metrics - message count should decrease
3. Check worker logs for successful processing
4. Re-run `peek-dlq` to verify remaining messages (if any)

### 7. Reprocess DLQ Messages

After fixing schemas, DLQ messages need to be reprocessed:
- Move messages from DLQ back to main queue (via AWS Console or CLI)
- Worker will process them with the updated schemas
- Messages that still fail will go back to DLQ (investigate further)

**Note**: The worker only processes the main queue, not the DLQ. Messages must be moved back to the main queue for reprocessing.

## Deployment

Worker needs `AMS_QUEUE_URL` and AWS credentials. See [INFRA.md](./INFRA.md) for server setup.

