# life-census — Conway's Game of Life with an object census

Fork of https://github.com/copy/life (copy.sh/life, hashlife in plain JS, no build step).
Owner: Martilias Farrell, PhD, Cheyney University of Pennsylvania. Built 2026-09-03 for the
General Biology I lab "Hypothesis-based science in the Game of Life" (BIOL 1112, Lab 2), which
lives in `~/story_based_lecture/general_biology_1/labs/lab02-hypothesis-game-of-life.*`.
This repo is deliberately SEPARATE from that coursebot workspace; do not edit anything there.

## Why it exists

Students randomize a large field, run it until it stops changing, and count what is left
(blocks, beehives, loaves, blinkers, gliders, "other"). Counting by hand was too laborious
(instructor, 2026-09-03). The census does the count. The student path must stay two clicks:
**Randomize → Run until settled → read the table.**

## What is here

- `census.js` — 8-connected grouping, symmetry-invariant canonical shape key, a plain-array
  B3/S23 reference stepper, and a library seeded with one shape per object; every phase and
  orientation is derived from the seed and verified at load. `require()`-able from node.
- `test/census.test.js` — `node test/census.test.js` (framework-free; 160 assertions pass as
  of the first build). Run it before every commit.
- `main.js` — `get_live_cells()` walks the hashlife root via `life.node_get_field`; the
  Census button, the `#census_dialog` panel, Recount, and Run until settled (census every 10
  generations; settled = 20 identical checks in a row = 200 generations; cap 50,000).
- `index.html`, `life.css` — the button next to Randomize and the panel, black on white.

## Known gaps

- **Not yet verified in a real browser end to end.** Node tests cover the census logic; the
  UI wiring was checked by code review and an HTTP smoke test only. Headless Firefox on the
  Linux box could not screenshot. First job: open http://localhost:8080/ (serve with
  `python3 -m http.server 8080 --bind 0.0.0.0` from this folder) and click through the
  student path. A driver page that scripts the iframe (randomize → submit → census → run
  until settled) is a fine way to automate it once a headless browser is available.
- **Lightweight spaceship (LWSS) is not in the library** — six seed attempts failed
  verification and it was dropped rather than debugged. Its two phases are each 8-connected
  (9 and 12 cells); a correct seed would add it.
- **Beacon and toad** each have one phase that splits into two 3-cell pieces under strict
  8-connectivity; that phase is reported as "other, 3 cells × 2". Documented in the README.
- On an infinite field gliders never stop; "settled" still lists them. Correct, say so.

## Rules

- Plain language on anything a student reads (the panel, the README student section).
  Sentences under 30 words, "you" voice, no jargon a first-year has not met.
- Accessibility: 4.5:1 contrast minimum, every control keyboard-reachable with a visible
  label; no colour as the only signal.
- No build step, no dependencies, must work from `file://` and from any static host.
  Hosting is the instructor's (wolfnode.org planned); do not set up GitHub Pages unasked.
- Keep upstream's LICENSE and credit; this is a derivative work.
- Never guess an object's name: unknown clusters are "other, N cells".
- Commit trailers per the harness; push to origin (the fork on drmfarrell's account).
