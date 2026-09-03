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
plus tub, boat, ship, pond, barge, toad and beacon. Anything it doesn't
recognize is reported as "other" and grouped by how many cells it has. Census
never guesses a name -- if a shape isn't in its library, it says so honestly
instead of pretending.

**The student path**: click **Randomize** to fill the field, then **Census**,
then **Run until settled**. The census panel sits on the right of the screen,
so you can watch the field change while it runs. Click **Stop** to stop early.
When it stops, read the table. **Save table** downloads the counts as a .csv
file that opens in Excel or Google Sheets; the generation number is in the file
name and in the first rows of the file. "Settled" means the count of
each object has stopped changing for 200 generations in a row -- it does
*not* mean everything has stopped moving. On an infinite field, gliders (and
other spaceships) keep flying forever, so a settled field can still have
gliders in it, drifting off toward the edge of the view. That's expected: the
census is about *what* is on the field and *how many*, not where.

**A caveat worth knowing**: beacon and toad, two of the oscillators, each have
one phase where their six cells split into two separate three-cell pieces
that only touch corner-to-corner across a gap the census doesn't bridge. In
that phase the census correctly reports "other, 3 cells x 2" instead of
naming them -- that's not a bug, it's what an honest cell-by-cell count of
that phase actually looks like.

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
