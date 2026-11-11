// js/reset.js
// "Forgot password" page (web_src/reset.html).

import { auth, friendlyError, showMessage, setLoading } from "./firebase.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const message = document.getElementById("message");
const resetBtn = document.getElementById("reset-btn");

document.getElementById("reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    if (!email) return showMessage(message, "Please enter your email.");

    setLoading(resetBtn, true);
    try {
        await sendPasswordResetEmail(auth, email);
        // Same message whether or not the account exists, so this page can't reveal who signed up.
        showMessage(message, "If an account exists for that email, a reset link is on its way.", "success");
    } catch (error) {
        showMessage(message, friendlyError(error));
    } finally {
        setLoading(resetBtn, false);
    }
});
