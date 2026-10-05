const form = document.getElementById("search-form");
const results = document.getElementById("results");
const outputBox = document.querySelector(".output-box");
const mapEl = document.getElementById("map");

let map = null;

function hideMap() {
    if (map) {
        map.remove();
        map = null;
    }
    mapEl.hidden = true;
}

function showMap(lat, lon, label) {
    lat = Number(lat);
    lon = Number(lon);
    console.log(lat);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;

    hideMap();
    mapEl.hidden = false; // must be visible before Leaflet measures it

    map = L.map(mapEl).setView([lat, lon], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18
    }).addTo(map);

    const popup = document.createElement("div");
    popup.textContent = label || "Server location";
    L.marker([lat, lon]).addTo(map).bindPopup(popup).openPopup();

    setTimeout(() => map && map.invalidateSize(), 0);
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const domain = document.getElementById("domain").value;
    outputBox.classList.remove("is-error");
    outputBox.classList.add("is-loading");
    hideMap();
    results.textContent = "Searching...";

    try {
        const response = await fetch("/lookup?domain=" + encodeURIComponent(domain));
        const data = await response.json();

        if (data.error) {
            outputBox.classList.add("is-error");
            results.textContent = data.error;
            return;
        }

        results.textContent =
`Domain:        ${data.domain}
IP address:    ${data.ip}
Location:      ${data.city}, ${data.region}, ${data.country}
Coordinates:   ${data.lat}, ${data.lon}
Provider:      ${data.isp}
Ping (round trip): ${data.ping_ms ?? "No reply (server may block pings)"} ms
Fiber distance (one way, approx): ${data.fiber_km ?? "n/a"} km / ${data.fiber_miles ?? "n/a"} mi
Total lookup time: ${data.lookup_time_ms} ms`;

        showMap(data.lat, data.lon, data.domain);
    } catch (err) {
        outputBox.classList.add("is-error");
        results.textContent = "Something went wrong. Is the Python server running?";
    } finally {
        outputBox.classList.remove("is-loading");
    }

    
});



// Region preset buttons: fill the search box and run the normal search
document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.getElementById("domain").value = btn.dataset.domain;
        form.requestSubmit();
    });
});