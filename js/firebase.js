// js/firebase.js
// Starts Firebase ONCE and exports what the other scripts need, so no page calls
// initializeApp() itself (doing it twice throws an error).
//
// The SDK comes from Google's CDN, like the class demo. Browsers can't resolve npm-style
// imports ("firebase/app") without a bundler, and this site is plain files served by Flask.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// TODO(RYDER): FILLED IN already (searchbook-cs310). Re-paste from Project settings > General >
//              Your apps > Web app > SDK setup and configuration > Config if it ever changes.
//
// These values are NOT secret: the apiKey only says which project to talk to, and every
// visitor's browser gets it anyway. Firebase Auth + firestore.rules protect the data.
// (The service account key used by Flask IS a secret; see backend.py.)
const firebaseConfig = {
    apiKey: "AIzaSyBiQ8y-gQRTUl6rc3Awcq8ZVzBKqJsboBU",
    authDomain: "searchbook-cs310.firebaseapp.com",
    projectId: "searchbook-cs310",
    storageBucket: "searchbook-cs310.firebasestorage.app",
    messagingSenderId: "527456799215",
    appId: "1:527456799215:web:57c4580e875680bf234e1a",
    measurementId: "G-7NEPFF4VFJ"
};

// Fail loudly if the config is ever reset to placeholders, instead of a vague network error later.
if (Object.values(firebaseConfig).some((v) => v.includes("YOUR_"))) {
    console.error("Firebase config not filled in: see TODO(RYDER) in js/firebase.js");
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// users/{uid} data, or null if this account hasn't picked a username yet
// (e.g. a first Google sign-in). Used to decide where to send a signed-in user.
export async function getProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
}

// Firebase error codes -> messages a user can understand. Unknown codes fall back to the
// error's own message (e.g. "Username already taken." from signup.js).
export function friendlyError(error) {
    const messages = {
        "auth/email-already-in-use": "An account with this email already exists. Try logging in.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/invalid-email": "That email address doesn't look right.",
        "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again."
    };
    console.error(error);
    return messages[error.code] || error.message;
}

// Show text in a page's message element; type ("error" / "success" / "info") becomes a CSS class.
export function showMessage(element, text, type = "error") {
    element.textContent = text;
    element.className = `message ${type}`;
    element.hidden = false;
}

// Disable a button while waiting on Firebase so it can't be double-submitted.
export function setLoading(button, isLoading, loadingText = "Please wait...") {
    if (isLoading) button.dataset.label = button.textContent;
    button.textContent = isLoading ? loadingText : button.dataset.label;
    button.disabled = isLoading;
}
