# Campaign search

Campaign search finds seeded campaigns by name from the dashboard table and from the HTTP search query. Both return the same campaign names.

## Sub-features

- `search-table` filters the dashboard campaign table.
- `search-http` returns campaign name and state from `GET /api/search`.
- `search-fields` stays on Postgres by naming the fields.

## How to get to it (user POV)

- On the account home page, type into the box named `Search Campaign`.
- Call the `search` tRPC query with `resource` `campaign`.
- Run `bb search campaign --account 5eed0000-0000-4000-8000-000000000001`. That command needs the same suite API key as [CLI accounts](./cli-accounts.md), and it fails closed without one.

## Driving it with control-bidbeacon

Preconditions:

- Account home has reached `Cedar & Coil (dev seed)`.
- `browser token` has written the session file.
- Doctor still reports the seed account.

- **Filter the table.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon browser fill --label "Search Campaign" --value "Trail Runner"`. The input's value is `Trail Runner`.
- **Wait for the match.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon browser wait --text "SP - Trail Runner Belt - Auto" --absent "SP - Merino Socks - KW" --path campaign-search/table.txt`. The saved text contains the trail campaign and not the merino campaign.
- **Screenshot.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon browser screenshot --path campaign-search/table.png`. The image shows the trail campaign in the BidBeacon table.
- **HTTP search.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon http get search --input '{"accountId":"5eed0000-0000-4000-8000-000000000001","resource":"campaign","fields":["campaign.name","campaign.state"],"limit":20}' --expect "SP - Trail Runner Belt - Auto" --path http/search.json`. The file starts with `200` and the body includes that campaign name.
- **CLI search.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon cli -- search campaign --account 5eed0000-0000-4000-8000-000000000001`. Without a suite API key the exit code is `1` and `cli/search.txt` contains `AUTHENTICATION_REQUIRED`. That entry is not passed.
- **Proof.** The table artifact and `http/search.json` both contain `SP - Trail Runner Belt - Auto`. Keep `cli/search.txt` as the failed CLI entry.

## Gotchas

- The search box is `Search Campaign` only while the dimension is `Campaigns`. That is the default.
- The table asks the API for rows. Wait until `SP - Merino Socks - KW` is gone. The input value alone is not proof.
- Omit `fields` on `ad` or `product` and the query also calls RankWrangler. This recipe names `campaign.name` and `campaign.state` so the read stays on Postgres.
- `bb search` is a separate entry. A passing HTTP search does not verify it.
