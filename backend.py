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
    path, port, query and trailing slash. This is used for DNS, the response, and
    (minus a leading "www.") the domains/{id} doc ID.
    """
    text = text.strip().lower().split("://", 1)[-1]
    return re.split(r"[/:?#]", text)[0]


def current_uid():
    """Firebase uid from the "Authorization: Bearer <ID token>" header, or None.

    No header, a bad/expired token, or Firebase not set up all count as logged out,
    so a token problem never breaks the lookup itself.
    """
    header = request.headers.get("Authorization", "")
    if db is None or not header.startswith("Bearer "):
        return None
    try:
        return auth.verify_id_token(header[len("Bearer "):])["uid"]
    except Exception as exc:
        app.logger.warning("Rejected ID token: %s", exc)
        return None


def record_ping(result, uid):
    """Save one lookup to Firestore in ONE transaction, so the domain's totals and
    the user's totals always move together (replaces BEGIN ... COMMIT in setup.sql).

    - domains/{id}: every lookup counts, logged in or not. Refreshes IP/location,
      bumps totalPings, and sets firstPingedAt only the first time.
    - users/{uid} + leaderboard/{uid}: only when logged in with a finished profile.
      A ping with no reply still counts as sent, but adds no distance.
    """
    # "www.example.com" and "example.com" share one doc. DNS still used what was typed.
    domain_ref = db.collection("domains").document(result["domain"].removeprefix("www."))
    user_ref = db.collection("users").document(uid) if uid else None
    km = result["fiber_km"] or 0

    @firestore.transactional
    def write(tx):
        # Firestore transactions must do every read before any write.
        is_new = not domain_ref.get(transaction=tx).exists
        user = user_ref.get(transaction=tx) if user_ref else None

        domain = {
            "domainUrl": domain_ref.id,
            "ipAddress": result["ip"],
            "city": result["city"],
            "region": result["region"],
            "country": result["country"],
            "latitude": result["lat"],
            "longitude": result["lon"],
            "isp": result["isp"],
            "totalPings": firestore.Increment(1),
            "lastPingedAt": firestore.SERVER_TIMESTAMP,
        }
        if is_new:
            domain["firstPingedAt"] = firestore.SERVER_TIMESTAMP
        tx.set(domain_ref, domain, merge=True)

        # user.exists is False for a Google account that hasn't picked a username yet.
        if user and user.exists:
            tx.update(user_ref, {
                "pingsSent": firestore.Increment(1),
                "totalDistanceKm": firestore.Increment(km),
            })
            # Public copy for the top-users table (users/{uid} is private). Computed from
            # the value read in this same transaction, so it always matches users/{uid}.
            tx.set(db.collection("leaderboard").document(uid), {
                "username": user.get("username"),
                "totalDistanceKm": user.get("totalDistanceKm") + km,
            })

    write(db.transaction())


@app.route("/")
def home():
    return send_from_directory(".", "index.html")


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

    result = dict(
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

    # 4. Save to Firestore. lookup_time_ms is measured before this, so saving doesn't
    # inflate it, and a failed save is only logged: the user still gets their result.
    if db is not None:
        try:
            record_ping(result, current_uid())
        except Exception:
            app.logger.exception("Couldn't save ping for %s", domain)

    return jsonify(result)

@app.route("/api/chat", methods=["POST"])
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