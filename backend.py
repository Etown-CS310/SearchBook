"""
YOU MUST DO BELOW STEPS TO RUN THIS APP, THEN RUN THE CODE!!!
 
Setup:  pip install -r Requirements.txt
Run:    python backend.py
Open:   http://127.0.0.1:5000
"""
import socket
import time

import requests
from flask import Flask, jsonify, request, send_from_directory
from ping3 import ping

app = Flask(__name__, static_folder=".", static_url_path="")

FIBER_KM_PER_MS = 200 # Speed of Fiber optic


def clean_domain(text):
    text = text.strip().lower()
    for prefix in ("https://", "http://"):
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text.split("/")[0]


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


if __name__ == "__main__":
    app.run(debug=True)