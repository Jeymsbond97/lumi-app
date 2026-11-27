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
| SORT runs until STOP: it sorts the balls on the tray, waits while the tray is empty and sorts every ball put there later. Status line: "Sorting the red ball. Sorted 2", "Sorted 5. Waiting for balls on the tray", after STOP "Stopped. Sorted 6", or the robot's reason | `sortLine` in `src/lib/commands.ts`, from `sort` in `/skills/state` |
| Texts in English and Korean | `src/lib/i18n.tsx` (`cmdSort`, `cmdSortHint`, `cmdAskSort`, `cmdSortWaiting`, `cmdSortBall`, `cmdSortLooking`, `cmdSortStopped`, and the refusals `cmdSortNoLayout`, `cmdSortNoTeach`, `cmdSortMisses`) |
| STOP | the existing STOP on every screen stops the skill |

The robot side (`/skills/sort`, the policy runtime, safety checks) is described in `docs/sorting/06_INTEGRATION.md`.
