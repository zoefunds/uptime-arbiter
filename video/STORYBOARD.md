# Storyboard — Uptime Arbiter (Master: 90s, 16:9, 30fps)

Structure: **Hybrid of C (Claim → Verification) and B (Trigger → Execution)** — this product is fundamentally a claim-verification protocol triggered by a real-world condition (downtime), so it needs both the "is this true?" arc and the "system reacts" arc.

Transition vocabulary (reused throughout, do not invent new ones per-scene):
- **T1 — Mask wipe**: a UI panel edge wipes to reveal the next scene (used between real-app shots)
- **T2 — Zoom-through**: push into a UI element until it fills frame, emerge as a diagram (used real-UI → architecture)
- **T3 — State flash**: a status pill/badge flashes and the color bleeds to fill the transition (used at verdict/state-change beats)
- **T4 — Match-cut**: a moving line/object continues its trajectory into the next scene (used inside the architecture-diagram sequence)

---

### Scene 1 — Hook (0:00–0:05)
- **Purpose**: pattern-break; establish the trust problem before naming the product
- **VO**: "A server goes down. The provider says four minutes. The customer says forty."
- **On-screen copy**: "who's right?"
- **Visual**: Two opposing UI-style number chips ("4 min" / "40 min") snap into frame from opposite sides on a dark background, colliding gently at center — KineticText + MetricReveal, no stock footage
- **Product asset**: none — pure Remotion typography/motion
- **Pexo**: none
- **Transition out**: T3 state flash (the two chips flash and resolve to a single neutral color)
- **Sound cue**: low tension pad starts; a soft impact on chip collision
- **Proof shown**: none (this is the problem, not the proof)
- **Takeaway**: this is a dispute with real money on it

### Scene 2 — Stakes (0:05–0:14)
- **Purpose**: why this matters — the naive fix (trust one reader) is the actual danger
- **VO**: "SLA disputes usually get settled by whoever both sides agree to trust. That's one login, one database, one point of failure."
- **On-screen copy**: "one reader. one point of failure."
- **Visual**: single glowing node (the "trusted reader") with a lock icon cracking; ArchitectureFlow component, single-node variant
- **Product asset**: none
- **Pexo**: none (keep this in Remotion — avoid generic "hacker" stock footage per prohibited-Pexo list)
- **Transition out**: T2 zoom-through into the cracked node
- **Sound cue**: a subtle glass-crack SFX on the lock fracture
- **Proof shown**: none
- **Takeaway**: centralized adjudication is fragile by construction

### Scene 3 — Product reveal (0:14–0:22)
- **Purpose**: name lands as the answer
- **VO**: "Uptime Arbiter locks the evidence sources before anyone's arguing — then lets GenLayer's validators read them independently."
- **On-screen copy**: "Uptime Arbiter"
- **Visual**: wordmark in Space Grotesk, restrained entrance (opacity + 4px rise, spring-eased, ~1.2s hold), on `#10131a` background with `#4cd7f6` accent underline draw-on
- **Product asset**: none (typography-only hero moment per brief's "no excessive logo spin" rule)
- **Pexo**: none
- **Transition out**: T1 mask wipe revealing real browser frame underneath
- **Sound cue**: single clean confirmation tone
- **Proof shown**: none
- **Takeaway**: the name is the mechanism, not a brand

### Scene 4 — Registration flow (0:22–0:34)
- **Purpose**: show the actual pinning step — the load-bearing design decision
- **VO**: "Provider and customer register together. They pin the exact public sources that will ever be checked — and the exclusions that don't count as a breach."
- **On-screen copy**: "pinned before the dispute exists"
- **Visual**: real screen recording of `/register` flow on the live app — cursor deliberately fills evidence-source URLs and an exclusion term, BrowserFrame component crops to the relevant form region, subtle push-in before the submit click
- **Product asset**: fresh recording, live app
- **Pexo**: none
- **Transition out**: T1 mask wipe (panel edge) to registry/vault view
- **Sound cue**: soft UI click on each field commit
- **Proof shown**: real pinned evidence source list + exclusion term text on screen
- **Takeaway**: nothing can be added after the fact

### Scene 5 — Escrow + activation (0:34–0:40)
- **Purpose**: show funds are real and locked
- **VO**: "Both sides lock GEN as escrow. The SLA goes active."
- **On-screen copy**: "PROPOSED → ACTIVE"
- **Visual**: real recording of vault/registry UI showing status badge transition; StateMachine component overlays the two-state pill sequence in sync with the real badge
- **Product asset**: fresh recording, live app (registry/vault)
- **Pexo**: none
- **Transition out**: T3 state flash on ACTIVE badge
- **Sound cue**: state-change chime
- **Proof shown**: real ACTIVE status badge from the live contract state
- **Takeaway**: this isn't a UI mockup — funds move

### Scene 6 — Claim + independent evaluation (0:40–0:58)
- **Purpose**: the core mechanism — this is the technical heart of the film
- **VO**: "When a claim is filed, every validator fetches the pinned sources itself — no one hands in their own evidence. They don't compare opinions. They compare one computed number."
- **On-screen copy**: "no claimant-supplied evidence. ever."
- **Visual**: T2 zoom-through from real claims-page recording into an animated ArchitectureFlow: claim → N validator nodes independently reaching out to 2-3 evidence-source icons → converging arrows → single "breach-minutes: X" MetricReveal. Use real evidence-source examples from the repo (status page / RSS / JSON API) as small labeled icons, not generic cloud icons
- **Product asset**: real claims-page recording (`/claims/[claimId]`) for the entry; rest is Remotion diagram
- **Pexo**: none — this is the "poor Pexo use case" (recreating interface/mechanism) the brief explicitly warns against faking
- **Transition out**: T4 match-cut — the converged number's motion continues into the next scene's verdict badge
- **Sound cue**: distinct "evidence arrival" tick per validator node reaching its source; a resolving chord when they converge
- **Proof shown**: real breach-minutes figure IF captured on screen during recording; otherwise the diagram stays abstract/symbolic and captioned as illustrative
- **Takeaway**: agreement is on a number, not on trust

### Scene 7 — Verdict + challenge (0:58–1:10)
- **Purpose**: show the dispute has real, inspectable resolution — including the safety valve
- **VO**: "The result is a real verdict, not a guess. And if either side disagrees, they can only add evidence — never take it away."
- **On-screen copy**: "additive only"
- **Visual**: real verdict badge (RESOLVED_NO_BREACH / RESOLVED_BREACH / INCONCLUSIVE — whichever is actually visible on the live claim at record time) captured via BrowserFrame; then a quick StateMachine beat showing the additive-only challenge branch
- **Product asset**: real recording of the claim detail page's resolved status
- **Pexo**: none
- **Transition out**: T1 mask wipe
- **Sound cue**: verdict reveal sting (restrained, not a boom)
- **Proof shown**: real on-screen verdict text/badge
- **Takeaway**: even disagreement is bounded by the rules set at the start

### Scene 8 — Technical credibility beat (1:10–1:18)
- **Purpose**: prove it's not just a nice diagram — it's tested
- **VO**: "Thirty-five tests prove the validators re-derive their own answer — they never just trust the leader."
- **On-screen copy**: "39/39 passing"
- **Visual**: EvidenceCard component styled like a terminal/test-report readout, using the real test count and the specific test name from `tests/direct/test_claims_and_evaluation.py`
- **Product asset**: terminal capture of `pytest tests/direct/` run, or a styled recreation using the real output text if a live capture isn't available in time (must match actual pass count)
- **Pexo**: none
- **Transition out**: T3 state flash
- **Sound cue**: rapid soft ticks counting up to 35
- **Proof shown**: real test count + one real test name
- **Takeaway**: the trust claim is independently provable, not just narrated

### Scene 9 — Ecosystem positioning (1:18–1:24)
- **Purpose**: correctly attribute GenLayer without over-claiming
- **VO**: "Built on GenLayer's independent validator consensus — running live today on StudioNet."
- **On-screen copy**: "GenLayer StudioNet"
- **Visual**: architecture pull-back — camera (simulated via scale/position interpolate) retreats from the converged-validator diagram to reveal the full system: frontend, backend-as-read-cache, contract, StudioNet label
- **Product asset**: none (diagram continuation from Scene 6)
- **Pexo**: none
- **Transition out**: T2 zoom-through into end card space
- **Sound cue**: settling low tone
- **Proof shown**: none (positioning, not a proof beat)
- **Takeaway**: correctly scoped ecosystem claim — StudioNet, not mainnet

### Scene 10 — Close (1:24–1:30)
- **Purpose**: memorable statement + CTA
- **VO**: "Two adversarial parties bet on the truth. The internet decides who's right."
- **On-screen copy**: "Uptime Arbiter · Live on GenLayer StudioNet · uptime-arbiter.vercel.app"
- **Visual**: EndCard component — wordmark, one-line positioning, live URL, StudioNet attribution, clean dark background matching Scene 3's treatment for bookend symmetry
- **Product asset**: none
- **Pexo**: none
- **Transition out**: N/A (final frame)
- **Sound cue**: final resolving chord, brief silence before cut
- **Proof shown**: live URL (this itself is checkable)
- **Takeaway**: what to remember, where to verify it yourself

---

## Timing check
5 + 9 + 8 + 12 + 6 + 18 + 12 + 8 + 6 + 6 = 90s. Matches target.

## Vertical (9:16) / Square (1:1) notes
- Scenes 1–3 and 10 recompose almost directly (typography-centric, safe at any ratio)
- Scenes 4–8 (real UI) need BrowserFrame cropped to the specific interactive region rather than the full viewport — capture recordings at high enough resolution to crop without upscaling artifacts
- Diagram scenes (6, 9) restack ArchitectureFlow vertically instead of horizontally for 9:16
- Caption style: phrase-level for 16:9 master; slightly faster word-group reveal permitted for 9:16/teaser only, per brief's caption rules
