// Network stats: measurement + metric math for the Stats page.
//
// Nothing in this file touches the page. The metric functions are pure
// (same input -> same output, no side effects) so they can be unit tested
// in tests/metrics.test.html and reused later, e.g. when results are saved.

// ---------- Settings ----------

export const SAMPLE_COUNT = 11;       // requests sent per region
export const WARMUP_SAMPLES = 1;      // leading samples thrown away (DNS + TCP/TLS setup)
export const TIMEOUT_MS = 5000;       // a request slower than this counts as failed
export const FIBER_KM_PER_MS = 200;   // light in fiber travels ~200 km per ms (same as backend.py)
export const MIN_DISTANCE_KM = 50;    // below this the overhead factor is meaningless

const EARTH_RADIUS_KM = 6371;
const USER_LOCATION_URL = "http://ip-api.com/json/?fields=status,lat,lon,city,country";

// ---------- Pure metric functions ----------

// Median of a list of numbers. Sorts a copy (never the caller's array).
// Odd length: the middle value. Even length: average of the two middle values.
// Returns null for an empty list.
export function median(samples) {
    if (samples.length === 0) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Jitter: how much latency changes from one request to the next.
// Mean of |s[i] - s[i-1]| over consecutive samples, in the order they were taken.
// Needs at least 2 samples (one difference), otherwise returns null.
export function jitter(samples) {
    if (samples.length < 2) return null;
    let total = 0;
    for (let i = 1; i < samples.length; i++) {
        total += Math.abs(samples[i] - samples[i - 1]);
    }
    return total / (samples.length - 1);
}

// Great-circle distance in km between two lat/lon points (haversine formula).
export function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Fastest physically possible round trip over fiber for a straight-line distance:
// there and back (2 x distance) at ~200 km/ms, i.e. distance_km / 100.
export function theoreticalMinRttMs(distanceKm) {
    return (2 * distanceKm) / FIBER_KM_PER_MS;
}

// Overhead factor: how many times slower the measured round trip is than
// the physical minimum. 1.0x would be a perfect straight fiber with zero delay.
// Returns null when it can't be meaningfully computed: no median, unknown
// distance, or a server so close (< 50 km) that the minimum is ~0.
export function overheadFactor(medianMs, distanceKm) {
    if (medianMs == null || distanceKm == null || distanceKm < MIN_DISTANCE_KM) return null;
    return medianMs / theoreticalMinRttMs(distanceKm);
}

// Baseline: the region with the lowest median among those that answered.
// Its latency approximates the user's own connection overhead.
// Takes [{ id, medianMs }] and returns the winning id, or null if none answered.
export function pickBaseline(results) {
    let best = null;
    for (const r of results) {
        if (r.medianMs == null) continue;
        if (best === null || r.medianMs < best.medianMs) best = r;
    }
    return best ? best.id : null;
}

// Turns the raw measurement for one region into display-ready numbers.
// userLoc may be null (location lookup failed) -> distance/overhead are null.
export function summarizeRegion(region, measurement, userLoc) {
    const { samples, failed } = measurement;
    const medianMs = median(samples);
    const distanceKm = userLoc
        ? haversineKm(userLoc.lat, userLoc.lon, region.lat, region.lon)
        : null;
    const usableDistance = distanceKm != null && distanceKm >= MIN_DISTANCE_KM;

    return {
        id: region.id,
        name: region.name,
        samples,
        failed,
        total: samples.length + failed,
        unreachable: samples.length === 0,
        medianMs,
        jitterMs: jitter(samples),
        distanceKm,
        minRttMs: usableDistance ? theoreticalMinRttMs(distanceKm) : null,
        overhead: overheadFactor(medianMs, distanceKm),
    };
}

// ---------- Measurement (browser I/O) ----------

let requestCounter = 0;

// Times one HTTP round trip with performance.now().
// The clock stops when the response headers arrive, so body size doesn't count.
// Returns the time in ms, or null for a failed sample (timeout, network/CORS
// error, or a non-2xx status in normal CORS mode).
export async function timeOneRequest(url, { noCors = false } = {}) {
    // Unique query param + no-store so no cache layer can answer for the server.
    const target = new URL(url);
    requestCounter += 1;
    target.searchParams.set("_sb", `${Date.now()}-${requestCounter}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const start = performance.now();
        const response = await fetch(target, {
            cache: "no-store",
            mode: noCors ? "no-cors" : "cors",
            signal: controller.signal,
        });
        const elapsed = performance.now() - start;

        // Opaque no-cors responses always report status 0, so only check CORS ones.
        if (!noCors && !response.ok) return null;

        // Drain the (tiny) body outside the timed window so the connection can be reused.
        await response.arrayBuffer().catch(() => {});
        return elapsed;
    } catch {
        return null; // timeout (abort) or network/CORS error
    } finally {
        clearTimeout(timer);
    }
}

// Measures one region: SAMPLE_COUNT sequential requests (never parallel, so
// they don't compete with each other). The first WARMUP_SAMPLES are discarded
// whatever their outcome, because they include DNS lookup and connection setup.
// onSample(done, total) is called after each request, for progress display.
// Returns { samples: [ms, ...] in order taken, failed: count }.
export async function measureRegion(region, onSample = () => {}) {
    const samples = [];
    let failed = 0;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
        const ms = await timeOneRequest(region.url, { noCors: region.noCors });
        if (i >= WARMUP_SAMPLES) {
            if (ms === null) failed += 1;
            else samples.push(ms);
        }
        onSample(i + 1, SAMPLE_COUNT);
    }
    return { samples, failed };
}

// Approximate user location from their public IP (same ip-api.com service
// backend.py uses for servers). Returns { lat, lon, city, country } or null.
// Note: ip-api's free tier is HTTP only, so this fails if the site is served over HTTPS.
export async function getUserLocation() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(USER_LOCATION_URL, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (data.status !== "success") return null;
        return { lat: data.lat, lon: data.lon, city: data.city, country: data.country };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}
