# Infrastructure Updates

Changes needed in `merchbaseco/infra` to deploy the worker.

## Update `stack/bidbeacon/deploy.sh`

Add worker container after the server container:

```bash
docker run -d \
  --name bidbeacon-worker \
  --network webserver \
  --restart unless-stopped \
  --env-file stack/bidbeacon/.env \
  ghcr.io/merchbaseco/bidbeacon-server:${BIDBEACON_IMAGE_TAG} \
  node dist/worker.js || docker start bidbeacon-worker
```

Or if using docker-compose, add worker service with `command: ["node", "dist/worker.js"]`.

## Environment Variables

`.env` needs `AMS_QUEUE_URL` and `AWS_REGION`. GitHub Actions workflow passes these via `stack.env`.

## AWS Credentials

Worker needs SQS access. Use IAM role (recommended) or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env vars.

### Required IAM Permissions

The IAM user/role needs the following SQS permissions:

**For the main queue (`AMS_QUEUE_URL`):**
- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`
- `sqs:GetQueueAttributes` (for RedrivePolicy to find DLQ)

**For the DLQ (auto-discovered from RedrivePolicy):**
- `sqs:GetQueueAttributes` (for approximate message count)
- `cloudwatch:GetMetricStatistics` (for queue metrics)

**CloudWatch permissions (for both queues):**
- `cloudwatch:GetMetricStatistics` on namespace `AWS/SQS`

Example IAM policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:bidbeacon-ams-na"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:bidbeacon-ams-na-dlq"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    }
  ]
}
```

## Verify

```bash
docker logs bidbeacon-worker | head -20
# Should see: [Worker] Starting... [Worker] Database connection verified
```

