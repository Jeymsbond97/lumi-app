# Colour sorting

A SORT button that makes Lumi pick small balls from a plate and drop each into the box of its colour. The arm
motion is a policy trained with reinforcement learning (Isaac Lab, checked in MuJoCo) that runs on the robot's
Jetson Thor.

The full project documents (hardware facts, task design, simulation, RL, sim-to-real, integration) live
with the robot code: `docs/sorting/` in lumi-wave on the Thor (Gitea `Jaka_Lumi/Lumi`) and in the Jaka-Lumi
repository (GitHub). Start with `docs/sorting/README.md` there.

## The app's part

| What | Where |
|---|---|
| SORT tile in COMMANDS → ARM & OBJECTS; needs the arm on and an empty hand; asks first | `src/app/(robot)/commands.tsx`, icon in `src/ui/CommandIcon.tsx` |
| `POST /skills/sort`, sent as a skill so the status line follows `GET /skills/state` | `src/lib/commands.ts` (`sortRequest`) |
| Status line: "Sorting: 2 of 4", then "Done", or the robot's reason | existing skill status handling, counts from `sort` in `/skills/state` |
| Texts in English and Korean | `src/lib/i18n.tsx` (`cmdSort`, `cmdSortHint`, `cmdAskSort`) |
| STOP | the existing STOP on every screen stops the skill |

The robot side (`/skills/sort`, the policy runtime, safety checks) is described in `docs/sorting/06_INTEGRATION.md`.
