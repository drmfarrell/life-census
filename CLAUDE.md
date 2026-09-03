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

- `census.js` — grouping in passes: loose groups (cells within 3 steps) that are a known
  object are named whole; two unnamed groups with a bounding-box gap ≤ 8 are tried together
  (pentadecathlon halves); the rest is regrouped tighter, down to strict 8-connected pieces,
  each named or sent to "other". Symmetry-invariant canonical shape key, plain-array B3/S23
  reference stepper, library seeded with one shape per object (16 objects incl. pulsar,
  pentadecathlon, clock, LWSS; every phase and orientation derived from the seed and verified
  at load), and `settledCycle`/`stableRun` for run-until-settled. `require()`-able from node.
- `test/census.test.js` — `node test/census.test.js` (framework-free; 798 assertions pass as
  of 2026-09-03). Run it before every commit.
- `main.js` — `get_live_cells()` walks the hashlife root via `life.node_get_field`; the
  Census button, the `#census_dialog` panel, Recount, Save table (CSV download; generation
  in the file name and header rows), and Run until settled (one 10-generation batch per
  animation frame, field and table redrawn after every batch; settled = the last 20 checks
  (200 generations) repeat with a cycle ≤ 6 checks, cycle 1 = unchanged, cycle > 1 = an
  unnamed oscillator is cycling; cap 50,000; the button reads Stop while it runs).
- `index.html`, `life.css` — the button next to Randomize and the panel. The panel lives
  OUTSIDE `#overlay`, docked to the right edge (fixed, 300px) so the field stays visible;
  black on white. Buttons sit above the table so Stop is never below the fold.
- `test/browser-check.mjs` — `node test/browser-check.mjs` drives the student path in a
  headless Chromium over the DevTools protocol (no npm deps; uses Playwright's cached
  browser binary, override with `CHROME=/path/to/chrome`). Prints PASS/FAIL per step.
- `examples/list` — hand-maintained index for the Patterns button (one `name size` per line,
  see the parser in `main.js`); add a line when adding an RLE to `examples/`.
- URL handling in `main.js` is site-relative: `set_query` keeps the page's own path (upstream
  rewrote it to `/life/`), `view_link`/`rle_link(id, true)` point at this site (upstream
  pointed at copy.sh), and bare `www.` links from RLE comments get `https://`.

## Known gaps

- **Browser verification** is scripted (`node test/browser-check.mjs`, 2026-09-03: a 120×120
  random field settled in ~7 s at ~600 generations/s). The instructor was also clicking
  through by hand on 2026-09-03. Serve with `python3 -m http.server 8080 --bind 0.0.0.0`.
- **Rarer oscillators (figure eight, p8; anything else) are not in the library.** They land
  under "other" and the cycle check in run-until-settled copes (checked every 10 generations
  a figure eight cycles every 4 checks). An oscillator whose period in checks exceeds 6 would
  still never settle. Adding one is a seed + a test entry, but every phase must be at most two
  loose groups within the pair gap or it is silently left unnamed in that phase.
- A known multi-piece object (pulsar, pentadecathlon, split-phase beacon/toad) that sits
  within two cells of something else is not recognised whole; it degrades to its strict
  pieces (a pulsar then shows as 8 blinkers etc. in some phases). Rare in settled ash.
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
