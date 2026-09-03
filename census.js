/*
 * census.js
 *
 * Census fork of copy.sh/life -- groups a field's live cells into
 * objects and names any object that matches a known Game of Life shape
 * (still life, oscillator phase, or spaceship phase).
 *
 * Grouping happens in passes. First, cells within three steps of each
 * other (so, bridging up to two empty cells) form a "loose" group; if
 * the whole group is a known object it is named as one -- this is what
 * lets a pulsar, whose four arms never touch, or a beacon in its split
 * phase be counted as one object. Two unnamed groups that sit close
 * together are then tried as one object (the pentadecathlon spends two
 * of its 15 phases as two halves six cells apart). What is still
 * unnamed is regrouped more tightly, down to the pieces that actually
 * touch (8-connected), and each piece is named on its own or reported
 * as "other, N cells". Two blocks with a one-cell gap therefore still
 * count as two blocks.
 *
 * Plain ES5/ES6. No dependencies. Works as a <script> in the browser
 * (exposes window.Census) and via require() in Node (module.exports).
 */
(function(root, factory)
{
    if(typeof module !== "undefined" && module.exports)
    {
        module.exports = factory();
    }
    else
    {
        root.Census = factory();
    }
})(typeof self !== "undefined" ? self : this, function()
{
    "use strict";

    function cellKey(x, y)
    {
        return x + "," + y;
    }

    // One generation forward, plain-array reference implementation
    // (standard B3/S23 rule). Used both to build the library (every
    // phase of an oscillator/spaceship is derived from a single seed)
    // and by the test suite to independently verify the library.
    function stepCells(cells)
    {
        var neighborCounts = new Map();
        var live = new Set();
        var i, x, y, dx, dy, k;

        for(i = 0; i < cells.length; i++)
        {
            live.add(cellKey(cells[i].x, cells[i].y));
        }

        for(i = 0; i < cells.length; i++)
        {
            x = cells[i].x;
            y = cells[i].y;

            for(dy = -1; dy <= 1; dy++)
            {
                for(dx = -1; dx <= 1; dx++)
                {
                    if(dx === 0 && dy === 0)
                    {
                        continue;
                    }

                    k = cellKey(x + dx, y + dy);
                    neighborCounts.set(k, (neighborCounts.get(k) || 0) + 1);
                }
            }
        }

        var next = [];

        neighborCounts.forEach(function(count, k)
        {
            var isLive = live.has(k);

            if((isLive && (count === 2 || count === 3)) || (!isLive && count === 3))
            {
                var parts = k.split(",");
                next.push({ x: +parts[0], y: +parts[1] });
            }
        });

        return next;
    }

    // Neighbour offsets for a given reach: reach 1 is the 8 touching
    // cells (king move); reach 2 is every cell within two steps, which
    // bridges a gap of one empty cell.
    var OFFSETS_BY_REACH = {};

    function neighborOffsets(reach)
    {
        if(!OFFSETS_BY_REACH[reach])
        {
            var list = [];

            for(var dy = -reach; dy <= reach; dy++)
            {
                for(var dx = -reach; dx <= reach; dx++)
                {
                    if(dx !== 0 || dy !== 0)
                    {
                        list.push([dx, dy]);
                    }
                }
            }

            OFFSETS_BY_REACH[reach] = list;
        }

        return OFFSETS_BY_REACH[reach];
    }

    // Group cells that are within `reach` steps of each other.
    function groupCells(cells, reach)
    {
        var offsets = neighborOffsets(reach);
        var present = new Set();
        var i;

        for(i = 0; i < cells.length; i++)
        {
            present.add(cellKey(cells[i].x, cells[i].y));
        }

        var visited = new Set();
        var components = [];

        for(i = 0; i < cells.length; i++)
        {
            var startKey = cellKey(cells[i].x, cells[i].y);

            if(visited.has(startKey))
            {
                continue;
            }

            var comp = [];
            var stack = [{ x: cells[i].x, y: cells[i].y, k: startKey }];
            visited.add(startKey);

            while(stack.length)
            {
                var cur = stack.pop();
                comp.push({ x: cur.x, y: cur.y });

                for(var j = 0; j < offsets.length; j++)
                {
                    var nx = cur.x + offsets[j][0];
                    var ny = cur.y + offsets[j][1];
                    var nk = cellKey(nx, ny);

                    if(present.has(nk) && !visited.has(nk))
                    {
                        visited.add(nk);
                        stack.push({ x: nx, y: ny, k: nk });
                    }
                }
            }

            components.push(comp);
        }

        return components;
    }

    // Reach of the first, loose grouping pass: cells within three steps
    // (up to two empty cells between them) belong to one group.
    var LIBRARY_REACH = 3;

    // A known object may also be two separated groups. Pairs of unnamed
    // groups whose bounding boxes are at most this many cells apart are
    // tried together.
    var PAIR_GAP = 8;

    // Strict grouping: 8-connected (king-move) components, cells that touch.
    // Accepts either an array of {x,y} or two parallel arrays.
    function connectedComponents(cellsOrX, maybeY)
    {
        return groupCells(toCellArray(cellsOrX, maybeY), 1);
    }

    // Loose grouping at the library reach.
    function looseComponents(cellsOrX, maybeY)
    {
        return groupCells(toCellArray(cellsOrX, maybeY), LIBRARY_REACH);
    }

    function boundingBox(cells)
    {
        var box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

        for(var i = 0; i < cells.length; i++)
        {
            if(cells[i].x < box.minX) box.minX = cells[i].x;
            if(cells[i].y < box.minY) box.minY = cells[i].y;
            if(cells[i].x > box.maxX) box.maxX = cells[i].x;
            if(cells[i].y > box.maxY) box.maxY = cells[i].y;
        }

        return box;
    }

    // Empty cells between two bounding boxes (0 when they touch or overlap).
    function boxGap(a, b)
    {
        var gx = Math.max(a.minX - b.maxX, b.minX - a.maxX) - 1;
        var gy = Math.max(a.minY - b.maxY, b.minY - a.maxY) - 1;

        return Math.max(gx, gy, 0);
    }

    function toCellArray(cellsOrX, maybeY)
    {
        if(Array.isArray(cellsOrX) && maybeY === undefined)
        {
            return cellsOrX;
        }

        // two parallel arrays / typed arrays
        var xs = cellsOrX, ys = maybeY;
        var out = new Array(xs.length);

        for(var i = 0; i < xs.length; i++)
        {
            out[i] = { x: xs[i], y: ys[i] };
        }

        return out;
    }

    // The 8 symmetries of the square (rotations + reflections),
    // applied to already-translated (min x = min y = 0) points.
    var SYMMETRIES = [
        function(p) { return { x:  p.x, y:  p.y }; },
        function(p) { return { x: -p.y, y:  p.x }; },
        function(p) { return { x: -p.x, y: -p.y }; },
        function(p) { return { x:  p.y, y: -p.x }; },
        function(p) { return { x: -p.x, y:  p.y }; },
        function(p) { return { x:  p.x, y: -p.y }; },
        function(p) { return { x:  p.y, y:  p.x }; },
        function(p) { return { x: -p.y, y: -p.x }; }
    ];

    // Canonical key for a component: translate to min x = min y = 0,
    // try all 8 rotations/reflections (each re-translated to the
    // origin), take the lexicographically smallest sorted coordinate
    // string. Two components with the same shape (in any orientation
    // or translation) always produce the same key.
    function canonicalKey(comp)
    {
        var minX = Infinity, minY = Infinity;
        var i;

        for(i = 0; i < comp.length; i++)
        {
            if(comp[i].x < minX) minX = comp[i].x;
            if(comp[i].y < minY) minY = comp[i].y;
        }

        var norm = comp.map(function(c) { return { x: c.x - minX, y: c.y - minY }; });

        var best = null;

        for(var s = 0; s < SYMMETRIES.length; s++)
        {
            var pts = norm.map(SYMMETRIES[s]);

            var mnX = Infinity, mnY = Infinity;

            for(i = 0; i < pts.length; i++)
            {
                if(pts[i].x < mnX) mnX = pts[i].x;
                if(pts[i].y < mnY) mnY = pts[i].y;
            }

            var placed = pts.map(function(p) { return { x: p.x - mnX, y: p.y - mnY }; });

            placed.sort(function(a, b) { return a.x - b.x || a.y - b.y; });

            var str = placed.map(function(p) { return p.x + "," + p.y; }).join(";");

            if(best === null || str < best)
            {
                best = str;
            }
        }

        return best;
    }

    // Build every distinct phase of a pattern starting from one seed, by
    // stepping the reference implementation forward. Stops when a phase's
    // canonical key repeats one already seen (oscillators/spaceships), or
    // after maxPeriod steps. A phase is only recorded when the pattern is
    // one loose group, or two loose groups within PAIR_GAP of each other;
    // a phase that spreads further apart is skipped and left unnamed.
    // Returns [{ key, size, pieces }].
    function buildPhases(seedCells, maxPeriod)
    {
        var phases = [];
        var seen = new Set();
        var cells = seedCells;

        for(var i = 0; i < maxPeriod; i++)
        {
            var groups = looseComponents(cells);
            var usable = groups.length === 1 ||
                (groups.length === 2 && boxGap(boundingBox(groups[0]), boundingBox(groups[1])) <= PAIR_GAP);

            if(usable)
            {
                var k = canonicalKey(cells);

                if(seen.has(k))
                {
                    break;
                }

                seen.add(k);
                phases.push({ key: k, size: cells.length, pieces: groups.length });
            }

            cells = stepCells(cells);
        }

        return phases;
    }

    // Seeds are easier to check by eye as rows of "O" (live) and "."
    // (dead), so larger objects are written that way.
    function cellsFromRows(rows)
    {
        var cells = [];

        rows.forEach(function(row, y)
        {
            for(var x = 0; x < row.length; x++)
            {
                if(row[x] === "O")
                {
                    cells.push({ x: x, y: y });
                }
            }
        });

        return cells;
    }

    // ---- Library of known objects -----------------------------------
    //
    // Each entry names an object and gives ONE seed instance. Every
    // other phase (oscillators) and every step of motion (spaceships)
    // is derived automatically by buildPhases, and every rotation /
    // reflection is covered automatically by canonicalKey -- so a
    // seed only needs to be correct in one orientation and one phase.

    var LIBRARY_SEEDS = [
        // still lifes (period 1)
        { name: "block", period: 1, cells: [
            { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }
        ] },
        { name: "tub", period: 1, cells: [
            { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }
        ] },
        { name: "boat", period: 1, cells: [
            { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }
        ] },
        { name: "ship", period: 1, cells: [
            { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }
        ] },
        { name: "beehive", period: 1, cells: [
            { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 3, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }
        ] },
        { name: "loaf", period: 1, cells: [
            { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 3, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }
        ] },
        { name: "pond", period: 1, cells: [
            { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 3, y: 1 }, { x: 0, y: 2 }, { x: 3, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 3 }
        ] },
        { name: "barge", period: 1, cells: [
            { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }
        ] },

        // oscillators
        { name: "blinker", period: 4, cells: [
            { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }
        ] },
        { name: "toad", period: 4, cells: [
            { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
            { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }
        ] },
        { name: "beacon", period: 4, cells: [
            { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 },
            { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }
        ] },
        // period 15; in two phases it is two halves six cells apart, which
        // the pair rule in census() joins back together
        { name: "pentadecathlon", period: 30, cells: cellsFromRows([
            "..O....O..",
            "OO.OOOO.OO",
            "..O....O.."
        ]) },
        // period 3; its four arms never touch, so it is only one object
        // thanks to loose grouping
        { name: "pulsar", period: 6, cells: cellsFromRows([
            "..OOO...OOO..",
            ".............",
            "O....O.O....O",
            "O....O.O....O",
            "O....O.O....O",
            "..OOO...OOO..",
            ".............",
            "..OOO...OOO..",
            "O....O.O....O",
            "O....O.O....O",
            "O....O.O....O",
            ".............",
            "..OOO...OOO.."
        ]) },

        { name: "clock", period: 4, cells: cellsFromRows([
            "..O.",
            "O.O.",
            ".O.O",
            ".O.."
        ]) },

        // spaceships
        { name: "glider", period: 8, cells: [
            { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }
        ] },
        { name: "lightweight spaceship", period: 8, cells: cellsFromRows([
            ".O..O",
            "O....",
            "O...O",
            "OOOO."
        ]) }

    ];

    var LIBRARY = new Map(); // canonicalKey -> name
    var LIBRARY_BUILD_LOG = [];
    var LIBRARY_MAX_CELLS = 0; // no group larger than this can be a known object

    LIBRARY_SEEDS.forEach(function(entry)
    {
        var phases = buildPhases(entry.cells, entry.period);

        LIBRARY_BUILD_LOG.push({ name: entry.name, phaseCount: phases.length });

        phases.forEach(function(phase)
        {
            LIBRARY.set(phase.key, entry.name);

            if(phase.size > LIBRARY_MAX_CELLS)
            {
                LIBRARY_MAX_CELLS = phase.size;
            }
        });
    });

    // The library name for a group of cells, or undefined.
    function lookupName(group)
    {
        if(group.length > LIBRARY_MAX_CELLS)
        {
            return undefined;
        }

        return LIBRARY.get(canonicalKey(group));
    }

    // Order in which named objects should be listed: the five the lab
    // teaches first (in this order), then everything else alphabetically.
    var PRIORITY_NAMES = ["block", "beehive", "loaf", "blinker", "glider"];

    function nameSortKey(name)
    {
        var idx = PRIORITY_NAMES.indexOf(name);

        return idx === -1 ? [1, name] : [0, idx];
    }

    function compareNames(a, b)
    {
        var ka = nameSortKey(a), kb = nameSortKey(b);

        if(ka[0] !== kb[0]) return ka[0] - kb[0];

        if(ka[0] === 0) return ka[1] - kb[1];

        return a < b ? -1 : (a > b ? 1 : 0);
    }

    // ---- Census --------------------------------------------------------

    function census(cellsOrX, maybeY, generation)
    {
        // allow census(cells, generation) or census(xs, ys, generation)
        var cells, gen;

        if(Array.isArray(cellsOrX))
        {
            cells = cellsOrX;
            gen = maybeY;
        }
        else
        {
            cells = toCellArray(cellsOrX, maybeY);
            gen = generation;
        }

        var speciesCounts = new Map(); // name -> count
        var otherCounts = new Map();   // cell count -> count
        var unidentifiedCells = 0;
        var namedCells = 0;
        var i, j, name;

        function countNamed(name, size)
        {
            speciesCounts.set(name, (speciesCounts.get(name) || 0) + 1);
            namedCells += size;
        }

        function countOther(size)
        {
            otherCounts.set(size, (otherCounts.get(size) || 0) + 1);
            unidentifiedCells += size;
        }

        // A group that is not a known object at this reach: regroup it
        // more tightly, name what falls out, and repeat down to the
        // pieces that actually touch.
        function classifyPieces(group, reach)
        {
            while(reach > 1)
            {
                reach--;

                var pieces = groupCells(group, reach);

                if(pieces.length > 1)
                {
                    for(var p = 0; p < pieces.length; p++)
                    {
                        var pieceName = lookupName(pieces[p]);

                        if(pieceName)
                        {
                            countNamed(pieceName, pieces[p].length);
                        }
                        else
                        {
                            classifyPieces(pieces[p], reach);
                        }
                    }

                    return;
                }
            }

            countOther(group.length);
        }

        // pass 1: loose groups that are a known object as a whole
        var groups = groupCells(cells, LIBRARY_REACH);
        var unnamed = [];

        for(i = 0; i < groups.length; i++)
        {
            name = lookupName(groups[i]);

            if(name)
            {
                countNamed(name, groups[i].length);
            }
            else
            {
                unnamed.push(groups[i]);
            }
        }

        // pass 2: two close unnamed groups that are a known object together
        var boxes = unnamed.map(boundingBox);
        var taken = unnamed.map(function() { return false; });

        for(i = 0; i < unnamed.length; i++)
        {
            for(j = i + 1; j < unnamed.length && !taken[i]; j++)
            {
                if(taken[j] || unnamed[i].length + unnamed[j].length > LIBRARY_MAX_CELLS ||
                    boxGap(boxes[i], boxes[j]) > PAIR_GAP)
                {
                    continue;
                }

                name = lookupName(unnamed[i].concat(unnamed[j]));

                if(name)
                {
                    countNamed(name, unnamed[i].length + unnamed[j].length);
                    taken[i] = taken[j] = true;
                }
            }
        }

        // pass 3: everything else, regrouped more tightly
        for(i = 0; i < unnamed.length; i++)
        {
            if(!taken[i])
            {
                classifyPieces(unnamed[i], LIBRARY_REACH);
            }
        }

        var species = Array.from(speciesCounts.entries())
            .map(function(e) { return { name: e[0], count: e[1] }; })
            .sort(function(a, b) { return compareNames(a.name, b.name); });

        var other = Array.from(otherCounts.entries())
            .map(function(e) { return { cells: e[0], count: e[1] }; })
            .sort(function(a, b) { return a.cells - b.cells; });

        return {
            generation: gen,
            population: cells.length,
            species: species,
            other: other,
            named_cells: namedCells,
            unidentified_cells: unidentifiedCells
        };
    }

    // A compact signature of a census, used by "run until settled" to
    // detect when the field has stopped changing object-by-object. It
    // deliberately leaves out the population: a named oscillator such as
    // a pulsar (48, 56 or 72 cells depending on phase) is the same object
    // in every phase, and every real change shows up in the named counts
    // or the "other" buckets anyway. (On an infinite field a settled
    // census can still contain gliders that keep flying -- their count
    // is stable even though their coordinates are not.)
    function signature(c)
    {
        var parts = [];

        c.species.forEach(function(s) { parts.push(s.name + ":" + s.count); });
        c.other.forEach(function(o) { parts.push("other" + o.cells + ":" + o.count); });

        return parts.join("|");
    }

    // ---- "Run until settled" support -------------------------------------
    //
    // history is the list of signatures taken at a fixed interval (every
    // 10 generations in main.js). The field counts as settled when the
    // last `window` entries each equal the entry `cycle` places earlier,
    // for some cycle from 1 to maxCycle. Cycle 1 means the counts have
    // not changed at all. A longer cycle means an oscillator the library
    // does not know is flipping between phases in step with the checks
    // (a period-3 object seen every 10 generations repeats every 3
    // checks). Returns the cycle length, or 0 if not settled.
    function settledCycle(history, window, maxCycle)
    {
        for(var cycle = 1; cycle <= maxCycle; cycle++)
        {
            if(history.length < window + cycle)
            {
                return 0;
            }

            var repeats = true;

            for(var i = history.length - window; i < history.length; i++)
            {
                if(history[i] !== history[i - cycle])
                {
                    repeats = false;
                    break;
                }
            }

            if(repeats)
            {
                return cycle;
            }
        }

        return 0;
    }

    // How many trailing entries of history repeat with some cycle of at
    // most maxCycle: the "stable for N checks" figure shown while running.
    function stableRun(history, maxCycle)
    {
        var best = 0;

        for(var cycle = 1; cycle <= maxCycle; cycle++)
        {
            var run = 0;

            for(var i = history.length - 1; i - cycle >= 0 && history[i] === history[i - cycle]; i--)
            {
                run++;
            }

            if(run > best)
            {
                best = run;
            }
        }

        return best;
    }

    return {
        connectedComponents: connectedComponents,
        looseComponents: looseComponents,
        groupCells: groupCells,
        libraryReach: LIBRARY_REACH,
        pairGap: PAIR_GAP,
        canonicalKey: canonicalKey,
        cellsFromRows: cellsFromRows,
        stepCells: stepCells,
        buildPhases: buildPhases,
        census: census,
        signature: signature,
        settledCycle: settledCycle,
        stableRun: stableRun,
        library: LIBRARY,
        libraryBuildLog: LIBRARY_BUILD_LOG
    };
});
