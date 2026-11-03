# DON'T FEED THE MONSTER — Milestones 1–4 + large map update

## v0.3 changes

- **New large map (60 × 48 m, 9 rooms).** Recovery Ward, Mess Hall, Storage, Central Atrium, Security, Research Lab, Containment Hall, Records Archive, Exit Hall. Every neighbouring pair of rooms is joined by doorways, so there are loops everywhere (Granny-style): you can run around a block instead of getting cornered. Data lives in `src/world/LevelLayout.ts`.
- **Hiding places Subject 09 cannot enter.** Five *safe closets* and four *service-gap shortcuts* use a 0.88 m gap; the player (radius 0.35) fits, Subject 09 (radius 0.45) does not, enforced by the same collision data the navigation graph uses. 14 lockers remain as the risky option: it can inspect them, more often if you keep using them, but never with certainty.
- **Real navigation.** `world/NavigationGraph.ts` (A*, deterministic tie-breaking, string-pulled paths) and `monster/MonsterNavigation.ts` (stuck recovery, strict/approximate goals). No more straight-line walking through rooms.
- **New creature.** `monster/Subject09Model.ts`: a tall, hunched, eyeless "listener" with huge ear membranes, split jaw, knee-length arms and claws, digitigrade legs, and state-driven animation (listening head-cock, searching sweep, chase lunge).
- **Perception rules.** Sight needs range, FOV and an unblocked line (walls and tall shelves block it). Sounds are muffled by walls. Adaptation is a few capped, decaying counters (`monster/MonsterMemory.ts`) plus a seeded PRNG.

Headless checks: `npm run test:reach` (map reachability, crawl-gap rules, patrol legs) and `npm test` (adds 5-minute AI simulation, determinism, memory rules). Browser play-testing is still required for visuals, pointer lock and feel.

# Original milestone notes

A fresh, playable first-person horror prototype built with Vite, TypeScript and Three.js. It uses original placeholder geometry so the core loop works before production assets are added.

## Included

- **M1 — Foundation:** Vite + TypeScript setup, modular source tree, game lifecycle, configuration points, resize/disposal handling.
- **M2 — Playable prototype:** first-person mouse look, WASD movement, sprint/crouch, wall collision, flashlight, readable industrial environment, visible moving Subject 09.
- **M3 — Chapter 1: CONTAINMENT:** main menu, How to Play, keycard pickup, locked exit, hiding lockers, research note, throwable distraction, objective HUD, caught/retry and chapter completion.
- **M4 — Monster AI/adaptation:** PATROL, INVESTIGATE, SEARCH, CHASE and RETURN states; movement-noise and thrown-object events; line-of-sight checks against walls; last-known-position search; repeated distraction/hiding affects search choices.

## Requirements

- Node.js 20.19+ or 22.12+
- VS Code or another editor
- A desktop browser with WebGL support

## Run in VS Code (Windows)

1. Extract this folder.
2. Open the `dont-feed-the-monster` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Run:

```powershell
npm install
npm run dev
```

5. Open the local URL Vite prints, normally `http://localhost:5173`.

Build/type-check:

```powershell
npm run typecheck
npm run build
```

## Controls

- `W A S D`: move
- Mouse: look
- `Shift`: sprint (louder)
- `Ctrl` or `C`: crouch (quieter)
- `E`: interact, pick up, enter/leave a locker, unlock exit
- `G`: throw a sound distraction
- `F`: toggle flashlight
- `Esc`: pause/resume

Click the game view to capture the mouse. Press `Esc` to release it and pause.

## Current limitations (important)

- This is a playable prototype, not a finished commercial game. The environment and monster use procedural placeholder geometry; no external character animations, voice acting, save/load, full audio mix, or production art are included.
- Collision is a lightweight axis-aligned box check, not a full physics engine.
- Monster adaptation is rule-based and deliberately simple; it is not machine learning.
- Chapter 1 is a compact test level and its estimated duration will vary. Chapters 2–5 are not implemented in this milestone package.
- Automated browser gameplay tests are not included yet. Run the build/type-check commands and manually test the checklist below.

## Acceptance checklist

- [ ] Main menu opens; How to Play and New Game buttons work.
- [ ] Mouse look and WASD work after clicking the scene.
- [ ] Walls block the player.
- [ ] Sprinting and crouching alter movement speed/noise.
- [ ] Subject 09 is visible and patrols.
- [ ] Footsteps/throwing trigger investigation; detection can start a chase.
- [ ] E picks up the keycard and reads the note.
- [ ] E enters/exits a locker.
- [ ] Exit rejects the player without the keycard and completes the chapter with it.
- [ ] Caught screen, retry, pause and return-to-menu work.

## Next recommended milestone

Replace placeholder geometry with original GLB assets, improve navigation/pathfinding and collision, add spatial audio/foley and animation, then build Chapter 2 from the same reusable systems. Verify each system in-browser before adding more chapters.

## v0.2.0 — Stages A, B, C

**A. Green build.** Removed the undeclared `message` field error, `tsconfig.json` now references `tsconfig.node.json`, `package.json` has `engines` (Node >= 20.19). `strict`, `noUnusedLocals`, `noUnusedParameters` stay on.

**B. Chapter 1 is winnable.** The keycard room was sealed on all sides. Its east wall now has a 3 m doorway (see `src/world/LevelLayout.ts`). `npm run test:reach` flood-fills the level with the same collision rule the game uses and fails if the keycard, note, lockers, exit, or any patrol leg is unreachable.

**C. Architecture split.** `GameApplication` is lifecycle only. New: `GameConfig`, typed `EventBus`, `GameStateMachine` (illegal transitions rejected), `GameLoop` (clamped frame, sub-steps of at most 1/60 s, pauses simulation when not playing), `DisposableStore` (listeners, timers, GPU resources), `RendererManager`, `GameUI`, `RestartSystem`, `ObjectiveSystem`, `GameBootstrap`/`GameServices`. Behaviour of the player and monster is unchanged (values moved into `GameConfig`).

## Tests

```powershell
npm install
npm run typecheck
npm run build
npm test            # headless: reachability, EventBus, state machine, DisposableStore
```

### Browser-only checklist (not covered by `npm test`)

1. `npm run dev`, open the page, open DevTools console.
2. Run `__dfm.runLifecycleStress(20)`. Expect `stable: true` (one canvas, no extra overlays/listeners).
3. Play Chapter 1: walk into the storage room on the left, pick up the keycard, return to the red exit, press E.
4. Esc pauses and resumes; switching tabs pauses.

## Campaign chapter AI profiles (new)

Each campaign chapter now has its own file under `src/chapters/`:

- `Chapter01_Containment.ts`
- `Chapter02_ForgottenExperiments.ts`
- `Chapter03_SilentWard.ts`
- `Chapter04_PowerFailure.ts`
- `Chapter05_Project09.ts`
- `ChapterAIProfile.ts` contains the per-chapter AI tuning contract.
- `CampaignIndex.ts` lists the chapters and provides `getCampaignChapter()` / `getNextChapter()`.

`Subject09.setChapterProfile(profile)` switches the monster's chapter abilities. `GameBootstrap.ts` currently starts with Chapter 1's profile. When the game's chapter-completion flow advances, call `s.monster.setChapterProfile(nextChapter.ai)` using the selected entry from `CAMPAIGN_CHAPTERS`.

AI progression:

- Chapter 1: basic patrol/chase; sound investigation and hiding-spot inspection disabled.
- Chapter 2: investigates sound events and has a wider hearing radius.
- Chapter 3: checks nearby hiding places after losing the player.
- Chapter 4: an active flashlight increases Subject 09's sight range; movement/sound investigation remains enabled.
- Chapter 5: faster and more perceptive; remembers repeated distraction and hiding tactics through the existing bounded/decaying `MonsterMemory` counters.

Note: these files establish chapter metadata and AI profiles. The current project still boots the original Chapter 1 `WorldManager` map; the new chapter area IDs are campaign placeholders and do not yet generate the expanded chapter maps or wire a chapter-selection screen. Those require separate map/layout and progression integration.

## Interaction categories: Paper vs Solid

Every interactable has a `category` (`src/core/types.ts`):

- **Paper** (loose notes, notebooks, logs, tags, and every document pickup): the object vanishes from the world, then `PaperSheet.show(text)` (`src/ui/PaperSheet.ts`) displays the text on an A4 sheet in a handwritten Corsiva-style font. The sheet stays up and freezes player input until **E** or **Esc** is pressed (multi-page documents: **A / D** turns pages).
- **Solid** (keycard, lockers, terminals, exit door, "nothing here"): only prints its line through the built-in dialog engine (`events 'message'` -> toast), plus any gameplay it already had (pick up, hide, unlock).

To make a new paper: add an interactable with `category: 'paper'` and `text`, or call `paperSheet.show('text')` / `GameController.displayPaper('text')` directly.


## v0.4 horror-paper and sound pass

- Evidence papers now have larger world pickups, rougher stained-paper coloration, dried-blood spatter, grime and a more worn physical-paper appearance. The reading sheet is matte and its text no longer uses a glow effect.
- The security keycard is now a muted, rough, non-emissive material rather than a glowing collectible.
- Added original generated WAV foley for the monster's distant/near/chase footsteps, close/heavy breathing, low/aggressive growls and detection roar. These are loaded through the existing distance-aware horror audio director; proximity tension and chase-state mixing remain driven by monster distance/state.
- Fixed the public audio asset path to match the repository's `public/Audio/` directory on case-sensitive hosts.

### Scope note

This pass improves the existing playable Chapter 1 project and its audio/paper presentation. The current source still has only one fully built playable map and the existing Chapter 1 keycard/exit objective. Chapters 2–5 are campaign metadata/AI profiles, not complete playable levels yet. The requested three-part room-key puzzle, coded locker/keycard sequence and three-part exit-gate collection chain are not yet implemented; they need dedicated world interactables, persistence and objective-state wiring rather than being represented as if already playable.
