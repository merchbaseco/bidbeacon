#!/bin/bash
# Deprecated stack deployment helper.

set -e

echo "❌ Legacy script detected."
echo "This stack now deploys via GHCR using merchbase-infra/stack/bidbeacon under the bidbeacon user."
echo "Run the GitHub Actions workflow or execute stack/bidbeacon/deploy.sh on the server."
exit 1

