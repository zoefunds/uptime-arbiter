# Pexo Prompts — Uptime Arbiter

## Decision: no Pexo footage used in the master film

Per STORYBOARD.md, every scene is either:
1. Real captured product footage/screenshots (scenes 4-8), or
2. Remotion-native typography/diagram/motion graphics (scenes 1-3, 9-10)

This is intentional, not an oversight. The brief's own "poor Pexo use case" list explicitly warns against "recreating the actual interface," "fabricating product interactions," and "generic futuristic imagery" — and this product's most compelling visual material (real pinned evidence sources, a real resolved verdict, a real 39/39 test run) already exists and is stronger than any generated cover footage would be. Introducing atmospheric Pexo shots (e.g. a generic "server room" or "person looking at a dashboard") would add spectacle without adding proof, which the brief's non-negotiable truthfulness rule treats as a failure mode.

## If a future cut wants atmosphere (e.g. a social teaser needs a colder open)

Only then, and only with a specific narration line to justify it, consider a single short (2-4s) establishing shot for the Scene 1 hook — never longer, never depicting fake UI or fabricated transaction confirmations. Draft prompt for that specific case only:

> Shot purpose: cold-open atmosphere before the "4 min vs 40 min" typographic beat.
> Subject: a single unattended server rack status light blinking amber in an otherwise dark row.
> Environment: a clean, minimal data center aisle, no signage, no logos.
> Exact action: the light blinks steadily, camera holds.
> Camera framing: tight close-up on the light, extreme shallow depth of field.
> Camera movement: static, no movement.
> Lighting: near-dark, single amber practical light source only.
> Mood: quiet tension, not dramatic.
> Colour relationship to product branding: amber matches the app's tertiary color (#ffb95f) for visual continuity into Scene 1's chip colors.
> Shot duration: 2 seconds.
> Aspect ratio: 16:9 (and 9:16 crop-safe center composition for social).
> Realism level: photoreal.
> Prohibited elements: no readable text, no logos, no crypto/blockchain iconography, no human figures, no generic "hacker" tropes.
> Transition compatibility: must cut cleanly to the KineticText hook via a hard cut or quick crossfade — no swipe/wipe since Scene 1 has no BrowserFrame to wipe from.

This is documented as an option, not committed to the current build. Revisit only if the master film, once assembled, is judged to need it.
