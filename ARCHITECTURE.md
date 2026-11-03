# Architecture

This document describes the architecture visible in the supplied project source dump. It documents the existing module boundaries; it does not claim that every planned system or campaign chapter is fully implemented.

## 1. Design goals

- Keep application startup and shutdown separate from gameplay logic.
- Build runtime services in a known dependency order.
- Use typed events for communication between independent systems.
- Centralise state transitions and resource cleanup.
- Keep player, monster, world, UI and rendering responsibilities in separate modules.
- Make gameplay rules testable without requiring a full browser session where practical.

## 2. Runtime startup

```text
src/main.ts
  └── GameApplication
        ├── createServices() via GameBootstrap
        │     ├── EventBus
        │     ├── GameStateMachine
        │     ├── RendererManager
        │     ├── WorldManager
        │     ├── PlayerController
        │     ├── Flashlight
        │     ├── Subject09
        │     ├── GameUI
        │     └── GameLoop
        └── GameController
```

`GameApplication` is the composition entry point. `GameBootstrap` creates the services and registers disposable resources. `GameController` coordinates the runtime after construction. `GameLoop` owns the frame loop and bounded simulation updates.

## 3. Module boundaries

| Directory | Responsibility | Typical contents |
|---|---|---|
| `app/` | Application composition and runtime coordination | `GameApplication`, `GameBootstrap`, `GameServices`, `GameController`, `GameLoop`, `GameConfig` |
| `chapters/` | Campaign definitions and chapter-specific tuning | Campaign index, chapter definitions, AI profiles |
| `core/` | Shared infrastructure | Event bus, state machine, event types, disposal, logging, random |
| `gameplay/` | Reusable gameplay mechanics | Hiding, distraction, objectives, sound events, restart |
| `input/` | Input abstraction | Bindings, input manager, pointer lock |
| `monster/` | Subject 09 simulation | State machine, perception, memory, navigation, model |
| `player/` | Player simulation and view controls | Controller, motor, collider, camera, flashlight, noise |
| `rendering/` | Graphics and presentation services | Renderer, lighting, audio manager |
| `save/` | Persistence boundary | Save manager |
| `testing/` | Automated/headless validation | AI harness, scenarios, assertions and specs |
| `ui/` | Player-facing interface | Main menu, HUD, pause/settings, prompts, chapter screens |
| `world/` | Facility representation | Layout, builder, geometry, collision, navigation, lighting |

## 4. Core runtime contracts

### Application lifecycle
`GameApplication` owns startup and disposal. Keep DOM bootstrapping and application-level failure handling here; avoid placing individual gameplay rules in this class.

### Service construction
`GameBootstrap` creates services in dependency order and disposes partially created resources if initialisation fails. When adding a service, update the service contract and bootstrap together.

### Shared services
`GameServices` is the typed contract for systems that need access to runtime services. Prefer explicit dependencies in constructors over hidden global state.

### Events
`EventBus` provides typed publish/subscribe communication. Use events for cross-system notifications; use direct method calls for tightly-owned operations with a clear owner.

### State
`GameStateMachine` is responsible for valid game-mode transitions. Avoid changing the game mode through unrelated UI or gameplay modules.

### Cleanup
Objects that register listeners, create GPU resources, or start loops should expose and use deterministic disposal. Register owned resources with the relevant disposable store/group.

## 5. Gameplay data flow

```text
InputManager
   └── PlayerController / PlayerMotor
          ├── PlayerNoiseEmitter ──> EventBus ──> Subject09 perception
          └── PlayerCollider ──────> World collision

WorldManager
   ├── Facility layout / geometry
   ├── CollisionWorld
   └── Navigation data

Subject09
   ├── MonsterStateMachine
   ├── MonsterPerception
   ├── MonsterMemory
   ├── MonsterNavigation
   └── MonsterModel

GameController
   ├── Updates gameplay systems
   ├── Coordinates game state
   └── Connects runtime behaviour to GameUI
```

This is a responsibility map, not a complete call graph. Consult the source files for exact method-level behaviour.

## 6. Chapter configuration

The `chapters/` directory contains campaign metadata, chapter definitions and per-chapter AI profile data. The current bootstrap selects Chapter 1's AI profile at startup. The existence of later chapter definitions does not by itself mean that full playable chapter transitions are wired into the runtime.

When implementing chapter progression, keep chapter content/configuration separate from shared systems. Validate that the selected chapter profile is applied by the runtime and that its objectives, world content and completion flow are actually connected.

## 7. Testing strategy

Run the available checks from the repository root:

```bash
npm run typecheck
npm test
npm run test:reach
npm run build
```

Automated checks do not replace browser play-testing. Manually validate:

- Startup, menu and restart flows.
- Pointer lock and mouse look.
- Player movement, crouching, sprinting and collision.
- Monster perception, investigation, search and chase.
- Interactions, objective progression and exit conditions.
- Pause/resume, tab switching and cleanup.
- Audio behaviour after a user gesture.

## 8. Safe extension workflow

1. Identify the owning module before adding functionality.
2. Keep new code inside that responsibility boundary.
3. Add explicit constructor dependencies where needed.
4. Add typed events only for cross-system communication.
5. Register listeners/resources for disposal.
6. Add or update headless tests for deterministic logic.
7. Run type-check, tests and production build.
8. Verify the feature in a real browser before deployment.
