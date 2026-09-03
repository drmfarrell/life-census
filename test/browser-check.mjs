// Drives the student path in a headless Chromium over the DevTools protocol
// and prints PASS/FAIL per step. No npm dependencies: uses Node's built-in
// fetch and WebSocket (Node 22 or newer) and a python3 static server.
//
//   node test/browser-check.mjs
//   CHROME=/path/to/chrome node test/browser-check.mjs
//
// Screenshots go to $OUT (default: <tmpdir>/life-census-check).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME ||
    "/home/user/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";
const PORT = 8123;
const DEBUG_PORT = 9333;
const OUT = process.env.OUT || join(tmpdir(), "life-census-check");
mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
function check(name, ok, detail)
{
    if(!ok) failed++;
    console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail !== undefined ? "  -- " + detail : ""));
}

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
const chrome = spawn(CHROME, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--remote-debugging-port=" + DEBUG_PORT, "--window-size=1300,900", "about:blank"
], { stdio: "ignore" });

try
{
    let targets;
    for(let i = 0; i < 60; i++)
    {
        try
        {
            await fetch("http://127.0.0.1:" + PORT + "/index.html");
            targets = await (await fetch("http://127.0.0.1:" + DEBUG_PORT + "/json")).json();
            if(targets.length) break;
        }
        catch {}
        await sleep(250);
    }
    if(!targets) throw new Error("browser or server did not start");

    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0;
    const pending = {};
    ws.onmessage = e => { const m = JSON.parse(e.data); if(m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    // evaluate in the page; expressions may use $(id)
    const ev = async (expr, awaitPromise = false) =>
    {
        const r = await send("Runtime.evaluate", { expression: "var $ = id => document.getElementById(id);\n" + expr, returnByValue: true, awaitPromise });
        if(r.result?.exceptionDetails) throw new Error("page: " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
        return r.result?.result?.value;
    };
    const json = async expr => JSON.parse(await ev("JSON.stringify(" + expr + ")"));
    const shot = async name => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64")); };
    const display = id => ev("getComputedStyle($('" + id + "')).display");
    const randomize = () => ev("$('randomize_button').click(); $('randomize_width').value = 120; $('randomize_height').value = 120; $('randomize_density').value = 0.5; $('randomize_submit').click(); $('label_pop').textContent");

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.navigate", { url: "http://127.0.0.1:" + PORT + "/index.html" });
    await sleep(3000);

    // --- Randomize -> Census: panel docked right, field visible, focus in the panel
    const pop = await randomize();
    check("randomize fills the field", parseInt(pop.replace(/\D/g, "")) > 1000, "population " + pop);
    await ev("$('census_button').click()");
    const rect = await json("$('census_dialog').getBoundingClientRect()");
    check("census panel shown", await display("census_dialog") === "block");
    check("panel docked at the right edge", Math.round(rect.right) === 1300 && rect.width === 300 && rect.top === 45, JSON.stringify([rect.left, rect.top, rect.width, rect.height]));
    check("centered overlay stays hidden", await display("overlay") === "none");
    check("focus moves to the panel", await ev("document.activeElement.id") === "census_dialog");
    check("buttons sit above the table", (await json("[$('census_buttons').getBoundingClientRect().top, $('census_table').getBoundingClientRect().top]")).reduce((a, b) => a < b));

    // --- Run until settled: field advances every frame, then settles
    await ev("$('census_run_until_settled').click()");
    check("button reads Stop while running", await ev("$('census_run_until_settled').textContent") === "Stop");
    check("app's own Run button untouched", await ev("$('run_button').textContent") === "Run");
    const t0 = Date.now();
    const seen = [];
    let state;
    while(Date.now() - t0 < 90000)
    {
        await sleep(500);
        state = await json("({btn: $('census_run_until_settled').textContent, gen: $('label_gen').textContent, status: $('census_status').textContent, rows: $('census_table_body').rows.length})");
        seen.push(parseInt(state.gen.replace(/\D/g, "")));
        if(seen.length === 2) await shot("mid-run");
        if(state.btn !== "Stop") break;
    }
    check("field advances while running (hud generation grows)", seen.length > 1 && seen[1] > seen[0], seen.slice(0, 4).join(" -> "));
    check("run finishes within 90 s", state.btn === "Run until settled", ((Date.now() - t0) / 1000).toFixed(1) + " s, " + seen.length + " samples");
    check("status reports the settled generation", /^Settled at generation \d+/.test(state.status), state.status);
    check("table has rows", state.rows > 0, state.rows + " rows");
    await shot("settled");

    // --- Stop: a second click ends the run early
    await randomize();
    await ev("$('census_run_until_settled').click()");
    await sleep(400);
    await ev("$('census_run_until_settled').click()");
    await sleep(400);
    check("Stop ends the run early", /^Stopped at generation \d+/.test(await ev("$('census_status').textContent")), await ev("$('census_status').textContent"));

    // --- Save table: capture the download inside the page
    await ev("window.__dl = null; window.__blob = null; const _c = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { window.__blob = b; return _c(b); }; HTMLAnchorElement.prototype.click = function() { window.__dl = this.download; };");
    await ev("$('census_export').click()");
    const gen = await ev("$('label_gen').textContent.replace(/\\D/g, '')");
    const dl = await ev("window.__dl");
    const csv = await ev("window.__blob.text()", true);
    check("csv file name carries the generation", dl === "census-generation-" + gen + ".csv", dl);
    check("csv header rows carry the generation", csv.split("\r\n")[0] === "Game of Life census" && csv.split("\r\n")[1] === "Generation," + gen, csv.split("\r\n").slice(0, 3).join(" | "));
    check("csv has the Object,Count table", /\r\nObject,Count\r\n[a-z]+,\d+/.test(csv));
    check("status says where the file went", /^Saved census-generation-\d+\.csv/.test(await ev("$('census_status').textContent")));

    // --- Keyboard: Enter on a panel button must not toggle the app's Run; Escape closes
    await ev("var b = $('census_recount'); b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', which: 13, keyCode: 13, bubbles: true, cancelable: true}))");
    check("Enter on a panel button does not start the app's Run loop", await ev("$('run_button').textContent") === "Run");
    await ev("window.onkeydown({which: 27, target: document.body, ctrlKey: false, shiftKey: false, altKey: false})");
    check("Escape closes the panel", await display("census_dialog") === "none");

    // --- Patterns: the list loads from examples/list and a pattern opens
    await ev("$('pattern_button').click()");
    await sleep(1500);
    const n = await ev("$('pattern_list').children.length");
    check("pattern chooser opens", await display("pattern_chooser") === "block");
    check("pattern list has one entry per local .rle file", n === 13, n + " entries");
    check("no empty entry from the trailing newline", await ev("[...$('pattern_list').children].every(d => d.firstChild.textContent.trim() !== '')"));
    await ev("$('pattern_list').children[3].click()");
    await sleep(2500);
    check("clicking a pattern loads it (loading popup gone)", await display("loading_popup") === "none");
    check("loaded pattern has cells", parseInt((await ev("$('label_pop').textContent")).replace(/\D/g, "")) > 0, await ev("$('pattern_name').textContent"));
    await shot("pattern");

    // --- URL stays on this site: only the query changes, and Clear keeps the path
    const base = "http://127.0.0.1:" + PORT + "/index.html";
    check("loading a pattern only adds ?pattern= to the URL", await ev("location.href") === base + "?pattern=gunstar", await ev("location.href"));
    await ev("$('alert_close').click(); $('clear_button').click()");
    check("Clear keeps the page path (upstream rewrote it to /life/)", await ev("location.href") === base, await ev("location.href"));

    // --- pattern info links point at this site and resolve
    await ev("$('pattern_button').click()");
    await sleep(1000);
    await ev("$('pattern_list').children[3].click()");
    await sleep(2500);
    await ev("$('alert_close').click(); $('pattern_name').click()");
    check("pattern name opens the pattern info", await display("alert") === "block");
    const links = await json("({file: $('pattern_file_link').href, view: $('pattern_link').href, urls: [...$('pattern_urls').querySelectorAll('a')].map(a => a.href)})");
    check("pattern file link points at this site", links.file === "http://127.0.0.1:" + PORT + "/examples/gunstar.rle", links.file);
    check("pattern file link resolves", (await fetch(links.file)).status === 200);
    check("view-online link points at this site", links.view === base + "?pattern=gunstar", links.view);
    check("comment links get a scheme instead of becoming local paths", links.urls.length > 0 && links.urls.every(u => /^https?:\/\/(?!127\.0\.0\.1)/.test(u)), links.urls.join(" "));

    // --- a refresh with ?pattern= reloads that pattern
    await send("Page.navigate", { url: base + "?pattern=gunstar" });
    await sleep(3000);
    check("refresh with ?pattern= reloads the pattern", await ev("$('pattern_name').textContent") === "Gunstar", await ev("$('pattern_name').textContent"));

    ws.close();
}
catch(e)
{
    failed++;
    console.log("FAIL  " + e.message);
}
finally
{
    chrome.kill();
    server.kill();
}

console.log(failed ? failed + " check(s) failed. Screenshots: " + OUT : "All checks passed. Screenshots: " + OUT);
process.exit(failed ? 1 : 0);
