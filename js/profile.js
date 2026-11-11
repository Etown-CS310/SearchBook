// js/profile.js
// Protected profile page (web_src/profile.html): route guard, username, verify-email banner.

import { auth, getProfile, friendlyError } from "./firebase.js";
import { onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const resendBtn = document.getElementById("resend-btn");

// Route guard: runs once Firebase knows who is signed in, and again on logout (so logging
// out from the nav on this page also redirects to login). Hiding the page is just for looks;
// the real protection is firestore.rules, which only let the owner read users/{uid}.
onAuthStateChanged(auth, async (user) => {
    if (!user) return (window.location.href = "/web_src/login.html");
    try {
        const profile = await getProfile(user.uid);
        if (!profile) return (window.location.href = "/web_src/signup.html"); // never picked a username

        document.getElementById("profile-username").textContent = profile.username;
        document.getElementById("verify-banner").hidden = user.emailVerified; // Google accounts are pre-verified
        document.getElementById("profile-page").hidden = false;
    } catch (error) {
        friendlyError(error); // logs it
    }
});

resendBtn.addEventListener("click", async () => {
    try {
        await sendEmailVerification(auth.currentUser);
        resendBtn.textContent = "Sent! Check your inbox.";
        resendBtn.disabled = true;
    } catch (error) {
        resendBtn.textContent = friendlyError(error);
    }
});
