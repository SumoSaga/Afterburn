# Punch sound hooks in Machine-Fall FPS

The game makes sound through one helper near the top of `mf/game.js`: `snd(name, opts)`, which calls `PUNCH.play`.
If you rewrite a function below, keep its `snd(...)` call or the sound goes silent. `tools/wire.py` in the build notes re-applies all of them.

| Where in game.js | Sound | Notes |
| --- | --- | --- |
| `fireCarbine` | `carbine` | mech layer gets louder for the last six rounds |
| `fireCarbine`, world hit | `impact_dirt` / `impact_metal` / `impact_concrete` | picked by `surface(end)`: ground is dirt, walls alternate by position |
| `fireCarbine`, grunt hit | `impact_body`, `hitmarker` | hit marker pitched up on a headshot |
| `fireCarbine` / `fireCharge` / `fireCannon`, Titan hit | `hitmarker` | |
| `stepGun`, carbine reload | `reload` | Titan cannon reload uses the same sound at pitch 0.6 |
| weapon swap (keydown) | `swap` | |
| `stepGun`, charge rifle | `charge_up` | kept in `chargeSnd`; stopped on release, on swap and on firing |
| `fireCharge` | `charge_fire`, `charge_cool` | |
| `fireCannon`, Titan AI burst | `cannon` | the AI's shots are placed at its muzzle |
| `fireRockets` | `rocket` | stand-in built from existing samples |
| `blast` | `explosion` | volume follows the blast radius |
| Titan lands (`stepTitans`) | `titanfall` | stand-in built from existing samples |
| `hurtTitan` | `shield_hit` or `titan_hit` | |
| grunt `s.onShot` | `grunt_shot`, sometimes `flyby` | fly-by plays on a miss |
| `hurtPilot` | `pilot_hurt` | |
| `killGrunt` | `kill` | |
| `frame` | `PUNCH.listener(...)` | the camera's position and facing, in metres |
| `$("go").onclick` | `PUNCH.start()` | audio must start from a click |

Not in yet: footsteps, jumpkit, slide, wall run, landing, Titan steps and servos, Titan punch, embark and exit, doomed alarm, weather, ambience, music.

## Voices, machines and ambience need no hooks (Punch v0.4)

`punch/punch-director.js` is loaded by `punch.js` itself. Every frame it reads `window.__mf` (B, POINTS, P, TITANS, DROPS, ROCKETS, SQUADS, VEH, ALLIES, GRUNTS, CFG, U, started) and plays:
- the command voice (pack `mil` or `mac`, picked from `B.fac.you`): battle start, points taken and lost, contested, Titan ready, Titans inbound, squads and vehicles lost, reinforcements, the lead changing, near the end, win, loss, commander down;
- the Titan's voice while you are aboard: boot, shield down and restored, hull at half and critical, eject, hostile Titan detected and close, enemy Titanfall, missile lock, incoming rockets, heavy fire, cannon low, rocket pod ready, kills, armor and infantry near;
- Titan steps, servos, hatch, dash, fist, shield break and recharge, reactor alarm, cockpit boot and reactor hum; machine trooper steps and chatter; walker steps; drone and truck engine loops;
- ambience: refinery and wind beds, rain and thunder by `CFG.weather`, and bursts of fighting in the distance.

So keep `window.__mf` exposing those names. If one goes missing, that part goes quiet and nothing breaks. `PUNCH.director.on = false` turns it all off.

Since Punch v0.5: point lines exist for A to E (Alpha to Echo). The watcher reads the score goal from `__mf.GOAL` if the game exposes it and assumes 400 otherwise, so please add `GOAL` to `window.__mf`. The refinery hum only plays near a point whose `label` contains "Refinery". There are no voice lines yet for drop pods, air strikes, shield or medical crates.
