# Video Brief — Uptime Arbiter

## One-sentence product definition
Uptime Arbiter is an onchain SLA-breach adjudication protocol where a provider and customer pin public evidence sources in advance, and GenLayer's independent validator consensus — not either party, not a centralized operator — decides whether a breach occurred and pays out escrow accordingly.

## Target viewer
Hackathon judges: technically literate, skeptical of "blockchain + AI" hand-waving, evaluating ~20+ submissions quickly. They reward precision, working proof, and honesty about scope over polish-for-its-own-sake. They will penalize any claim that outruns the evidence.

## Primary objective
Get a judge to understand, in under 100 seconds, exactly what problem this solves, why a single centralized reader can't be trusted to solve it, and that the full lifecycle actually runs against a live deployed contract — not a mockup.

## Central message
"Two adversarial parties bet on the truth. The internet decides who's right — and no single party, including the platform, can pick the answer."

## Intended emotion
Confident, precise, quietly impressive. Not hype. The feeling should be closer to watching a well-argued technical talk than a crypto trailer.

## Current product stage
**Live MVP** — deployed contract on GenLayer StudioNet, live frontend (Vercel), live backend (Fly.io). Full lifecycle has been exercised on-chain, though not end-to-end in a single continuous run because the challenge window is real wall-clock time (see PRODUCT_TRUTH_MAP.md).

## Implemented capabilities (see PRODUCT_TRUTH_MAP.md for full detail + evidence)
- SLA proposal with pinned evidence sources + exclusion terms, dual-sided escrow/bond funding, activation
- Claim submission with window + evidence-digest snapshot
- Independent multi-validator evaluation via GenLayer consensus (Equivalence Principle) → real resolved verdicts
- Additive-only challenge round, re-adjudication, bond slashing
- Finalization + pull-based withdrawal (verified on a prior deployment)
- 39 passing direct-mode tests, including a direct proof the EQ-principle validator re-derives rather than trusts the leader

## Simulated / not-yet-demonstrated-live-in-one-run capabilities
- A single continuous recording of proposal → claim → evaluation → challenge → finalize → withdraw cannot happen in one sitting because the challenge window is real elapsed time — the video will show each stage as real, separately-verified footage/state, not fabricate a compressed live run.

## Future capabilities
- None asserted unless the user confirms specific roadmap items (mainnet deployment, more evidence-source types, etc.) — omitted from the film unless supplied.

## Principal call to action
Visit the live app / try registering a test SLA on StudioNet. Link: https://uptime-arbiter.vercel.app. Contract: `0x61D6F3bdf53118523572a141F7E1904591147F94` on GenLayer StudioNet.

## Final video duration
Master: ~90 seconds, 16:9, 30fps, rendered at 4K (3840×2160).
Also: 9:16 vertical (1080×1920) and 1:1 square (1080×1080) recompositions, plus an optional 20–25s teaser cut.

## Output aspect ratios
16:9 (master/hackathon submission), 9:16 (social), 1:1 (social), all re-laid-out, not cropped.

## Brand direction
Pulled directly from `frontend/src/app/globals.css` (dark theme, tokens from the project's own design system):
- Background: `#10131a` / surface containers `#0b0e15`–`#32353d`
- Primary (cyan): `#4cd7f6` / container `#06b6d4`
- Secondary (mint): `#4edea3` / container `#00a572`
- Tertiary (amber): `#ffb95f` / container `#e79400`
- Error: `#ffb4ab` / container `#93000a`
- Display font: Space Grotesk · Body: Inter · Mono: JetBrains Mono
This is a dark, precise, technical palette — not purple-gradient crypto, not glassmorphism. The film should look like a natural extension of the live app.

## Evidence available
- Live deployed frontend (https://uptime-arbiter.vercel.app) — will screen-record fresh
- Live backend (https://uptime-arbiter-api.fly.dev)
- Contract source (`contracts/UptimeArbiter.py`) — for architecture/mechanism visualization
- `MEMORY.md` — verification log of every real bug and every live-run result
- `tests/direct/` — 39 passing tests
- README's own stated verification log (per-mechanism, dated, with what was verified on-chain vs. in tests)

## Evidence missing
- No existing screenshots, logo, or screen recordings in the repo — must capture fresh by running the app locally/against the live deployment
- No pre-written voiceover talent — will synthesize via ElevenLabs (text2speech_v2, variant `elevenlabs`) through the connected media MCP
- No existing transaction-hash/explorer screenshot captured for this film — must capture live from StudioNet during recording, or use the README's cited deployment address as the evidenced default if a fresh explorer view isn't available at record time

## Claims that must not be made
- Do not claim a single continuous live run of the entire lifecycle in one sitting (challenge window is real time — see above)
- Do not claim mainnet deployment (StudioNet only)
- Do not claim the backend makes or influences the breach determination (it is explicitly a read-only cache)
- Do not claim validators trust a "leader" result — the Equivalence Principle re-derivation is the actual mechanism
- Do not invent a specific transaction hash, breach-minute figure, or payout amount not captured from a real recording or the README/MEMORY.md log

## Open assumptions (flag for user confirmation before final render)
- Hackathon program name/deadline not supplied — end card will show product name, one-line positioning, live URL, and "Built on GenLayer" attribution only, without a specific hackathon name unless provided
- No voiceover gender/style preference given — defaulting to a neutral, confident ElevenLabs preset; will list options and swap on request
- No supplied brand logo — will typeset the wordmark "Uptime Arbiter" in Space Grotesk rather than fabricate a logomark
