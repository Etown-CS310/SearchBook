// Loads the shared nav bar (components/header.html) into <div id="site-header"></div>
// and highlights the link for the current page.
// Paths are root-relative because pages live at different depths (index.html vs web_src/).
const placeholder = document.getElementById("site-header");

fetch("/components/header.html")
    .then((response) => response.text())
    .then((html) => {
        placeholder.outerHTML = html;

        document.querySelectorAll("#header-btns .nav-btn").forEach((link) => {
            if (link.pathname === location.pathname) {
                link.setAttribute("aria-current", "page");
            }
        });
    })
    .catch((error) => console.error("Could not load header:", error));
