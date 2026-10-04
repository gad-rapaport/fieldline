# Design

## Identity

Fieldline is a dispatch desk: dense, calm, built for people who look at it all day. The visual language borrows
from printed work orders and control-room boards: warm off-white paper, a near-black navy rail for navigation,
and one rust-orange accent reserved for primary actions and things that are late.

- **Mark:** three stacked strokes of decreasing length (a work queue), rust on navy.
- **Accent use:** primary buttons, active navigation edge, overdue and urgent signals only. Everything else is
  neutral so that orange always means "act" or "late".

## Typography

**IBM Plex Sans** (400, 500, 600) for interface text and **IBM Plex Mono** (400, 500) for request numbers,
key figures and versions.

Why Plex: it was drawn for interfaces and technical documentation, has clear distinctions between similar
glyphs (Il1, O0) that matter when reading SR numbers aloud on a call, ships tabular figures for aligned table
columns, and its slightly industrial tone suits a field-service tool. The mono companion keeps identifiers
visually distinct without a second family. Only the Latin subset is shipped (about 150 KB total as WOFF2).

Base size 15 px with 1.5 line height; tables at 0.92 rem; section labels in small caps-style uppercase with
tracking to separate structure from content.

## Colour tokens and contrast

All text pairs meet WCAG 2.2 AA (4.5:1 for body text). Ratios computed with the WCAG relative luminance formula.

| Token / pair                   | Foreground            | Background | Ratio                              |
| ------------------------------ | --------------------- | ---------- | ---------------------------------- |
| Body text on paper             | `#1b2430`             | `#f3f1ec`  | 13.9                               |
| Muted text on white            | `#545e69`             | `#ffffff`  | 6.6                                |
| Muted text on paper            | `#545e69`             | `#f3f1ec`  | 5.9                                |
| Primary button                 | `#ffffff`             | `#b23c17`  | 5.9                                |
| Links                          | `#8f2f10`             | `#ffffff`  | 8.1                                |
| Sidebar text / muted           | `#e8e5de` / `#a7adb5` | `#18202a`  | 13.1 / 7.3                         |
| Overdue text                   | `#9a3412`             | `#ffffff`  | 7.3                                |
| Error text                     | `#a3221a`             | `#ffffff`  | 7.5                                |
| Status badges (7 pairs)        |                       |            | 6.2 to 7.4                         |
| Focus ring                     | `#1a5fb4`             | `#ffffff`  | 6.3 (non-text, 3:1 required)       |
| Chart: created / resolved bars | `#3b5b85` / `#2a8a74` | `#ffffff`  | 7.0 / 4.2 (non-text, 3:1 required) |

## Status and priority without colour alone

- Every status badge has a distinct glyph (hollow circle, ringed dot, play, pause, check, square, cross) and its
  name in text.
- Priority shows a 1-4 bar meter plus the word; urgent is also bold.
- Overdue items carry an "Overdue" text flag, not just red text.
- Charts have a legend with counts and a "Show as table" alternative.

## Layout and components

- Spacing scale 4/8/12/16/24/32/48 px; radius 4 px for controls and 8 px for panels.
- Tables: sticky uppercase headers, sortable columns as real buttons with `aria-sort`, secondary data in a muted
  second line instead of extra columns.
- Request detail: content on the left (description, tasks, notes), facts and actions on the right so the
  next step is always in the same place.
- Forms: label, hint and error wired with `aria-describedby`; errors start with "Error:" (visible text via CSS
  and announced) and the field gets a thicker red border.
- Dialogs use the native `<dialog>` element for focus trapping and Escape handling.
- Toasts announce through a live region; errors use `role="alert"`.

## Responsive behaviour

| Width       | Behaviour                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| > 1100 px   | Sidebar, two-column detail page, two-column dashboard panels              |
| 900-1100 px | Single-column detail and dashboard                                        |
| < 900 px    | Sidebar becomes a top bar with a Menu button (`aria-expanded`)            |
| < 720 px    | Tables become labelled cards; form rows stack; filters wrap to full width |

E2E checks that the phone layout has no horizontal scroll.

## Accessibility checklist (main flows)

- Skip link is the first Tab stop; focus moves to `<main>` after client-side navigation.
- Visible 3 px focus ring on every interactive element.
- Document title changes per screen.
- `prefers-reduced-motion` removes the spinner animation and transitions.
- axe-core (WCAG 2.0/2.1/2.2 A and AA rules) reports no serious or critical issues on the dashboard and the
  phone detail page in E2E.
- Print stylesheet hides navigation and controls.

## Assets and licences

| Asset                        | Source                                                                              | Licence                   |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------------------- |
| IBM Plex Sans, IBM Plex Mono | `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` (npm), served from the app | SIL Open Font License 1.1 |
| Icons and logo               | Hand-drawn inline SVG in this repository                                            | Part of this project      |
| Demo data                    | Generated by [server/src/db/seed.ts](../server/src/db/seed.ts)                      | Synthetic                 |
