Census fork for teaching
=========================

This is a fork of [copy.sh/life](https://github.com/copy/life), made for a General
Biology I lab at Cheyney University. Students found counting blocks, beehives,
blinkers and gliders by hand too laborious, so this fork adds a **Census** button
that counts them for you.

**What it does**: Census looks at every live cell on the field, groups touching
cells into objects (any two cells that touch, including corner-to-corner, count
as one object), and names the ones that match a known Game of Life shape --
block, beehive, loaf, blinker and glider are the five names used in the lab,
plus tub, boat, ship, pond, barge, toad, beacon, clock, pulsar,
pentadecathlon and the lightweight spaceship. Anything it doesn't recognize is reported as "other"
and grouped by how many cells it has. Census never guesses a name -- if a
shape isn't in its library, it says so honestly instead of pretending.

**The student path**: click **Randomize** to fill the field, then **Census**,
then **Run until settled**. The census panel sits on the right of the screen,
so you can watch the field change while it runs. Click **Stop** to stop early.
When it stops, read the table. **Save table** downloads the counts as a .csv
file that opens in Excel or Google Sheets; the generation number is in the file
name and in the first rows of the file. "Settled" means the count of
each object has stopped changing, or repeats in a short cycle, for 200
generations in a row -- it does *not* mean everything has stopped moving. On an infinite field, gliders (and
other spaceships) keep flying forever, so a settled field can still have
gliders in it, drifting off toward the edge of the view. That's expected: the
census is about *what* is on the field and *how many*, not where.

**How cells become objects**: the census first groups cells that are within
two empty cells of each other. If that whole group is a known shape, it counts
as one object. That is how a pulsar, whose four arms never touch, or a beacon
in the phase where it splits in two, still count as one. Two unnamed groups
that sit close together are also tried as one object; that is how a
pentadecathlon, whose halves drift six cells apart in two of its phases, still
counts as one. If a group is not a known shape, the census splits it into the
pieces that actually touch and names each piece on its own, so two blocks
sitting one cell apart still count as two blocks.

**Oscillators the census does not know** (the figure eight, for example)
show up under "other", and their cell counts change as they cycle. That is
why "settled" also accepts counts that repeat in a short cycle: the run stops,
and the panel tells you an unnamed oscillator is on the field.

This fork keeps everything from the original [copy/life](https://github.com/copy/life)
project and its Hashlife engine; the census only reads the field, it never
changes how the simulation runs. See below for the original project's own
description and links.

life
====

The definite Conway's Game of Life implementation in your browser. Features an infinite field &amp; Hashlife.

All modern browsers are supported. I don't test IE, but it might work starting at version 9 or 10.

The whole thing is written in Javascript, using the canvas tag.


Links
-

- Online version: https://copy.sh/life/
- List of examples: https://copy.sh/life/examples/
- Source of examples (direct link): http://www.conwaylife.com/patterns/all.zip
