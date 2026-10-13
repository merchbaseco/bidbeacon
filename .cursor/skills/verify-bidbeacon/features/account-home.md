# Account home

Account home is the signed-in dashboard. It shows the seeded advertiser, the country, and the campaign table for the current week.

## Sub-features

- `home-open` loads `/` and finishes dev sign-in.
- `home-account` shows the seeded account name and country.
- `home-campaigns` shows seeded campaign names in the performance table.

## How to get to it (user POV)

- Open `http://127.0.0.1:4174/`.
- When launch adopted the boot dashboard, open `http://127.0.0.1:4173/` instead.

## Driving it with control-bidbeacon

Preconditions:

- Doctor reports `"ok": true`.
- The dashboard base URL is the one in the doctor JSON.

- **Open the dashboard.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon browser open --url http://127.0.0.1:4174/`. Chrome navigates to that origin.
- **Wait for the table.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon browser wait --text "SP - Trail Runner Belt - Auto" --path account-home/page.txt`. The saved text also contains `Cedar & Coil (dev seed)` and `US`. The account name appears before the table, so waiting on the campaign name is the ready check.
- **Save the session.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon browser token`. The command prints a file path and does not print the token.
- **Proof.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon browser screenshot --path account-home/home.png`. The image shows BidBeacon, `Cedar & Coil (dev seed)`, and `SP - Trail Runner Belt - Auto`.

## Gotchas

- An origin other than `localhost` or `127.0.0.1` on port `4173` or `4174` can mint a ticket and then fail later API calls, because `azp` is not an authorized party. `http://0.0.0.0:4173` is that failure.
- Dev sign-in is asynchronous. Wait for the account name, not for the first HTML response.
- Do not choose `Sync`. That control calls Amazon Ads.
- Do not flip the account switch. That writes `advertiser_account.enabled` on the shared seed row.
