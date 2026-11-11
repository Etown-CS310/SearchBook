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
