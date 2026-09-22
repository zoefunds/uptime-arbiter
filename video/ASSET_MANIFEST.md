# Asset Manifest — Uptime Arbiter

## Screen recordings (new capture required — none exist in repo)
| Asset | Scene | Source | Status |
|---|---|---|---|
| Register flow (`/register`) — filling evidence sources + exclusion term | 4 | live app, https://uptime-arbiter.vercel.app | missing — capture next |
| Registry/vault status badge PROPOSED→ACTIVE | 5 | live app | missing — capture next |
| Claims page (`/claims/[claimId]`) entry shot | 6 | live app | missing — capture next |
| Claim detail resolved verdict badge | 7 | live app | missing — capture next |
| `pytest tests/direct/` terminal run (39 passing) | 8 | local terminal | missing — capture next |

## Existing repository assets
| Asset | Use | Status |
|---|---|---|
| Brand tokens (`frontend/src/app/globals.css`) | theme.ts source of truth | existing — extracted into VIDEO_BRIEF.md |
| Fonts: Space Grotesk, Inter, JetBrains Mono | typography | existing (Google Fonts, referenced by app) — need to bundle for Remotion |
| Contract source (`contracts/UptimeArbiter.py`) | architecture diagram accuracy, on-screen labels | existing |
| README.md, MEMORY.md | VO/copy factual grounding | existing |
| `tests/direct/test_claims_and_evaluation.py` | Scene 8 real test name | existing |

## Missing — no logo/logomark in repo
- No logomark exists. Scene 3 hero uses wordmark typography only (Space Grotesk), not a fabricated logo icon. If the user later supplies a logo file, swap it in.

## Remotion-generated visuals (build, not capture)
- KineticText hook (Scene 1)
- Single-node crack diagram (Scene 2)
- Wordmark reveal (Scene 3)
- StateMachine PROPOSED→ACTIVE overlay (Scene 5)
- ArchitectureFlow: validators → evidence sources → converged number (Scene 6)
- StateMachine additive-only challenge beat (Scene 7)
- EvidenceCard test-report readout (Scene 8)
- ArchitectureFlow pull-back / full system (Scene 9)
- EndCard (Scene 10)

## Pexo-generated visuals
None required per storyboard — every beat is either real product footage or a Remotion diagram/typography treatment. Revisit only if a specific beat is found to need atmospheric cover footage after the first edit pass.

## Audio
| Asset | Tool | Status |
|---|---|---|
| Voiceover (10 lines, ~130-155wpm, male/precise/authoritative) | ElevenLabs via `generate_audio` (model `text2speech_v2`, variant `elevenlabs`) | to generate — see VOICEOVER_SCRIPT.md |
| Music bed (tension → lift → momentum → resolution arc) | to source — check licensed-music options available; do not use copyrighted commercial tracks | missing |
| SFX: soft impact, glass-crack, UI click ×N, state chime, evidence-arrival tick ×N, resolving chord, verdict sting | to source (royalty-free SFX library or generate) | missing |

## Icons
- Evidence-source type icons (status page / RSS / JSON API) for Scene 6 — build as simple Remotion SVG, not imported icon pack, to match the mono/geometric UI style

## Fonts to bundle in Remotion project
- Space Grotesk (display)
- Inter (body/captions)
- JetBrains Mono (technical labels, state names, numbers)

## Explicitly NOT fabricated
- No fake transaction hash, no fake explorer screenshot, no fake breach-minutes number unless actually captured on screen during recording (see PRODUCT_TRUTH_MAP.md)
