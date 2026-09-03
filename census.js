/*
 * census.js
 *
 * Census fork of copy.sh/life -- groups a field's live cells into
 * 8-connected components and names any component that matches a known
 * Game of Life object (still life, oscillator phase, or spaceship phase).
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

    var NEIGHBOR_OFFSETS = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1]
    ];

    // Group live cells into 8-connected (king-move) components.
    // Accepts either an array of {x,y} or two parallel arrays.
    function connectedComponents(cellsOrX, maybeY)
    {
        var cells = toCellArray(cellsOrX, maybeY);

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

                for(var j = 0; j < NEIGHBOR_OFFSETS.length; j++)
                {
                    var nx = cur.x + NEIGHBOR_OFFSETS[j][0];
                    var ny = cur.y + NEIGHBOR_OFFSETS[j][1];
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

    // Build every distinct connected-single-component phase of a
    // pattern starting from one seed, by stepping the reference
    // implementation forward. Stops when a phase's canonical key
    // repeats one already seen (oscillators/spaceships), or after
    // maxPeriod steps. Phases where the pattern is not a single
    // 8-connected component are skipped (e.g. beacon's split phase) --
    // they are deliberately left unnamed and fall through to "other".
    function buildPhases(seedCells, maxPeriod)
    {
        var phases = [];
        var seen = new Set();
        var cells = seedCells;

        for(var i = 0; i < maxPeriod; i++)
        {
            var comps = connectedComponents(cells);

            if(comps.length === 1)
            {
                var k = canonicalKey(comps[0]);

                if(seen.has(k))
                {
                    break;
                }

                seen.add(k);
                phases.push(k);
            }

            cells = stepCells(cells);
        }

        return phases;
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

        // spaceships
        { name: "glider", period: 8, cells: [
            { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }
        ] }

        // NOTE: a lightweight spaceship (LWSS) entry was attempted and
        // dropped. Every seed tried either collapsed under evolution or
        // came out as two disconnected 8-connected pieces (never a
        // stable, steadily-translating single component), so it did not
        // clear this file's own verification rule ("never guess a
        // name"). A correctly-sourced LWSS seed can be added later --
        // see the build log / verification pattern above for block and
        // glider as the template.
    ];

    // name -> canonical key -> already known to exist (for docs/debug)
    var LIBRARY = new Map(); // canonicalKey -> name
    var LIBRARY_BUILD_LOG = [];

    LIBRARY_SEEDS.forEach(function(entry)
    {
        var phases = buildPhases(entry.cells, entry.period);

        LIBRARY_BUILD_LOG.push({ name: entry.name, phaseCount: phases.length });

        phases.forEach(function(k)
        {
            LIBRARY.set(k, entry.name);
        });
    });

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

        var components = connectedComponents(cells);

        var speciesCounts = new Map(); // name -> count
        var otherCounts = new Map();   // cell count -> count
        var unidentifiedCells = 0;

        for(var i = 0; i < components.length; i++)
        {
            var comp = components[i];
            var k = canonicalKey(comp);
            var name = LIBRARY.get(k);

            if(name)
            {
                speciesCounts.set(name, (speciesCounts.get(name) || 0) + 1);
            }
            else
            {
                otherCounts.set(comp.length, (otherCounts.get(comp.length) || 0) + 1);
                unidentifiedCells += comp.length;
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
            unidentified_cells: unidentifiedCells
        };
    }

    // A compact signature of a census, used by "run until settled" to
    // detect when the field has stopped changing shape-by-shape (note:
    // on an infinite field a settled census can still contain gliders
    // that keep flying -- their count and phase distribution is stable
    // even though their coordinates are not).
    function signature(c)
    {
        var parts = [];

        c.species.forEach(function(s) { parts.push(s.name + ":" + s.count); });
        c.other.forEach(function(o) { parts.push("other" + o.cells + ":" + o.count); });
        parts.push("pop:" + c.population);

        return parts.join("|");
    }

    return {
        connectedComponents: connectedComponents,
        canonicalKey: canonicalKey,
        stepCells: stepCells,
        buildPhases: buildPhases,
        census: census,
        signature: signature,
        library: LIBRARY,
        libraryBuildLog: LIBRARY_BUILD_LOG
    };
});
