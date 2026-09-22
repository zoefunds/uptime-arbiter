# On-Screen Copy — Uptime Arbiter

Sharpens the voiceover; never duplicates it verbatim. All copy below is implemented in `src/scenes/*.tsx`.

| Scene | On-screen copy | Why it's different from the VO |
|---|---|---|
| 1 | "4 min" / "40 min" / "who's right?" | VO gives the narrative framing; copy gives the stark numeric contradiction |
| 2 | (diagram only, no headline copy — the cracking lock carries the idea) | avoids restating "one point of failure" as text under the VO line that already says it |
| 3 | "Uptime Arbiter" / "evidence pinned first. validators decide." | product name as hero; the tagline compresses the mechanism to 6 words |
| 4 | "pinned before the dispute exists" | sharper than VO's fuller sentence; real UI supplies the specifics |
| 5 | "PROPOSED → ACTIVE" (StateMachine) | shows the state transition as a diagram, not prose |
| 6 | "no claimant-supplied evidence. ever." / "every validator fetches independently — no shared trust" | the absolute claim ("ever") lands harder as text than spoken |
| 7 | "additive only" (implicit via StateMachine states) | three-word state label vs. the VO's full sentence |
| 8 | "39/39" | number as hero metric, card supplies the specific test name |
| 9 | "GenLayer StudioNet" | names the exact network, avoiding "GenLayer" alone which could misleadingly imply mainnet |
| 10 | "Uptime Arbiter · Onchain SLA adjudication, decided by independent consensus · uptime-arbiter.vercel.app · Built on GenLayer · Live on StudioNet" | end card is the one place a fuller recap is appropriate |

Rule followed throughout: on-screen text stays under ~12 words per shot (StateMachine pill labels and the end card are the intentional exceptions, per brief).
