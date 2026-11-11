// js/signup.js
// Sign-up page (web_src/signup.html). Two modes:
//   * Normal: username + email + password + confirm.
//   * Finish sign-up: already signed in to Firebase Auth (usually via Google) but no
//     users/{uid} doc yet. Google gives no username, so only that field is shown.

import { auth, db, getProfile, friendlyError, showMessage, setLoading } from "./firebase.js";
import { doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    updateProfile,
    sendEmailVerification,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const PROFILE_URL = "/web_src/profile.html";
const $ = (id) => document.getElementById(id);
const message = $("message");

// createUserWithEmailAndPassword signs the user in immediately, firing onAuthStateChanged
// before their profile exists. This flag makes the listener ignore that; the submit
// handler finishes and redirects on its own.
let creatingAccount = false;

onAuthStateChanged(auth, async (user) => {
    if (!user || creatingAccount) return;
    try {
        if (await getProfile(user.uid)) {
            window.location.href = PROFILE_URL;
        } else {
            // Finish mode: hide the email/password fields and the Google button.
            $("credential-fields").hidden = true;
            $("google-btn").hidden = true;
            $("signup-heading").textContent = "Choose a username to finish signing up";
        }
    } catch (error) {
        showMessage(message, friendlyError(error));
    }
});

// Reserve usernames/{usernameLower} AND create users/{uid} in ONE transaction, so there is
// never a profile without a reserved name or a name without a profile. Firestore has no
// UNIQUE constraint; a doc ID can only exist once, and the rules forbid overwriting it.
async function claimUsername(user, username) {
    const usernameLower = username.toLowerCase();
    const nameRef = doc(db, "usernames", usernameLower);

    await runTransaction(db, async (tx) => {
        // If someone else writes this doc between our read and commit, Firestore reruns
        // this function, and this time the read sees it.
        if ((await tx.get(nameRef)).exists()) throw new Error("Username already taken.");

        tx.set(nameRef, { uid: user.uid });
        tx.set(doc(db, "users", user.uid), {
            username,           // as typed, for display
            usernameLower,      // for case-insensitive uniqueness
            email: user.email,
            pingsSent: 0,       // counters start at 0; only Flask may change them (see firestore.rules)
            totalDistanceKm: 0,
            createdAt: serverTimestamp() // Firestore's clock, not the browser's (which could be wrong)
        });
    });
}

$("signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = $("signup-btn");
    const username = $("username").value.trim();

    // firestore.rules enforces the same pattern, so skipping this check in DevTools doesn't help.
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
        return showMessage(message, "Usernames are 3-20 characters: letters, numbers and underscores only.");
    }

    // Finish mode reuses the signed-in account; normal mode creates one.
    let user = auth.currentUser;
    const isNewAccount = !user;
    const email = $("email").value.trim();
    const password = $("password").value;

    if (isNewAccount) {
        const confirm = $("confirm-password").value;
        if (!email || !password || !confirm) return showMessage(message, "Please fill in every field.");
        if (password.length < 6) return showMessage(message, "Password must be at least 6 characters.");
        if (password !== confirm) return showMessage(message, "Passwords do not match.");
    }

    creatingAccount = true;
    setLoading(btn, true);
    try {
        if (isNewAccount) {
            ({ user } = await createUserWithEmailAndPassword(auth, email, password));
        }

        try {
            await claimUsername(user, username);
        } catch (claimError) {
            // Delete the Auth user we just created, or the email would stay "in use" by an
            // account with no profile. (In finish mode the account existed before; keep it
            // so they can try another name.)
            if (isNewAccount) await deleteUser(user).catch(console.error);
            throw claimError;
        }

        // displayName = username, so the nav bar can show it without reading Firestore.
        await updateProfile(user, { displayName: username }).catch(console.error);
        // Not fatal if it fails: the profile page has a "resend" button.
        if (isNewAccount) await sendEmailVerification(user).catch(console.error);

        window.location.href = PROFILE_URL;
    } catch (error) {
        creatingAccount = false;
        showMessage(message, friendlyError(error));
        setLoading(btn, false);
    }
});

// Firebase creates the account on the first Google sign-in; onAuthStateChanged above
// then switches to finish mode.
$("google-btn").addEventListener("click", () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch((error) => showMessage(message, friendlyError(error)));
});
