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
writes to it. An empty Firestore console is normal until someone signs up or looks up a
domain. The field lists below are enforced by `firestore.rules` and the code that writes
them.

| Collection | Document ID | Written by | Who can read |
| --- | --- | --- | --- |
| `users` | Firebase Auth uid | Browser at sign-up, then Flask | Only that user |
| `usernames` | Username in lowercase | Browser at sign-up | Anyone |
| `domains` | Domain without `www.` | Flask, on every lookup | Anyone |
| `leaderboard` | Firebase Auth uid | Flask, on a signed-in lookup | Anyone |

#### `users/{uid}`: private profile

| Field | Type | Meaning |
| --- | --- | --- |
| `username` | string | Display name as typed (3-20 letters, numbers, underscores) |
| `usernameLower` | string | Lowercase copy, used to keep names unique regardless of case |
| `email` | string | The account's email (why this doc is private) |
| `pingsSent` | number | Lookups this user has made while signed in |
| `totalDistanceKm` | number | Total estimated fiber distance of those lookups |
| `createdAt` | timestamp | Join date, set by Firestore's clock |

#### `usernames/{usernameLower}`: username reservations

| Field | Type | Meaning |
| --- | --- | --- |
| `uid` | string | The user who owns this name |

Firestore has no UNIQUE constraint, so a username is reserved by making it a document ID,
which can exist only once. Sign-up creates this doc and `users/{uid}` in one transaction,
and the rules block updates and deletes, so a name can't be stolen or freed.

#### `domains/{domain}`: per-site stats

Every lookup counts, signed in or not. `www.example.com` and `example.com` share one doc.

| Field | Type | Meaning |
| --- | --- | --- |
| `domainUrl` | string | The domain (same as the doc ID) |
| `ipAddress` | string | IP the domain resolved to on the latest lookup |
| `city`, `region`, `country` | string | Server location from the IP lookup |
| `latitude`, `longitude` | number | Server coordinates |
| `isp` | string | Hosting provider / network |
| `totalPings` | number | Times anyone has looked this domain up |
| `firstPingedAt` | timestamp | First lookup ever (set once) |
| `lastPingedAt` | timestamp | Most recent lookup |

#### `leaderboard/{uid}`: public top-users table

| Field | Type | Meaning |
| --- | --- | --- |
| `username` | string | Display name |
| `totalDistanceKm` | number | Same total as in `users/{uid}` |

This is a public copy of the two fields the top-users table needs, because `users/{uid}`
holds the email and stays private.

#### How a lookup is recorded

`record_ping()` in `backend.py` saves each lookup in **one transaction**, so the totals
always change together:

1. `domains/{domain}`: refresh the location fields, add 1 to `totalPings`, and set
   `firstPingedAt` if the domain is new.
2. If the user is signed in and has a username: add 1 to `pingsSent` and the fiber
   distance to `totalDistanceKm` in `users/{uid}`, then copy the new total into
   `leaderboard/{uid}`. A lookup with no reply still counts, but adds 0 km.

Browsers can never write `domains`, `leaderboard`, or the counters in `users`. Flask uses
the Admin SDK, which skips the security rules, so stats can't be faked from DevTools.

### Firebase CLI (deploying rules)

`firebase.json` points the CLI at `firestore.rules`, and `.firebaserc` sets the project
to `searchbook-cs310`.

```bash
npm install -g firebase-tools              # once per computer
firebase login                             # sign in with a Google account on the project
firebase deploy --only firestore:rules     # publish firestore.rules
```

# Authors

Farnaz (Teddy) Bazyar - bazyarf@etown.edu
Ryder Paulus - paulusr@etown.edu
Chase Dornblaser - dornblaserc@etown.edu
