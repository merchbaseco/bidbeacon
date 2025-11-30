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

## Verify

```bash
docker logs bidbeacon-worker | head -20
# Should see: [Worker] Starting... [Worker] Database connection verified
```

