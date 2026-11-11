// js/login.js
// Login page (web_src/login.html): email + password, or Google.

import { auth, getProfile, friendlyError, showMessage, setLoading } from "./firebase.js";
import {
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const message = document.getElementById("message");
const loginBtn = document.getElementById("login-btn");

// The one place that redirects a signed-in user (already signed in, password, or Google).
// Accounts with no users/{uid} doc yet (first Google sign-in) go pick a username.
onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
        window.location.href = (await getProfile(user.uid)) ? "/web_src/profile.html" : "/web_src/signup.html";
    } catch (error) {
        showMessage(message, friendlyError(error));
    }
});

document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    if (!email || !password) return showMessage(message, "Please enter your email and password.");

    setLoading(loginBtn, true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showMessage(message, friendlyError(error));
        setLoading(loginBtn, false);
    }
});

document.getElementById("google-btn").addEventListener("click", () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch((error) => showMessage(message, friendlyError(error)));
});
