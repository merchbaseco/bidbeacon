# Deployment Checklist

Use this guide to publish and deploy the BidBeacon API container through GitHub Actions.

## GitHub Container Registry

1. Ensure GitHub Packages is enabled for the `merchbaseco` organization.
2. Generate a classic Personal Access Token with `write:packages`, `read:packages`, and `repo` scopes. Save it as `GHCR_WRITE_TOKEN`.
3. Add these repository secrets:
   - `GHCR_USERNAME` – GitHub username that owns the token.
   - `GHCR_TOKEN` – The value of `GHCR_WRITE_TOKEN`.

## Remote Deployment Access

The workflow connects to the Hetzner host as the dedicated `bidbeacon` user. Add these secrets:

- `DEPLOY_SSH_HOST` – Hostname or IP of the deployment box.
- `DEPLOY_SSH_USER` – Should be set to `bidbeacon`.
- `DEPLOY_SSH_PRIVATE_KEY` – Private key (PEM) for the `bidbeacon` user.
- `DEPLOY_SSH_PASSPHRASE` – Optional passphrase for the private key (leave blank if none).

## Runtime Secrets (GitHub Actions)

Store the application secrets as repository secrets; the workflow renders `stack/bidbeacon/.env` on the server automatically.

Currently, BidBeacon requires no runtime secrets. Add them here as needed.

## Server Preparation

1. Provision the `bidbeacon` user on the server with membership in the `docker` group and a locked-down home (e.g. `/home/bidbeacon`).
2. Clone [`merchbaseco/infra`](https://github.com/merchbaseco/infra) into `~/merchbase-infra` for that user.
3. Authenticate Docker to GHCR with a read-only token: `echo "$TOKEN" | docker login ghcr.io -u <username> --password-stdin`.
4. Ensure the shared network exists: `docker network create webserver || true`.

Once configured, pushes to `main` build and push the container image. The workflow logs in as `bidbeacon`, updates `merchbase-infra`, writes `stack/bidbeacon/.env` from the stored secrets, and executes `stack/bidbeacon/deploy.sh` automatically.

