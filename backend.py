"""
YOU MUST DO BELOW STEPS TO RUN THIS APP, THEN RUN THE CODE!!!
 
Setup:  pip install -r Requirements.txt
Run:    python backend.py
Open:   http://127.0.0.1:5000
"""
import os
import re
import socket
import time

import requests
from flask import Flask, jsonify, request, send_from_directory
from ping3 import ping
from openai import OpenAI
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import auth, credentials, firestore

load_dotenv()

app = Flask(__name__, static_folder=".", static_url_path="")

# ---- Firebase Admin SDK ----------------------------------------------------
# Flask, not the browser, writes ping counters. The Admin SDK bypasses
# firestore.rules, which is why the rules can deny those writes to every client.
#
# The service account key IS a secret (full admin access to the project), unlike
# the web apiKey in js/firebase.js. It stays out of Git (see .gitignore).
# Get one from Firebase console > Project settings > Service accounts > Generate new
# private key, and set its path as FIREBASE_SERVICE_ACCOUNT_PATH in .env (see .env.example).
#
# If it's missing, log why and keep db = None: lookups still work, pings just aren't saved.
db = None
key_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
if not key_path or not os.path.isfile(key_path):
    app.logger.error("Firebase Admin not configured: FIREBASE_SERVICE_ACCOUNT_PATH in .env "
                     "is missing or wrong (see .env.example). Pings won't be saved.")
else:
    try:
        firebase_admin.initialize_app(credentials.Certificate(key_path))
        db = firestore.client()
    except Exception:
        app.logger.exception("Firebase Admin failed to start; pings won't be saved.")

FIBER_KM_PER_MS = 200 # Speed of Fiber optic

client = OpenAI()
CHAT_MODEL = "gpt-6-luna"

SYSTEM_PROMPT = """You are the operator for SearchBook, a Telephone & Packet Directory
website that looks up a domain's IP address, the physical location of its server,
and the round-trip time of a ping. Help visitors understand networking terms
(DNS, IP addresses, ping, latency, geolocation, CDNs) and their search results.
Use plain language and short answers, two to four sentences. Use the phonebook and
telephone metaphor when it helps. If asked about something unrelated to the
internet, DNS, or this site, politely steer back to those topics."""

def clean_domain(text):
    """'HTTPS://www.Example.com:8080/a/?q=1' -> 'www.example.com'.

    Lowercase, then drop the scheme, then cut at the first / : ? or # to drop the
    path, port, query and trailing slash.
    """
    text = text.strip().lower().split("://", 1)[-1]
    return re.split(r"[/:?#]", text)[0]


@app.route("/")
def home():
    return send_from_directory(".", "index.html")


# ---- Per-user ping tracking + leaderboard ----------------------------------
# Signed-in lookups update users/{uid} (private) AND leaderboard/{uid} (public copy with
# just the username and the two counters, because users/{uid} also holds the email).
# Only Flask writes these (Admin SDK); firestore.rules block browsers from changing them.

LEADERBOARD_LIMIT = 10   # rows shown on the main page; the totals still count everyone

def current_uid():
    """Return the signed-in user's Firebase uid, or None if logged out.

    JavaScript.js sends "Authorization: Bearer <ID token>"; we verify it with Firebase.
    A missing or bad token, or db being None, counts as logged out (return None),
    so a token problem never breaks the lookup itself.
    """
    if db is None:
        return None
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        return auth.verify_id_token(header[len("Bearer "):])["uid"]
    except Exception:
        app.logger.warning("Ignoring an invalid or expired ID token.")
        return None


def record_user_ping(uid, fiber_km):
    """Credit one lookup to users/{uid} and leaderboard/{uid}.

    Only when users/{uid} exists (the profile is finished):
      - pingsSent        += 1                     (always, even if the ping failed)
      - totalDistanceKm  += fiber_km, or 0 when the ping got no reply (fiber_km is None)
    firestore.Increment() makes Firestore add on its side, so two lookups at once can't
    overwrite each other. Distance is stored in km only; pages convert to miles for display.
    """
    user_ref = db.collection("users").document(uid)
    user = user_ref.get()
    if not user.exists:
        return

    km = fiber_km or 0
    batch = db.batch()   # both writes succeed together or not at all
    batch.update(user_ref, {
        "pingsSent": firestore.Increment(1),
        "totalDistanceKm": firestore.Increment(km),
    })
    # merge=True creates leaderboard/{uid} on the user's first ping and adds to it after that.
    # Usernames can't change (firestore.rules), so copying it each time is safe.
    batch.set(db.collection("leaderboard").document(uid), {
        "username": user.to_dict().get("username"),
        "pingsSent": firestore.Increment(1),
        "totalDistanceKm": firestore.Increment(km),
    }, merge=True)
    batch.commit()


@app.route("/lookup")
def lookup():
    start = time.perf_counter()

    domain = clean_domain(request.args.get("domain", ""))
    if not domain:
        return jsonify(error="Please enter a domain."), 400

    # 1. DNS
    try:
        ip = socket.gethostbyname(domain)
    except socket.gaierror:
        return jsonify(error=f"Couldn't find '{domain}'. Check the spelling."), 404

    # 2. Ping
    rtt_ms = ping(ip, timeout=10, unit="ms")
    if not rtt_ms:
        rtt_ms = None
        fiber_km = None
    else:
        rtt_ms = round(rtt_ms, 2)
        fiber_km = round(rtt_ms / 2 * FIBER_KM_PER_MS)

    # 3. Server location
    try:
        geo = requests.get(f"http://ip-api.com/json/{ip}", timeout=5).json()
    except requests.RequestException:
        geo = {}

    # 4. Credit the ping to the signed-in user. A failed save is only logged, so it
    # never hides the lookup result from the user.
    try:
        uid = current_uid()
        if uid:
            record_user_ping(uid, fiber_km)
    except Exception:
        app.logger.exception("Couldn't save this ping to the leaderboard.")

    return jsonify(
        domain=domain,
        ip=ip,
        city=geo.get("city"),
        region=geo.get("regionName"),
        country=geo.get("country"),
        isp=geo.get("isp"),
        lat=geo.get("lat"),
        lon=geo.get("lon"),
        ping_ms=rtt_ms,
        fiber_km=fiber_km,
        fiber_miles=round(fiber_km * 0.621) if fiber_km else None,
        lookup_time_ms=round((time.perf_counter() - start) * 1000),
    )

@app.route("/leaderboard")
def leaderboard():
    """Standings for the main page: ?sort=pings (default) or ?sort=distance."""
    sort = request.args.get("sort", "pings")
    if sort not in ("pings", "distance"):
        return jsonify(error="sort must be 'pings' or 'distance'."), 400
    if db is None:
        return jsonify(error="The leaderboard is unavailable right now."), 503

    try:
        rows = [doc.to_dict() for doc in db.collection("leaderboard").stream()]
    except Exception:
        app.logger.exception("Couldn't read the leaderboard.")
        return jsonify(error="The leaderboard is unavailable right now."), 503

    entries = [{
        "username": row.get("username") or "unknown",
        "pingsSent": int(row.get("pingsSent") or 0),
        "totalDistanceKm": row.get("totalDistanceKm") or 0,
    } for row in rows]

    # Sort by the chosen column, then the other column, then name, so ties are stable.
    first, second = (("pingsSent", "totalDistanceKm") if sort == "pings"
                     else ("totalDistanceKm", "pingsSent"))
    entries.sort(key=lambda e: (-e[first], -e[second], e["username"].lower()))

    totals = {  # everyone on the board, not just the rows shown
        "users": len(entries),
        "pingsSent": sum(e["pingsSent"] for e in entries),
        "totalDistanceKm": sum(e["totalDistanceKm"] for e in entries),
    }
    top = entries[:LEADERBOARD_LIMIT]
    for rank, entry in enumerate(top, start=1):
        entry["rank"] = rank
    return jsonify(sort=sort, entries=top, totals=totals)


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    history = data.get("messages", [])
    #request to get JSON
 
    # Keep only the last 10 turns and cap length, to limit cost and abuse.
    messages = [
        {"role": m["role"], "content": str(m.get("content", ""))[:1000]}
        for m in history[-10:]
        if m.get("role") in ("user", "assistant")
    ]
    if not messages or messages[-1]["role"] != "user":
        return jsonify(error="Send a message first."), 400

    #create chat bot
 
    try:
        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}] + messages,
            max_completion_tokens=300,
        )
        return jsonify(reply=response.choices[0].message.content)
    except Exception as exc:
        app.logger.exception("OpenAI error")
        return jsonify(error="The operator is unavailable. Try again shortly."), 502


 

if __name__ == "__main__":
    app.run(debug=True)