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
    "glider":  { seed: [{x:1,y:0},{x:2,y:1},{x:0,y:2},{x:1,y:2},{x:2,y:2}], period: 4 }
};

console.log("-- reference-implementation self-checks --");

Object.keys(LIBRARY_TEST_PATTERNS).forEach(function(name)
{
    var def = LIBRARY_TEST_PATTERNS[name];
    var cells = def.seed;

    for(var step = 1; step <= def.period; step++)
    {
        cells = Census.stepCells(cells);
    }

    if(name === "glider")
    {
        // gliders translate; a translated copy of the seed is expected
        var translatedBack = translate(cells, -1, -1);
        assert(cellsEqual(translatedBack, def.seed),
            "glider should return to its seed shape (translated) after period " + def.period);
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
        var comps = Census.connectedComponents(cells);

        // only check phases that are a single connected component --
        // a phase that legitimately splits (e.g. beacon, toad) is not
        // expected to be named, and is exercised separately below.
        if(comps.length === 1)
        {
            phasesChecked++;

            ORIENTATIONS.forEach(function(fn)
            {
                var oriented = orient(comps[0], fn);
                var result = Census.census(oriented, 0);

                assert(result.species.length === 1 && result.species[0].name === name,
                    name + " phase " + step + " in orientation should be recognized as '" + name +
                    "' (got: " + JSON.stringify(result.species) + ")");
            });
        }

        cells = Census.stepCells(cells);
    }

    assert(phasesChecked > 0, name + " should have at least one recognizable single-component phase");
});

// beacon: verify its 4-cell/4-cell whole phase is recognized, and its
// split phase correctly reports two "other, 3 cells" pieces (documented
// caveat: 8-connectivity genuinely disconnects this phase).
console.log("-- beacon caveat: whole phase named, split phase reported as other --");

(function()
{
    var beaconSplitSeed = [{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:3,y:2},{x:2,y:3},{x:3,y:3}];
    var whole = Census.stepCells(beaconSplitSeed);
    var wholeCensus = Census.census(whole, 0);

    assert(wholeCensus.species.length === 1 && wholeCensus.species[0].name === "beacon",
        "beacon's connected phase should be recognized as 'beacon'");

    var splitCensus = Census.census(beaconSplitSeed, 1);

    assert(splitCensus.species.length === 0,
        "beacon's split phase should not be named");
    assert(splitCensus.other.length === 1 && splitCensus.other[0].cells === 3 && splitCensus.other[0].count === 2,
        "beacon's split phase should report as other, 3 cells x 2 (got: " + JSON.stringify(splitCensus.other) + ")");
})();

// toad has the same caveat as beacon.
console.log("-- toad caveat: whole phase named, split phase reported as other --");

(function()
{
    var toad = [{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1}];
    var wholeCensus = Census.census(toad, 0);

    assert(wholeCensus.species.length === 1 && wholeCensus.species[0].name === "toad",
        "toad's connected phase should be recognized as 'toad'");

    var split = Census.stepCells(toad);
    var splitCensus = Census.census(split, 1);

    assert(splitCensus.species.length === 0, "toad's split phase should not be named");
    assert(splitCensus.other.length === 1 && splitCensus.other[0].cells === 3 && splitCensus.other[0].count === 2,
        "toad's split phase should report as other, 3 cells x 2 (got: " + JSON.stringify(splitCensus.other) + ")");
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
    var namedComponentCount = result.species.reduce(function(sum, s) { return sum + s.count; }, 0);
    var otherComponentCount = result.other.reduce(function(sum, o) { return sum + o.count; }, 0);

    assert(namedComponentCount + otherComponentCount === comps.length,
        "every component should be either named or counted in 'other'");

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
