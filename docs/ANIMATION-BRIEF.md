# Animation brief

## Purpose and audience

A 22-second product film for the portfolio page and the README. Audience: interviewers and engineers who
have never seen Fieldline and decide within seconds whether to look closer. It must work without sound and
explain the product before any code is opened.

## Core message

A broken freezer becomes one tracked request that moves through clear rules to a fix, and nothing is lost
or silently overwritten on the way.

## Reference and what was taken from it

The visual reference was a 15.8 s illustrated product video supplied as a local file (stored rotated by 90
degrees; viewed in the correct orientation frame by frame). It is not part of this repository. What was
studied and adapted, not copied:

| Observed in the reference                                                      | Used here as                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Opening in a grey line-art environment where only the character carries colour | The bakery is drawn in hairlines that draw themselves on; only people, bread and the problem are coloured |
| Hard switch from the person to a screen in use, with hands at a keyboard       | The curved wipe reveals a desk with the real Fieldline screen and a dispatcher's hands                    |
| Curved-edge wipe into a dark, abstract space where objects float               | Navy curtain with a moving curved edge; the request card floats in the dark lane                          |
| An object carried across scene changes (match cut)                             | The request card is born from the phone call and travels through every scene                              |
| Staggered pop-in of interface items with slight overshoot                      | Tasks appear one by one with a back-ease and tick off in sequence                                         |
| Return to a human scene for the result                                         | Circular reveal back to the bakery for the fix                                                            |

Not taken: the characters, brand, products, colours, layouts or any asset of the reference.

## Duration and format

22.0 s, 1920x1080, 30 fps, H.264 (High, yuv420p, BT.709, faststart). No audio track: every point is carried by
picture and short captions.

## Palette and typography

From the product's design tokens (see [DESIGN.md](DESIGN.md)): paper `#f3f1ec`, navy `#18202a`, rust `#b23c17`,
bright rust `#e8673c`, hairline grey `#c9c2b4`, status colours exactly as in the app (Assigned `#4a3a99` on
`#ece8f8`, In progress `#0f5e52` on `#ddf1ed`, Resolved `#2c6324` on `#e3f2df`). IBM Plex Sans for captions and
UI text, IBM Plex Mono for the request number, loaded from the project's own font packages.

## Motion language

Card choreography and status changes. Objects ease out on entry (`outCubic`, `outBack` for pop-ins), transitions
use `inOutCubic` so the eye can follow, idle life is a small sine (breathing, floating card). Status changes are
instant colour swaps with a short green outline flash, like the app. No flashing or strobing; nothing faster
than a 0.15 s fade.

## Scenes

| #   | Time      | Scene                                                                                                         | Product capability shown  |
| --- | --------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | 0.0-4.3   | Bakery drawn in hairlines; freezer at +6 °C, dripping; owner calls                                            | The need                  |
| 2   | 4.3-9.6   | Curved navy wipe; real request detail screen; cursor on Reassign/Assign; card turns Assigned with Rina Haddad | Assignment                |
| 3   | 9.8-14.6  | Dark lane Assigned to In progress to Resolved; three real seed tasks tick; card turns Resolved                | Status machine, task rule |
| 4   | 14.6-17.2 | Two named cursors; one save succeeds (version 4), the other gets the app's conflict panel                     | Optimistic concurrency    |
| 5   | 17.0-19.6 | Circular reveal to the bakery; technician fixes the freezer, -18 °C, check                                    | Outcome                   |
| 6   | 19.6-22.0 | End card: mark draws, name, tagline, repository                                                               | Brand                     |

Full timing: [ANIMATION-STORYBOARD.md](ANIMATION-STORYBOARD.md).

## On-screen text

"7:02 a.m. The freezer stops cooling." / "One request, assigned in seconds." / "Tasks first, then it can be
resolved." / "Two editors. Nothing overwritten silently." / "Fixed, closed and on the record." / "Fieldline" /
"Service requests, field tasks and team workload" / "github.com/gad-rapaport/fieldline". Each caption stays at
least 2.3 s.

## Assets and sources

| Asset                                   | Source                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Characters, bakery, laptop, icons, card | Original SVG drawn in [animation/scene.js](../animation/scene.js)                                                                  |
| Product screen                          | [docs/screenshots/request-detail.png](screenshots/request-detail.png), captured from the running app by the E2E screenshot project |
| Request data on the card and tasks      | The seed's real issue template (SR number, title, the three tasks, technician name)                                                |
| Conflict panel wording                  | The app's own text                                                                                                                 |
| Fonts                                   | IBM Plex (SIL Open Font License), from `node_modules/@fontsource`                                                                  |
| Music                                   | None                                                                                                                               |

## Production

Code-based and reproducible: the scene is SVG built and animated by [scene.js](../animation/scene.js) with the
small [motion.js](../animation/motion.js) toolkit, where every property is a pure function of time. The renderer
captures frames with Playwright and encodes with ffmpeg. None of it is in the application or its image. Exact
commands: [ANIMATION-RENDERING.md](ANIMATION-RENDERING.md).

## Acceptance checks

- Watched in full after rendering (contact sheet and per-transition frame sheets reviewed).
- No clipped text, empty frames, broken transitions or personal data; all people and the bakery are fictional.
- Every capability shown exists and is covered by tests: assignment, status machine, tasks-before-resolve rule,
  version conflict panel.
- Understandable with the sound off; captions readable at 1080p and in the 640 px preview.
