// Stats page UI: runs the regional network test and fills in the table.
// All measurement and math lives in netstats.js; this file only renders.

import { REGIONS } from "./regions.js";
import { measureRegion, summarizeRegion, pickBaseline, getUserLocation } from "./netstats.js";

const runBtn = document.getElementById("run-test");
const progressEl = document.getElementById("test-progress");
const locationEl = document.getElementById("user-location");
const measuredEl = document.getElementById("measured-at");
const tbody = document.getElementById("netstats-body");

const COLUMNS = ["Region", "Median", "Jitter", "Overhead", "Distance", "Status"];

const fmtMs = (ms) => `${ms.toFixed(1)} ms`;
const fmtKm = (km) => `${Math.round(km).toLocaleString()} km`;

// Table cell with a mobile label (shown as a card heading at phone width).
function cell(column, main, sub) {
    const td = document.createElement("td");
    td.dataset.label = column;
    const mainEl = document.createElement("span");
    mainEl.textContent = main;
    td.append(mainEl);
    if (sub) {
        const subEl = document.createElement("small");
        subEl.textContent = sub;
        td.append(subEl);
    }
    return td;
}

function setRow(row, cells) {
    row.replaceChildren(...cells.map(([main, sub], i) => cell(COLUMNS[i], main, sub)));
}

// Placeholder row shown before / while a region is tested.
function pendingRow(row, region, status) {
    row.className = "";
    setRow(row, [[region.name, region.id], ["—"], ["—"], ["—"], ["—"], [status]]);
}

// Row for a finished region. baseline is { id, medianMs } once all regions are done.
function resultRow(row, r, baseline) {
    const isBaseline = baseline && baseline.id === r.id;
    row.className = r.unreachable ? "is-unreachable" : isBaseline ? "is-baseline" : "";

    if (r.unreachable) {
        setRow(row, [
            [r.name, r.id], ["—"], ["—"], ["—"],
            [r.distanceKm != null ? fmtKm(r.distanceKm) : "n/a"],
            ["Unreachable", `${r.failed}/${r.total} failed`],
        ]);
        return;
    }

    const overBaseline = baseline && !isBaseline
        ? `+${(r.medianMs - baseline.medianMs).toFixed(1)} ms over baseline`
        : null;
    const failures = r.failed > 0 ? `${r.failed}/${r.total} failed` : null;

    setRow(row, [
        [r.name, r.id],
        [fmtMs(r.medianMs), overBaseline],
        [r.jitterMs != null ? fmtMs(r.jitterMs) : "n/a"],
        r.overhead != null
            ? [`${r.overhead.toFixed(1)}×`, `min ${fmtMs(r.minRttMs)}`]
            : ["n/a"],
        [r.distanceKm != null ? fmtKm(r.distanceKm) : "n/a"],
        [isBaseline ? "Baseline" : "OK", failures],
    ]);
}

// One row per region, created once.
const rows = new Map(REGIONS.map((region) => {
    const row = document.createElement("tr");
    pendingRow(row, region, "Not tested");
    tbody.append(row);
    return [region.id, row];
}));

async function runTest() {
    runBtn.disabled = true;
    measuredEl.textContent = "Measuring…";
    REGIONS.forEach((region) => pendingRow(rows.get(region.id), region, "Waiting"));

    try {
        progressEl.textContent = "Finding your location…";
        const userLoc = await getUserLocation();
        locationEl.textContent = userLoc
            ? `Your approximate location: ${userLoc.city}, ${userLoc.country} (from your IP)`
            : "Couldn't determine your location, so distance and overhead show n/a.";

        // Regions are tested one at a time so they don't compete for bandwidth.
        const results = [];
        for (const [index, region] of REGIONS.entries()) {
            const row = rows.get(region.id);
            const label = `Testing ${region.id}… ${index + 1}/${REGIONS.length}`;
            progressEl.textContent = label;

            const measurement = await measureRegion(region, (done, total) => {
                pendingRow(row, region, `Testing… ${done}/${total}`);
            });
            const summary = summarizeRegion(region, measurement, userLoc);
            results.push(summary);
            resultRow(row, summary, null); // show it now; baseline is added at the end
        }

        // Baseline needs every region's median, so highlight it once all are done.
        const baselineId = pickBaseline(results);
        const baseline = results.find((r) => r.id === baselineId) || null;
        results.forEach((r) => resultRow(rows.get(r.id), r, baseline));

        progressEl.textContent = baseline
            ? "Done."
            : "Done. No region answered; check the endpoints in js/regions.js.";
        measuredEl.textContent = `Measured ${new Date().toLocaleString()}`;
    } catch (err) {
        progressEl.textContent = "The test stopped unexpectedly. See the console for details.";
        measuredEl.textContent = "Not measured.";
        console.error(err);
    } finally {
        runBtn.disabled = false;
    }
}

runBtn.addEventListener("click", runTest);
