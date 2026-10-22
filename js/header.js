// Loads the shared nav bar (components/header.html) into <div id="site-header"></div>
// and highlights the link for the current page.
const placeholder = document.getElementById("site-header");

fetch("components/header.html")
    .then((response) => response.text())
    .then((html) => {
        placeholder.outerHTML = html;

        const currentPage = location.pathname.split("/").pop() || "index.html";
        document.querySelectorAll("#header-btns .nav-btn").forEach((link) => {
            if (link.getAttribute("href") === currentPage) {
                link.setAttribute("aria-current", "page");
            }
        });
    })
    .catch((error) => console.error("Could not load header:", error));
