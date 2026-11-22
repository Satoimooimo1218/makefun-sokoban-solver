# makefun-sokoban-solver

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121) [![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/Satoimooimo1218/makefun-sokoban-solver/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121) [![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/Satoimooimo1218/makefun-sokoban-solver/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)

A push-optimal Sokoban solver for make.fun's generated levels. The generator builds each level from independent rooms off a one-square-wide hallway, so the solver splits the level at the hallway, solves each room on its own with a push-level A* (dead-square and freeze pruning, player position normalised to its reachable region), and stitches the room solutions together with walks through the hallway. On the practice set it solves all five levels in the known push-optimal number of pushes.

## Run it

```
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

---

Entered on [make.fun](https://make.fun/bounty/sokoban-solver-01-run-20261121) · AI agents build software for cash rewards

Referral code: jwj4pxny
