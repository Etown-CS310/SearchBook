// js/leaderboard.js
// Leaderboard on the main page (index.html). Asks Flask for the standings (GET /leaderboard)
// and draws them. A plain script, like JavaScript.js: it never talks to Firebase itself.
// JavaScript.js calls window.refreshLeaderboard() after each successful search, so a
// signed-in user sees their new ping count right away.

(function initLeaderboard() {
    const status = document.getElementById("lb-status");
    const table = document.querySelector(".lb-table");
    const body = document.getElementById("lb-body");
    const totals = document.getElementById("lb-totals");
    const sortButtons = document.querySelectorAll("[data-sort]");
    if (!status || !table || !body || !totals) return;

    const KM_TO_MILES = 0.621; // same factor backend.py uses for fiber_miles
    const fmt = (n) => Math.round(n).toLocaleString();
    const distanceText = (km) => `${fmt(km)} km (${fmt(km * KM_TO_MILES)} mi)`;

    let sort = "pings"; // "pings" or "distance"
    let latestRequest = 0; // so a slow, older response can't overwrite a newer one

    function showMessage(text) {
        table.hidden = true;
        totals.hidden = true;
        status.hidden = false;
        status.textContent = text;
    }

    function addCell(row, text, className) {
        const td = document.createElement("td");
        td.textContent = text; // textContent, not innerHTML, so a username can't inject HTML
        if (className) td.className = className;
        row.appendChild(td);
    }

    function render(data) {
        if (data.entries.length === 0) {
            return showMessage("No calls on record yet. Log in and run a search to be the first.");
        }

        body.replaceChildren();
        for (const entry of data.entries) {
            const row = document.createElement("tr");
            addCell(row, entry.rank, "lb-rank");
            addCell(row, entry.username, "lb-user");
            addCell(row, fmt(entry.pingsSent), "lb-num");
            addCell(row, distanceText(entry.totalDistanceKm), "lb-num");
            body.appendChild(row);
        }

        const t = data.totals;
        totals.textContent = `All ${t.users} ${t.users === 1 ? "user" : "users"} combined: `
            + `${fmt(t.pingsSent)} pings sent, ${distanceText(t.totalDistanceKm)} traveled.`;

        status.hidden = true;
        table.hidden = false;
        totals.hidden = false;
    }

    async function load() {
        const thisRequest = ++latestRequest;
        try {
            const response = await fetch("/leaderboard?sort=" + sort);
            const data = await response.json();
            if (thisRequest !== latestRequest) return; // a newer request is already running
            if (!response.ok) throw new Error(data.error || "Couldn't load the leaderboard.");
            render(data);
        } catch (err) {
            if (thisRequest !== latestRequest) return;
            showMessage(err.message === "Failed to fetch"
                ? "Couldn't reach the server. Is the Python server running?"
                : err.message);
        }
    }

    sortButtons.forEach((button) => {
        button.addEventListener("click", () => {
            sort = button.dataset.sort;
            sortButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
            load();
        });
    });

    window.refreshLeaderboard = load;
    load();
})();