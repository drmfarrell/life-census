/*
 * test/census.test.js
 *
 * Run with: node test/census.test.js
 * No framework -- prints PASS/FAIL per assertion and exits non-zero on
 * any failure.
 */
"use strict";

var path = require("path");
var Census = require(path.join(__dirname, "..", "census.js"));

var failures = 0;
var passed = 0;

function assert(condition, message)
{
    if(condition)
    {
        passed++;
    }
    else
    {
        failures++;
        console.error("FAIL: " + message);
    }
}

function cellsEqual(a, b)
{
    var sa = new Set(a.map(function(c) { return c.x + "," + c.y; }));
    var sb = new Set(b.map(function(c) { return c.x + "," + c.y; }));

    if(sa.size !== sb.size)
    {
        return false;
    }

    for(var k of sa)
    {
        if(!sb.has(k))
        {
            return false;
        }
    }

    return true;
}

function translate(cells, dx, dy)
{
    return cells.map(function(c) { return { x: c.x + dx, y: c.y + dy }; });
}

// The 8 rotations/reflections of the square, applied directly to raw
// coordinates (not translation-normalized) -- used to check that every
// orientation of a shape is still recognized.
var ORIENTATIONS = [
    function(p) { return { x:  p.x, y:  p.y }; },
    function(p) { return { x: -p.y, y:  p.x }; },
    function(p) { return { x: -p.x, y: -p.y }; },
    function(p) { return { x:  p.y, y: -p.x }; },
    function(p) { return { x: -p.x, y:  p.y }; },
    function(p) { return { x:  p.x, y: -p.y }; },
    function(p) { return { x:  p.y, y:  p.x }; },
    function(p) { return { x: -p.y, y: -p.x }; }
];

function orient(cells, fn)
{
    return cells.map(fn);
}

// ---- 1. library objects recognized in every phase, every orientation ----

var LIBRARY_TEST_PATTERNS = {
    "block":   { seed: [{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}], period: 1 },
    "tub":     { seed: [{x:1,y:0},{x:0,y:1},{x:2,y:1},{x:1,y:2}], period: 1 },
    "boat":    { seed: [{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:2,y:1},{x:1,y:2}], period: 1 },
    "ship":    { seed: [{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:2,y:1},{x:1,y:2},{x:2,y:2}], period: 1 },
    "beehive": { seed: [{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:3,y:1},{x:1,y:2},{x:2,y:2}], period: 1 },
    "loaf":    { seed: [{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:3,y:1},{x:1,y:2},{x:3,y:2},{x:2,y:3}], period: 1 },
    "pond":    { seed: [{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:3,y:1},{x:0,y:2},{x:3,y:2},{x:1,y:3},{x:2,y:3}], period: 1 },
    "barge":   { seed: [{x:1,y:0},{x:0,y:1},{x:2,y:1},{x:1,y:2},{x:3,y:2},{x:2,y:3}], period: 1 },
    "blinker": { seed: [{x:0,y:1},{x:1,y:1},{x:2,y:1}], period: 2 },
    "toad":    { seed: [{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1}], period: 2 },
    "beacon":  { seed: [{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:3,y:2},{x:2,y:3},{x:3,y:3}], period: 2 },
    "clock":   { seed: Census.cellsFromRows(["..O.", "O.O.", ".O.O", ".O.."]), period: 2 },
    "pulsar":  { seed: Census.cellsFromRows([
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
    ]), period: 3 },
    "pentadecathlon": { seed: Census.cellsFromRows(["..O....O..", "OO.OOOO.OO", "..O....O.."]), period: 15 },
    // spaceships: after one period the seed reappears shifted by `shift`
    "glider":  { seed: [{x:1,y:0},{x:2,y:1},{x:0,y:2},{x:1,y:2},{x:2,y:2}], period: 4, shift: {x: 1, y: 1} },
    "lightweight spaceship": { seed: Census.cellsFromRows([".O..O", "O....", "O...O", "OOOO."]), period: 4, shift: {x: -2, y: 0} }
};

var BLOCK = LIBRARY_TEST_PATTERNS.block.seed;
var BEEHIVE = LIBRARY_TEST_PATTERNS.beehive.seed;
var BLINKER = LIBRARY_TEST_PATTERNS.blinker.seed;
var PULSAR = LIBRARY_TEST_PATTERNS.pulsar.seed;
var PENTADECATHLON = LIBRARY_TEST_PATTERNS.pentadecathlon.seed;

function countsByName(result)
{
    var byName = {};
    result.species.forEach(function(s) { byName[s.name] = s.count; });
    return byName;
}

console.log("-- reference-implementation self-checks --");

Object.keys(LIBRARY_TEST_PATTERNS).forEach(function(name)
{
    var def = LIBRARY_TEST_PATTERNS[name];
    var cells = def.seed;

    for(var step = 1; step <= def.period; step++)
    {
        cells = Census.stepCells(cells);
    }

    if(def.shift)
    {
        // spaceships translate; a shifted copy of the seed is expected
        var translatedBack = translate(cells, -def.shift.x, -def.shift.y);
        assert(cellsEqual(translatedBack, def.seed),
            name + " should return to its seed shape (shifted) after period " + def.period);
    }
    else
    {
        assert(cellsEqual(cells, def.seed),
            name + " should return to its seed exactly after period " + def.period);
    }
});

console.log("-- library recognizes every phase in every orientation --");

Object.keys(LIBRARY_TEST_PATTERNS).forEach(function(name)
{
    var def = LIBRARY_TEST_PATTERNS[name];
    var cells = def.seed;
    var phasesChecked = 0;

    for(var step = 0; step < def.period; step++)
    {
        // every phase of a library object must be one loose group, or
        // two close ones (the pentadecathlon's halves), so it is named
        // as one object even where its pieces do not touch
        var groups = Census.looseComponents(cells);

        assert(groups.length <= 2, name + " phase " + step + " should be at most two loose groups (got " + groups.length + ")");

        if(groups.length <= 2)
        {
            phasesChecked++;

            ORIENTATIONS.forEach(function(fn)
            {
                var oriented = orient(cells, fn);
                var result = Census.census(oriented, 0);

                assert(result.species.length === 1 && result.species[0].name === name && result.species[0].count === 1,
                    name + " phase " + step + " in orientation should be recognized as one '" + name +
                    "' (got: " + JSON.stringify(result.species) + ")");
                assert(result.unidentified_cells === 0 && result.named_cells === oriented.length,
                    name + " phase " + step + ": every cell should belong to the named object");
            });
        }

        cells = Census.stepCells(cells);
    }

    assert(phasesChecked === def.period, name + ": all " + def.period + " phases should be named (" + phasesChecked + " were)");
});

// ---- loose grouping: split phases are one object; unknown groups fall back to pieces ----

console.log("-- beacon and toad are one object in their split phase too --");

(function()
{
    var beaconSplit = [{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:3,y:2},{x:2,y:3},{x:3,y:3}];
    var r = Census.census(beaconSplit, 0);

    assert(r.species.length === 1 && r.species[0].name === "beacon" && r.species[0].count === 1,
        "beacon's split phase should count as one beacon (got: " + JSON.stringify(r.species) + ")");
    assert(r.other.length === 0 && r.unidentified_cells === 0, "beacon's split phase should leave nothing under 'other'");

    var toadSplit = Census.stepCells(LIBRARY_TEST_PATTERNS.toad.seed);
    r = Census.census(toadSplit, 1);

    assert(r.species.length === 1 && r.species[0].name === "toad" && r.species[0].count === 1,
        "toad's split phase should count as one toad (got: " + JSON.stringify(r.species) + ")");
    assert(r.other.length === 0, "toad's split phase should leave nothing under 'other'");
})();

console.log("-- unknown loose groups fall back to the pieces that touch --");

(function()
{
    // bi-block: two blocks with a one-cell gap are within loose reach
    var r = Census.census(BLOCK.concat(translate(BLOCK, 3, 0)), 0);

    assert(countsByName(r).block === 2, "two blocks one cell apart should count as 2 blocks (got: " + JSON.stringify(r.species) + ")");
    assert(r.other.length === 0, "two blocks one cell apart should leave nothing under 'other'");

    // block beside a beehive with a one-cell gap
    r = Census.census(BLOCK.concat(translate(BEEHIVE, 3, 0)), 0);

    assert(countsByName(r).block === 1 && countsByName(r).beehive === 1 && r.other.length === 0,
        "a block one cell from a beehive should count as 1 block + 1 beehive (got: " + JSON.stringify(r) + ")");

    // two L-triominoes far apart are not a beacon: still other, 3 cells x 2
    var tri = [{x:0,y:0},{x:1,y:0},{x:0,y:1}];
    r = Census.census(tri.concat(translate(tri, 10, 10)), 0);

    assert(r.species.length === 0 && r.other.length === 1 && r.other[0].cells === 3 && r.other[0].count === 2,
        "two separate 3-cell pieces should stay other, 3 cells x 2 (got: " + JSON.stringify(r) + ")");

    // a pulsar with a block one cell away is not a known object as a whole:
    // the block is still named via the fallback and every cell is accounted for
    r = Census.census(PULSAR.concat(translate(BLOCK, 14, 0)), 0);

    assert(countsByName(r).block === 1, "a block crowding a pulsar should still be named (got: " + JSON.stringify(r.species) + ")");
    assert(r.named_cells + r.unidentified_cells === r.population, "crowded pulsar: every cell should be named or under 'other'");
})();

console.log("-- pulsar is one object in every phase and does not inflate other counts --");

(function()
{
    var cells = PULSAR;
    var field;

    for(var phase = 0; phase < 3; phase++)
    {
        var r = Census.census(cells, phase);
        var byName = countsByName(r);

        assert(byName.pulsar === 1 && r.species.length === 1,
            "pulsar phase " + phase + " should count as exactly one pulsar (got: " + JSON.stringify(r.species) + ")");
        assert(r.unidentified_cells === 0, "pulsar phase " + phase + " should leave nothing under 'other'");

        // pulsar plus two real blinkers: the blinker count stays 2 in every phase
        field = cells.concat(translate(BLINKER, 30, 0), translate(BLINKER, 30, 10));
        byName = countsByName(Census.census(field, phase));

        assert(byName.blinker === 2 && byName.pulsar === 1,
            "pulsar phase " + phase + " with two blinkers: expected blinker 2, pulsar 1 (got: " + JSON.stringify(byName) + ")");

        cells = Census.stepCells(cells);
        field = Census.stepCells(field);
    }
})();

console.log("-- pentadecathlon: one object even when its halves are six cells apart --");

(function()
{
    var cells = PENTADECATHLON;
    var splitPhases = 0;

    for(var phase = 0; phase < 15; phase++)
    {
        var groups = Census.looseComponents(cells);

        if(groups.length === 2)
        {
            splitPhases++;

            // a lone half is not named
            var half = Census.census(groups[0], 0);
            assert(half.species.length === 0 && half.unidentified_cells === groups[0].length,
                "half a pentadecathlon (phase " + phase + ") should not be named (got: " + JSON.stringify(half.species) + ")");

            // a block beyond the grouping reach but inside the pair gap
            // does not stop the halves from being joined
            var r = Census.census(cells.concat(translate(BLOCK, -7, 0)), 0);
            var byName = countsByName(r);
            assert(byName.pentadecathlon === 1 && byName.block === 1 && r.unidentified_cells === 0,
                "pentadecathlon phase " + phase + " with a block 5 cells away: expected pentadecathlon 1, block 1 (got: " + JSON.stringify(r) + ")");
        }

        cells = Census.stepCells(cells);
    }

    assert(splitPhases === 2, "the pentadecathlon should have exactly two split phases (got " + splitPhases + ")");
})();

// ---- settled detection: unchanged counts, short cycles, still changing ----

console.log("-- settledCycle and stableRun --");

(function()
{
    var W = 20, MAXC = 6, i;

    var same = [];
    for(i = 0; i < 25; i++) same.push("A");

    assert(Census.settledCycle(same, W, MAXC) === 1, "unchanged counts should settle with cycle 1");
    assert(Census.settledCycle(same.slice(0, 20), W, MAXC) === 0, "settling needs window + 1 checks");
    assert(Census.settledCycle(same.slice(0, 21), W, MAXC) === 1, "settles at exactly window + 1 checks");
    assert(Census.stableRun(same, MAXC) === 24, "stableRun of 25 identical checks should be 24");

    var p3 = [];
    for(i = 0; i < 30; i++) p3.push("ABC"[i % 3]);

    assert(Census.settledCycle(p3, W, MAXC) === 3, "a 3-check cycle should settle with cycle 3");
    assert(Census.settledCycle(p3, W, 2) === 0, "a 3-check cycle is not settled when maxCycle is 2");
    assert(Census.stableRun(p3, MAXC) === 27, "stableRun of a 3-check cycle over 30 checks should be 27");

    var changing = [];
    for(i = 0; i < 40; i++) changing.push("s" + i);

    assert(Census.settledCycle(changing, W, MAXC) === 0, "ever-changing counts should not settle");
    assert(Census.stableRun(changing, MAXC) === 0, "ever-changing counts should have stableRun 0");

    var settling = changing.concat(["Z", "Z", "Z", "Z", "Z", "Z"]);
    assert(Census.stableRun(settling, MAXC) === 5, "six identical trailing checks should give stableRun 5");

    // real run: a pulsar and a beacon, census every 10 generations for 300
    // generations -- both are named in every phase, so the counts never change
    var field = PULSAR.concat(translate(LIBRARY_TEST_PATTERNS.beacon.seed, 30, 0));
    var history = [];

    for(var g = 1; g <= 300; g++)
    {
        field = Census.stepCells(field);

        if(g % 10 === 0)
        {
            history.push(Census.signature(Census.census(field, g)));
        }
    }

    assert(Census.settledCycle(history, W, MAXC) === 1, "pulsar + beacon should settle with cycle 1 (got " + Census.settledCycle(history, W, MAXC) + ")");

    // a pentadecathlon (period 15, named in every phase) also settles with cycle 1
    field = translate(PENTADECATHLON, 100, 100);
    history = [];

    for(g = 1; g <= 400; g++)
    {
        field = Census.stepCells(field);

        if(g % 10 === 0)
        {
            history.push(Census.signature(Census.census(field, g)));
        }
    }

    assert(Census.settledCycle(history, W, MAXC) === 1, "a pentadecathlon should settle with cycle 1 (got " + Census.settledCycle(history, W, MAXC) + ")");

    // an oscillator the library does not know: the figure eight (period 8)
    // seen every 10 generations cycles through 4 distinct phases
    var figureEight = Census.cellsFromRows(["OOO...", "OOO...", "OOO...", "...OOO", "...OOO", "...OOO"]);
    field = figureEight;

    for(g = 1; g <= 8; g++)
    {
        field = Census.stepCells(field);
    }

    assert(cellsEqual(field, figureEight), "figure eight should return to its seed after 8 generations");
    assert(Census.census(figureEight, 0).species.length === 0, "figure eight should not be in the library");

    history = [];

    for(g = 1; g <= 400; g++)
    {
        field = Census.stepCells(field);

        if(g % 10 === 0)
        {
            history.push(Census.signature(Census.census(field, g)));
        }
    }

    var cycle = Census.settledCycle(history, W, MAXC);
    assert(cycle === 4, "a figure eight should settle with a 4-check cycle (got " + cycle + ")");
    assert(Census.settledCycle(history, W, 3) === 0, "a figure eight never settles when the cycle may be at most 3 checks");
})();

// ---- 2. mixed field: 3 blocks + 2 blinkers (each phase) + 1 glider + 1 beehive ----

console.log("-- mixed field census --");

(function()
{
    var block1 = translate([{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}], 0, 0);
    var block2 = translate(block1, 20, 0);
    var block3 = translate(block1, 40, 0);

    var blinkerHorizontal = [{x:0,y:1},{x:1,y:1},{x:2,y:1}];
    var blinkerVertical = Census.stepCells(blinkerHorizontal);
    var blinkerA = translate(blinkerHorizontal, 0, 20);
    var blinkerB = translate(blinkerVertical, 20, 20);

    var glider = translate([{x:1,y:0},{x:2,y:1},{x:0,y:2},{x:1,y:2},{x:2,y:2}], 0, 40);
    var beehive = translate([{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:3,y:1},{x:1,y:2},{x:2,y:2}], 20, 40);

    var field = [].concat(block1, block2, block3, blinkerA, blinkerB, glider, beehive);
    var result = Census.census(field, 123);

    var byName = {};
    result.species.forEach(function(s) { byName[s.name] = s.count; });

    assert(result.generation === 123, "generation should be passed through");
    assert(byName.block === 3, "should count 3 blocks (got " + byName.block + ")");
    assert(byName.blinker === 2, "should count 2 blinkers (got " + byName.blinker + ")");
    assert(byName.glider === 1, "should count 1 glider (got " + byName.glider + ")");
    assert(byName.beehive === 1, "should count 1 beehive (got " + byName.beehive + ")");
    assert(result.unidentified_cells === 0, "no unidentified cells expected in this field");
    assert(result.population === field.length, "population should equal total live cells");

    var namedCells = result.species.reduce(function(sum, s)
    {
        var sizeOf = { block: 4, blinker: 3, glider: 5, beehive: 6 };
        return sum + sizeOf[s.name] * s.count;
    }, 0);

    assert(namedCells + result.unidentified_cells === result.population,
        "sum over counted objects' cells + unidentified cells should equal population");
})();

// ---- 3. random 200x200 field at 35% density, evolved 500 steps: no cell lost or double-counted ----

console.log("-- random field cell-conservation check --");

(function()
{
    var W = 200, H = 200, density = 0.35;
    var cells = [];
    var seedRandom = mulberry32(42);

    for(var y = 0; y < H; y++)
    {
        for(var x = 0; x < W; x++)
        {
            if(seedRandom() < density)
            {
                cells.push({ x: x, y: y });
            }
        }
    }

    for(var step = 0; step < 500; step++)
    {
        cells = Census.stepCells(cells);

        if(cells.length === 0)
        {
            break;
        }
    }

    var result = Census.census(cells, 500);

    // Recompute directly from components to check conservation precisely.
    var comps = Census.connectedComponents(cells);
    var totalFromComponents = comps.reduce(function(sum, c) { return sum + c.length; }, 0);

    assert(totalFromComponents === cells.length,
        "sum of component sizes should equal total live cells");

    var otherCells = result.other.reduce(function(sum, o) { return sum + o.cells * o.count; }, 0);

    assert(result.named_cells + result.unidentified_cells === result.population,
        "every cell should be in a named object or under 'other' (" +
        result.named_cells + " + " + result.unidentified_cells + " vs " + result.population + ")");

    assert(result.unidentified_cells === otherCells,
        "unidentified_cells should equal the sum of other-group cells (" +
        result.unidentified_cells + " vs " + otherCells + ")");

    assert(result.population === cells.length, "population should equal live cell count after 500 steps");
})();

function mulberry32(seed)
{
    return function()
    {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---- summary ----

console.log("");
console.log(passed + " assertions passed, " + failures + " failed.");

if(failures > 0)
{
    process.exit(1);
}
