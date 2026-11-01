# DON'T FEED THE MONSTER — Audio Asset Manifest

Place the licensed audio files listed below inside this directory.

| # | Filename | Purpose |
|---|---|---|
| 1 | monster_step_far_01.ogg | Distant monster footsteps |
| 2 | monster_step_near_01.ogg | Nearby monster footsteps |
| 3 | monster_step_chase_01.ogg | Monster chase footsteps |
| 4 | monster_breath_close.ogg | Close monster breathing |
| 5 | monster_breath_heavy.ogg | Heavy monster breathing |
| 6 | monster_growl_low.ogg | Low monster growl |
| 7 | monster_growl_aggro.ogg | Aggressive monster growl |
| 8 | monster_roar_detect.ogg | Monster detects player |
| 9 | monster_scratch.ogg | Monster scratching |
| 10 | monster_sniff.ogg | Monster sniffing |
| 11 | player_heartbeat.ogg | Player heartbeat |
| 12 | amb_room_tone.ogg | Facility room ambience |
| 13 | amb_vent_loop.ogg | Ventilation ambience |
| 14 | amb_electrical_hum.ogg | Electrical ambience |
| 15 | sfx_metal_creak_01.ogg | Metal creak |
| 16 | sfx_distant_impact_01.ogg | Distant impact |
| 17 | sfx_door_slam_01.ogg | Door slam |
| 18 | sting_detect_01.ogg | "It sees you" jump-scare stinger (non-positional) |
| 19 | sting_lost_01.ogg | Tense "it lost you" cue (non-positional) |
| 20 | sting_caught_01.ogg | Caught scream (non-positional) |
| 21 | monster_whisper_close.ogg | Uncanny whisper, extreme close range only |

## Requirements

- Use `.ogg` files.
- Confirm that the audio files are licensed for your project.
- Keep the filenames exactly as listed.
- Do not use empty files as substitutes.
- Test positional audio and looping behaviour in the game.

The TypeScript sound system handles missing files without crashing,
but missing sounds will remain silent — **except** for sting_detect_01.ogg,
sting_lost_01.ogg, sting_caught_01.ogg and monster_roar_detect.ogg, which
HorrorAudioDirector synthesizes procedurally (ProceduralHorrorSynth in
src/rendering/AudioManager.ts) when the real file is missing, so those four
key jump-scare moments are never silent even before you add real assets.