# BidBeacon cloud agent session exports, sourced by the fleet start and every session shell.
# A cloud agent has no Tailscale, so the database is the loopback cluster
# .agents/cloud/start.sh provisions, and Amazon Ads traffic stays on the fake
# gateway.
export BIDBEACON_DATABASE_HOST=127.0.0.1
export BIDBEACON_AMAZON_ADS_GATEWAY=fake
