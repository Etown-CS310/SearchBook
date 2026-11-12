# SearchBook

SearchBook is a DNS Look up page where you are able to put in any domain you are
interested in and it will give you back information about where the domain server
is located, approximate distance it traveled within Fiber Optic cables, and the
time it takes to get there.
It basically makes the internet's physical infrastructure visible and 
understandable and serves as both a practical tool and an educational resource.

To be able to run this, you must have an API key to be able to run the chatbot
AI on the website. This chatbot users can use to further understand what DNS
features are, specifically for users who are not familiar with networking terms.

## External Requirements/Setup

In order to build this project you first have to install:

-   pip install -r Requirements.txt

This command should work for Windows. For MAC/Linux use:

-   python3 pip install -r Requirements.txt

There should also be an .env file that contains the API Key and Firebase login 
information to be able to run this locally.

## Running

After installing the required libraries, you would just need to run:

-   python backend.py

For MAC/Linux:

-   python3 backend.py

Then you would need to visit localhost:5000 to be able to view the website locally.

## Firebase setup

Accounts use Firebase Authentication and data is stored in Cloud Firestore
(project `searchbook-cs310`).

### .env

Copy `.env.example` to `.env` and fill in:

| Variable | Where it comes from |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI dashboard. The server won't start without it. |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Firebase console > Project settings > Service accounts > **Generate new private key**. Save the JSON in a `secrets/` folder in the project and put its path here, e.g. `secrets/searchbook-cs310-firebase-adminsdk-xxxx.json`. |

The service account key is a **secret** (full admin access to the project). `.gitignore`
blocks `secrets/` and Firebase key filenames; never commit it or post it in chat.
The web config in `js/firebase.js` is **not** secret, so it's in the repo; the security
rules in `firestore.rules` are what protect the data.

### Firebase console (one time, already done for searchbook-cs310)

1. **Authentication > Sign-in method:** enable Email/Password and Google.
2. **Firestore Database > Create database:** production mode, default database ID.
3. **Firestore Database > Rules:** paste in `firestore.rules` and click Publish
   (or use the CLI below).

Open the site at `http://localhost:5000`, not `127.0.0.1:5000`: Google sign-in only
works on domains listed under Authentication > Settings > Authorized domains.

### Database structure

Firestore stores **documents** inside **collections** (like rows in tables), but there is
no schema to create ahead of time: each collection appears the first time something
writes to it. An empty Firestore console is normal until someone signs up. The
field lists below are enforced by `firestore.rules` and the code that writes them.

| Collection | Document ID | Written by | Who can read |
| --- | --- | --- | --- |
| `users` | Firebase Auth uid | Browser at sign-up | Only that user |
| `usernames` | Username in lowercase | Browser at sign-up | Anyone |

#### `users/{uid}`: private profile

| Field | Type | Meaning |
| --- | --- | --- |
| `username` | string | Display name as typed (3-20 letters, numbers, underscores) |
| `usernameLower` | string | Lowercase copy, used to keep names unique regardless of case |
| `email` | string | The account's email (why this doc is private) |
| `pingsSent` | number | Starts at 0 (not updated yet) |
| `totalDistanceKm` | number | Starts at 0 (not updated yet) |
| `createdAt` | timestamp | Join date, set by Firestore's clock |

#### `usernames/{usernameLower}`: username reservations

| Field | Type | Meaning |
| --- | --- | --- |
| `uid` | string | The user who owns this name |

Firestore has no UNIQUE constraint, so a username is reserved by making it a document ID,
which can exist only once. Sign-up creates this doc and `users/{uid}` in one transaction,
and the rules block updates and deletes, so a name can't be stolen or freed.

### Firebase CLI (deploying rules)

`firebase.json` points the CLI at `firestore.rules`, and `.firebaserc` sets the project
to `searchbook-cs310`.

```bash
npm install -g firebase-tools              # once per computer
firebase login                             # sign in with a Google account on the project
firebase deploy --only firestore:rules     # publish firestore.rules
```

## API Documentation
 
SearchBook has three kinds of "endpoints":
 
1. **Flask routes** in `backend.py`, called by our own pages (`/chat` and `/lookup`).
2. **Firebase calls** made straight from the browser by `js/signup.js` and `js/login.js`.
   There is no Flask route for accounts: the Firebase SDK talks to Google's servers, so
   those "endpoints" are SDK function calls instead of URLs.
3. **Outside servers** that the Stats page (`js/netstats.js` and `js/regions.js`) queries
   or times from the visitor's browser.
Flask runs at `http://localhost:5000` and every Flask route returns JSON. Errors always
look like `{"error": "message"}`.
 
| Method and URL | Called from | Purpose |
| --- | --- | --- |
| Firebase SDK calls (no URL) | `js/signup.js` | Create an account and reserve a username |
| Firebase SDK calls (no URL) | `js/login.js` | Log in with email and password or Google |
| `POST /chat` | `js/chat.js` | Ask the Operator chatbot a question |
| `GET http://ip-api.com/json/` | `js/netstats.js` | Find the visitor's approximate location |
| `GET <regional test URL>` (5 servers) | `js/netstats.js`, `js/regions.js` | Time a round trip to each region |
| `GET /lookup` | `JavaScript.js` | Look up a domain (the main search) |
 
---
 
### `js/signup.js`: Create an account (Firebase)
 
**Purpose:** Creates a Firebase Authentication account, reserves a unique username, and
saves the user's profile. Nothing here is sent to Flask. `firestore.rules` is what
protects the database from a browser that skips this script.
 
**SDK calls it makes:**
 
| Call | Purpose |
| --- | --- |
| `createUserWithEmailAndPassword(auth, email, password)` | Create the account (this also signs the user in) |
| `signInWithPopup(auth, new GoogleAuthProvider())` | "Sign up with Google" button; Firebase creates the account on the first Google sign-in |
| `getDoc(users/{uid})` (through `getProfile` in `js/firebase.js`) | Check whether the signed-in account already has a profile |
| `runTransaction(db, ...)` | Write `usernames/{usernameLower}` and `users/{uid}` together, or neither |
| `updateProfile(user, { displayName })` | Save the username as the account's display name (a failure is logged, not fatal) |
| `sendEmailVerification(user)` | Send the verification email (a failure is logged, not fatal) |
| `deleteUser(user)` | Undo the new account if the username turns out to be taken |
 
**Required input (the sign-up form):**
 
| Field | Rule |
| --- | --- |
| `username` | 3-20 characters: letters, numbers and underscores only (`^[A-Za-z0-9_]{3,20}$`). `firestore.rules` checks the same pattern. |
| `email` | Required for a new account |
| `password` | At least 6 characters |
| `confirm-password` | Must match `password` |
 
If someone has already signed in with Google but has no profile yet, the page switches to
"finish sign-up" mode and only asks for a `username`.
 
**Example data written to Firestore on success:**
 
`users/{uid}` (private to that user)
 
```json
{
  "username": "JaneDoe",
  "usernameLower": "janedoe",
  "email": "jane@example.com",
  "pingsSent": 0,
  "totalDistanceKm": 0,
  "createdAt": "2026-11-11T14:30:00Z"
}
```
 
`usernames/janedoe` (this is what keeps usernames unique)
 
```json
{ "uid": "<the Firebase Auth uid of JaneDoe>" }
```
 
**Expected outcomes:** there is no JSON response. On success the browser is redirected to
`/web_src/profile.html`. On failure a message appears on the page:
 
| Situation | Message shown |
| --- | --- |
| Username does not match the pattern (checked before any request) | "Usernames are 3-20 characters: letters, numbers and underscores only." |
| A field is empty, password is too short, or passwords differ (checked before any request) | "Please fill in every field." / "Password must be at least 6 characters." / "Passwords do not match." |
| `auth/email-already-in-use` | "An account with this email already exists. Try logging in." |
| `auth/weak-password` | "Password must be at least 6 characters." |
| `auth/invalid-email` | "That email address doesn't look right." |
| `auth/too-many-requests` | "Too many attempts. Wait a few minutes and try again." |
| Username already reserved | "Username already taken." (the new account is deleted again) |
| Firestore `permission-denied` (the rules rejected the write) | The SDK's own message |
| Anything else (for example, the Google pop-up was closed) | The SDK's own message |
 
**HTTP status codes:** not applicable, because Flask is not involved. Firebase's servers
reply with their own HTTP statuses, and the SDK turns failures into the error codes above,
so the app works with those codes.
 
---
 
### `js/login.js`: Log in (Firebase)
 
**Purpose:** Signs an existing user in with email and password or with Google, then sends
them to the right page. Like sign-up, it talks to Firebase directly and not to Flask.
 
**SDK calls it makes:**
 
| Call | Purpose |
| --- | --- |
| `signInWithEmailAndPassword(auth, email, password)` | Log in with email and password |
| `signInWithPopup(auth, new GoogleAuthProvider())` | "Continue with Google" button |
| `onAuthStateChanged(auth, ...)` | Runs once someone is signed in (including already-signed-in visitors) and decides where to send them |
| `getDoc(users/{uid})` (through `getProfile`) | Check whether the account has a profile yet |
 
**Required input (the login form):**
 
| Field | Rule |
| --- | --- |
| `email` | Required |
| `password` | Required |
 
**Where the user is sent after signing in:**
 
| Account state | Redirect |
| --- | --- |
| Has a `users/{uid}` profile | `/web_src/profile.html` |
| No profile yet (first Google sign-in) | `/web_src/signup.html`, which shows "finish sign-up" mode |
 
**Example profile read** (the `users/{uid}` document that decides the redirect):
 
```json
{
  "username": "JaneDoe",
  "usernameLower": "janedoe",
  "email": "jane@example.com",
  "pingsSent": 0,
  "totalDistanceKm": 0,
  "createdAt": "2026-11-11T14:30:00Z"
}
```
 
**Expected outcomes:** there is no JSON response; success is the redirect above. On
failure a message appears on the page:
 
| Situation | Message shown |
| --- | --- |
| Email or password empty (checked before any request) | "Please enter your email and password." |
| `auth/invalid-credential` (wrong email or password) | "Incorrect email or password." |
| `auth/invalid-email` | "That email address doesn't look right." |
| `auth/too-many-requests` | "Too many attempts. Wait a few minutes and try again." |
| Anything else (for example, the Google pop-up was closed) | The SDK's own message |
 
**HTTP status codes:** not applicable (see `js/signup.js`).
 
---
 
### `js/chat.js`: `POST /chat`
 
**Purpose:** Sends the conversation to the Operator chatbot (OpenAI, with a system prompt
that keeps it on networking and SearchBook topics) and returns its reply.
 
**Request:** `Content-Type: application/json`
 
```json
{
  "messages": [
    { "role": "user", "content": "What is DNS?" }
  ]
}
```
 
| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `messages` | array of objects | Yes | Each object has a `role` (`"user"` or `"assistant"`) and a `content` string. Entries with any other role are ignored. |
 
The server keeps only the **last 10 messages**, cuts each `content` to **1000 characters**,
and requires the last kept message to be from the `user`. (The chat box itself limits
typing to 500 characters.) The server remembers nothing between requests: `js/chat.js`
keeps the conversation in the browser's memory and re-sends it each time, so it resets when
the page reloads.
 
**Example response, `200 OK`:**
 
```json
{
  "reply": "DNS is the internet's phonebook. It turns a name like example.com into the numeric address computers use to find each other."
}
```
 
**Status codes:**
 
| Code | When | Body |
| --- | --- | --- |
| `200` | The chatbot answered | `{"reply": "..."}` |
| `400` | `messages` is missing or empty, the last message isn't from the `user`, or the body isn't valid JSON | `{"error": "Send a message first."}` |
| `502` | The request to OpenAI failed | `{"error": "The operator is unavailable. Try again shortly."}` |
| `500` | Not handled yet: a `messages` value that isn't a list of objects (for example a plain string) isn't validated, so Flask returns its default error page | HTML, not JSON |
 
**Setup note:** needs `OPENAI_API_KEY` in `.env`; the server will not start without it.
 
---
 
### `js/netstats.js`: Network stats (Stats page)
 
**Purpose:** Measures round-trip time to each test region, then turns the raw timings into
the numbers shown on the Stats page (median, jitter, distance, and how much slower the
connection is than light in fiber could possibly be). It makes no Flask requests. The page
itself is drawn by `js/stats-page.js`.
 
#### Outside request: `GET http://ip-api.com/json/?fields=status,lat,lon,city,country`
 
Called by `getUserLocation()` to guess where the visitor is from their public IP, so the
distance to each region can be calculated.
 
- **Parameters:** none from the caller. The `fields` list in the URL is fixed.
- **Example response, `200 OK`** (illustrative values):
```json
{
  "status": "success",
  "country": "United States",
  "city": "Chicago",
  "lat": 41.8781,
  "lon": -87.6298
}
```
 
| Result | What the app does |
| --- | --- |
| `200` with `"status": "success"` | Returns `{ lat, lon, city, country }` |
| `200` with any other `status`, a network error, or no answer within 5 seconds | Returns `null`; distance and overhead columns show as unavailable |
| `429` (ip-api's free plan allows about 45 requests per minute per IP) | Treated like any other failure: returns `null` |
 
The free ip-api plan is **HTTP only**, so this request fails if the site is ever served
over HTTPS.
 
#### Functions this module exports
 
| Function | Returns | Notes |
| --- | --- | --- |
| `median(samples)` | number, or `null` for an empty list | Does not change the caller's array |
| `jitter(samples)` | number, or `null` | Average change between consecutive samples; needs 2 or more |
| `haversineKm(lat1, lon1, lat2, lon2)` | kilometers | Straight-line (great-circle) distance |
| `theoreticalMinRttMs(distanceKm)` | milliseconds | Fastest possible round trip over fiber (`distance / 100`) |
| `overheadFactor(medianMs, distanceKm)` | number, or `null` | Measured time divided by the physical minimum; `null` under 50 km |
| `pickBaseline(results)` | region `id`, or `null` | Region with the lowest median; takes `[{ id, medianMs }]` |
| `summarizeRegion(region, measurement, userLoc)` | object (below) | `userLoc` may be `null` |
| `timeOneRequest(url, { noCors })` | milliseconds, or `null` | `null` means the sample failed |
| `measureRegion(region, onSample)` | `{ samples, failed }` | Sends 11 requests one after another and discards the first (warm-up) |
| `getUserLocation()` | `{ lat, lon, city, country }`, or `null` | The outside request above |
 
Settings: `SAMPLE_COUNT = 11`, `WARMUP_SAMPLES = 1`, `TIMEOUT_MS = 5000`,
`FIBER_KM_PER_MS = 200`, `MIN_DISTANCE_KM = 50`.
 
**Example `summarizeRegion` result** (US Northeast, visitor in Chicago, 10 kept samples;
numbers rounded):
 
```json
{
  "id": "NE",
  "name": "US Northeast",
  "samples": [27.1, 28.4, 29.0, 27.8, 31.2, 28.0, 27.5, 28.9, 29.4, 28.2],
  "failed": 0,
  "total": 10,
  "unreachable": false,
  "medianMs": 28.3,
  "jitterMs": 1.48,
  "distanceKm": 913.41,
  "minRttMs": 9.13,
  "overhead": 3.1
}
```
 
**Status codes:** `timeOneRequest` counts a sample as good only if the response is `2xx`
(for CORS regions). A non-`2xx` status, a timeout after 5000 ms, or a network or CORS error
counts as a failed sample. A region with no good samples is marked `unreachable`.
 
---
 
### `js/regions.js`: Regional test servers
 
**Purpose:** Lists the five servers the Stats page times. It exports one array, `REGIONS`,
and sends no requests itself; `measureRegion()` in `js/netstats.js` does the timing.
 
| `id` | Region | Server location | CORS mode |
| --- | --- | --- | --- |
| `NE` | US Northeast | Google `us-east4`, Ashburn, VA | normal |
| `SE` | US Southeast | Google `us-east1`, Moncks Corner, SC | normal |
| `EU` | Europe | Google `europe-west3`, Frankfurt, DE | normal |
| `CN` | China | AWS `cn-north-1`, Beijing | `no-cors` |
| `BR` | Brazil | Google `southamerica-east1`, Osasco (Sao Paulo), BR | normal |
 
Each region entry has this shape:
 
```json
{
  "id": "NE",
  "name": "US Northeast",
  "url": "https://us-east4-5tkroniexa-uk.a.run.app/api/ping",
  "lat": 39.0438,
  "lon": -77.4874,
  "noCors": false
}
```
 
**Request sent to each region:** `GET <url>?_sb=<timestamp>-<counter>`. There is no request
body. The `_sb` value and `cache: "no-store"` make sure no cache answers instead of the
server. Each region is hit 11 times in a row, and each request is cancelled after 5 seconds.
 
**Response:** the body is ignored (the Google test servers return a tiny body naming the
region); only the time until the response headers arrive is recorded.
 
**Status codes:**
 
| Result | Counted as |
| --- | --- |
| `2xx` from `NE`, `SE`, `EU`, `BR` | A good sample (time in ms) |
| Non-`2xx` from those regions | A failed sample |
| Any reply from `CN` | A good sample. `CN` uses `no-cors`, so the status is hidden (always reported as `0`) and even an error page counts as a reply |
| Timeout (over 5000 ms), network error, or blocked by CORS | A failed sample |
 
Traffic into mainland China often crosses the Great Firewall, so slow or failed samples
for `CN` are expected. If a Google URL stops working, the current list is at
`https://global.gcping.com/api/endpoints`.
 
---
 
### Also in `backend.py`: `GET /lookup`
 
Not part of the five files above, but it is the main search endpoint, so it is documented
here. It is called by `JavaScript.js` on the home page.
 
**Purpose:** Looks up a domain: its IP address, where the server is, how long a ping took,
and roughly how far the signal traveled through fiber.
 
**Request:** `GET /lookup?domain=example.com`
 
| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `domain` | query string | Yes | A full URL is fine. The server lowercases it and removes the scheme, port, path and query, so `HTTPS://www.Example.com:8080/a/?q=1` becomes `www.example.com`. |
 
**Example response, `200 OK`** (illustrative values):
 
```json
{
  "domain": "example.com",
  "ip": "203.0.113.10",
  "city": "Ashburn",
  "region": "Virginia",
  "country": "United States",
  "isp": "Example Hosting Inc.",
  "lat": 39.0438,
  "lon": -77.4874,
  "ping_ms": 24.5,
  "fiber_km": 2450,
  "fiber_miles": 1521,
  "lookup_time_ms": 380
}
```
 
`fiber_km` is `round(ping_ms / 2 * 200)`: half the round trip, times 200 km per millisecond
(the speed of light in fiber). It is an upper-bound estimate because routers add delay.
`ping_ms`, `fiber_km` and `fiber_miles` are `null` when the server does not answer a ping
(many block them). `city`, `region`, `country`, `isp`, `lat` and `lon` are `null` if the
location lookup fails. `lookup_time_ms` is how long the whole request took on the server.
 
**Status codes:**
 
| Code | When | Body |
| --- | --- | --- |
| `200` | The domain resolved | The object above |
| `400` | `domain` is missing or empty | `{"error": "Please enter a domain."}` |
| `404` | The domain does not resolve in DNS | `{"error": "Couldn't find 'examp1e.com'. Check the spelling."}` |
 
`GET /` returns `index.html`. Flask is also set up to serve every other file in the project
folder as a static file (for example `/web_src/login.html` and `/js/chat.js`).

# Authors

Farnaz (Teddy) Bazyar - bazyarf@etown.edu
Ryder Paulus - paulusr@etown.edu
Chase Dornblaser - dornblaserc@etown.edu
