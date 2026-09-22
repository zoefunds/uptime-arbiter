# Recording Plan — Uptime Arbiter (executed log)

## What was actually captured (this session)

Captured via headless Playwright (Chromium, 1920×1080 viewport, deviceScaleFactor 2 for crispness) against the **live deployed app**, https://uptime-arbiter.vercel.app — per the confirmed decision to use live data, not local dev, so every number shown matches the README's verified claims exactly.

| File | URL | What it shows | Used in |
|---|---|---|---|
| `assets/screenshots/home.png` | `/` | landing page hero | reference only (not used in master; headline already echoes the closing VO line, noted for future cuts) |
| `assets/screenshots/registry.png` | `/registry` | real SLA-1, status ACTIVE, 50 GEN escrow, 99.95% target uptime | Scene 5 |
| `assets/screenshots/sla_detail.png` | `/registry/SLA-1` | real pinned evidence sources (3), exclusion terms, fingerprint hash, claim history | Scene 4 |
| `assets/screenshots/claim_verdict.png` | `/claims/CLM-1` | real consensus verdict: No Breach, 0 min, 0 GEN payout, 2d 13h challenge window remaining | Scenes 6, 7 |
| `assets/screenshots/register_gated.png` | `/register` | "Connect a wallet to register an SLA" gate | not used (wallet-gated, no interactive form state to show without connecting a real wallet — see note below) |
| `assets/screenshots/vault_gated.png` | `/vault` | wallet-gated vault view | not used in master; candidate for a future cut if a demo wallet connection is authorized |
| `assets/test_output.txt` | local `pytest tests/direct/ -v` | real 39/39 passing output, including the specific cited exclusion-terms test | Scene 8 |

## Why no wallet-connected recording (register flow, vault withdrawal)

Connecting a real wallet and performing on-chain actions (funding escrow, submitting a claim, filing a challenge) requires signing transactions — this falls under this session's financial-action restrictions (never execute transfers/trades on the user's behalf). The registry and claim-detail pages already expose all the real state needed for scenes 4-8 without requiring a wallet connection, since Uptime Arbiter's backend serves that state as a public read-cache. No fabricated form-filling was recorded to compensate — see PRODUCT_TRUTH_MAP.md.

## If a real wallet-connected recording becomes available later

The user (or someone with the demo wallet) would need to record that flow themselves, or explicitly authorize and be present for a live signed-transaction demo in a follow-up session. Do not substitute a staged/mocked wallet-connect animation for this — it would violate the non-negotiable truthfulness rule.

## Capture method reference (for re-running if the live app changes)

```bash
cd video
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.goto('https://uptime-arbiter.vercel.app/registry/SLA-1', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'assets/screenshots/sla_detail.png', fullPage: true });
  await browser.close();
})();
"
```

Note: use `waitUntil: 'load'` + a fixed `waitForTimeout`, not `networkidle` — the app's polling/websocket connections keep the network busy indefinitely and `networkidle` will always time out.
