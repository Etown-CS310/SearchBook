// Inserts the shared nav bar into <div id="site-header"></div> and highlights the link for the current page.
// Paths are root-relative because pages live at different depths (index.html vs web_src/).
(function initHeader() {
    const placeholder = document.getElementById("site-header");
    if (!placeholder) return;

    placeholder.outerHTML = `
        <header class="site-header">
            <h1><a href="/index.html">SearchBook</a></h1>

            <nav id="header-btns">
                <a href="/web_src/profile.html" class="nav-btn">Profile</a>
                <a href="/web_src/stats.html" class="nav-btn">Statistics</a>
                <a href="/web_src/dictionary.html" class="nav-btn">Dictionary</a>
                <a href="/web_src/about.html" class="nav-btn">About</a>
                <a href="/web_src/login.html" class="nav-btn">Log In</a>
            </nav>
        </header>`;

    document.querySelectorAll("#header-btns .nav-btn").forEach((link) => {
        if (link.pathname === location.pathname) {
            link.setAttribute("aria-current", "page");
        }
    });
})();
