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

## Deployment

Worker needs `AMS_QUEUE_URL` and AWS credentials. See [INFRA.md](./INFRA.md) for server setup.

