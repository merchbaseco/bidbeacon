# Update a campaign

Update a campaign changes a seeded campaign through `update_campaign`. The local Amazon Ads gateway records the call and echoes the new state. A later search shows that state.

## Sub-features

- `update-pause` sets `SP - Trail Runner Belt - Auto` to `PAUSED`.
- `update-readback` reads that state from `search`.
- `update-restore` sets the campaign back to `ENABLED`.
- `update-reject` returns `PRODUCT_INELIGIBLE` for ASIN `B0INELIGBL`.

## How to get to it (user POV)

- Call `update_campaign` on the HTTP API with the local dev key.
- Call the MCP tool `update_campaign` with the same key.
- Run `bb update campaign`. The helper allows that command only when doctor reports `"amazonAds": "fake"`.

## Driving it with control-bidbeacon

Preconditions:

- Launch started the API. Doctor reports `"amazonAds": "fake"` and `"ok": true`.
- The seeded campaign `SP - Trail Runner Belt - Auto` is `ENABLED`.

- **Find the campaign.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon http get search --input '{"accountId":"5eed0000-0000-4000-8000-000000000001","resource":"campaign","fields":["campaign.id","campaign.name","campaign.state"],"filters":[{"field":"campaign.name","operator":"eq","value":"SP - Trail Runner Belt - Auto"}],"limit":1}' --expect "SP - Trail Runner Belt - Auto" --path update-campaign/before.json`. The body contains that name, its `campaign.id`, and `ENABLED`.
- **Pause it.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon http post update_campaign --input '{"accountId":"5eed0000-0000-4000-8000-000000000001","campaignId":"<campaign.id>","changes":{"state":"PAUSED"}}' --expect "PAUSED" --path update-campaign/paused.json`. The status line is `200` and the body state is `PAUSED`.
- **Read it back.** Run the same search again with `--path update-campaign/after.json` and `--expect "PAUSED"`. The stored campaign state is `PAUSED`.
- **Recorded call.** `/tmp/bidbeacon-amazon-ads-calls.jsonl` contains `"operation":"updateCampaigns"` and `"state":"PAUSED"`. Cleanup copies that file to `amazon-ads-calls.jsonl`.
- **Restore.** Post `update_campaign` again with `"state": "ENABLED"`. A following search shows `ENABLED`.
- **Rejection shape.** Post `create_product_target` with `asin` `B0INELIGBL`, a seeded ad group id, `bid` `0.5`, and `state` `ENABLED`, and `--expect PRODUCT_INELIGIBLE`. The saved body contains `PRODUCT_INELIGIBLE`, index `0`, and `Product is ineligible for advertising.` The HTTP status is an error. `--expect` still exits 0 when that text is present.

## Gotchas

- Use the `campaign.id` from the search body. The Advertiser Account UUID is not a campaign id.
- An adopted server on port 8080 is still the live gateway. Doctor then reports `"amazonAds": "amazon"`, and the helper exits 2 before the post.
- Restore `ENABLED` before cleanup. The boot dashboard reads the same campaign row.
- `B0INELIGBL` is the only ASIN the local gateway rejects. Any other ASIN is echoed as success.
