# v1.1.1 — Camera, Intro and Journal Update

- Increased first-person mouse-look sensitivity for practical full 360-degree horizontal turns.
- Normalized yaw to keep rotation numerically stable over repeated turns.
- Increased per-event mouse movement cap to reduce lost movement during fast turns.
- Enabled the cinematic intro briefing in the feature installation flow.
- Expanded the intro controls briefing with pointer-lock, full-look, movement and journal instructions.
- Expanded the intro narrative to point players toward evidence, testimony, contradictions, hypotheses and unresolved questions in the journal.

## Verification
- Source changes packaged.
- `npm install` did not complete in the packaging environment, so typecheck/build are not certified here.
- Test the game in a browser before deploying this release.
