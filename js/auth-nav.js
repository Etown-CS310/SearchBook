// js/auth-nav.js
// Loaded by header.js on every page. Reuses the nav's "Log In" link: while someone is
// signed in it reads "Log Out (username)" and signs out when clicked.

import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const link = document.getElementById("nav-login");

onAuthStateChanged(auth, (user) => {
    // displayName is set to the username at sign-up; email covers a Google account
    // that hasn't picked one yet.
    link.textContent = user ? `Log Out (${user.displayName || user.email})` : "Log In";
});

// TODO (ping tracking): JavaScript.js is a plain script and can't import Firebase, so it will
// call this to get the signed-in user's ID token for /lookup. Plan:
//   await auth.authStateReady();   // wait for Firebase to restore the session on page load
//   return auth.currentUser ? auth.currentUser.getIdToken() : null;
// Stub: returns null, so /lookup can't tell who searched and credits no one. This does NOT
// affect signing in or out; it only matters for ping tracking.
window.getIdToken = async () => null;

link.addEventListener("click", (event) => {
    if (!auth.currentUser) return; // signed out: follow the link to the login page
    event.preventDefault();
    // No redirect: the profile page sends itself to login when it sees the sign-out.
    signOut(auth);
});
