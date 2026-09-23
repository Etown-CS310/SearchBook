const form = document.getElementById("search-form");
const results = document.getElementById("results");

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const domain = document.getElementById("domain").value;
    results.textContent = "Searching...";

    try {
        const response = await fetch("/lookup?domain=" + encodeURIComponent(domain));
        const data = await response.json();

        if (data.error) {
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
    } catch (err) {
        results.textContent = "Something went wrong. Is the Python server running?";
    }
});