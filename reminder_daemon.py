#!/usr/bin/env python3
"""
IMTD - Intelligent Meeting Takeover Daemon (MacBook Component)
Polls ntfy.sh every 10 seconds for meeting triggers from Google Apps Script.
"""
import subprocess
import threading
import time
import json
import ssl
import urllib.request

# =========================================================================
# ⚙️ CONFIGURATION
# =========================================================================
APP_KEY = "mxv4dy10"
NTFY_TOPIC = f"imtd-{APP_KEY}"
NTFY_POLL_URL = f"https://ntfy.sh/{NTFY_TOPIC}/json?poll=1&since=30s"

triggered_ids = set()

# =========================================================================
# 🚨 CHROME TAKEOVER
# =========================================================================
def trigger_chrome_takeover(title, meet_url):
    """Full MacBook screen takeover: open Chrome to meeting URL + play loud alarm."""
    print(f"🚨 ACTIVE TAKEOVER for: {title}", flush=True)

    subprocess.Popen(['afplay', '/System/Library/Sounds/Sosumi.aiff'])
    takeover_script = f"""
    do shell script "open -a 'Google Chrome' '{meet_url}'"
    delay 0.5
    tell application "System Events"
        try
            set frontmost of process "Google Chrome" to true
        end try
        activate
        display dialog "🚨 MEETING STARTING IN 1 MINUTE:\\n\\n{title}" with title "Meeting Alarm" buttons {{"JOIN MEET"}} default button "JOIN MEET" giving up after 15
        try
            set frontmost of process "Google Chrome" to true
        end try
    end tell
    """
    subprocess.run(['osascript', '-e', takeover_script], timeout=20)

# =========================================================================
# 📡 NTFY.SH POLLING LOOP
# =========================================================================
def check_for_trigger():
    """Poll ntfy.sh topic for new meeting triggers."""
    global triggered_ids
    try:
        req = urllib.request.Request(NTFY_POLL_URL, headers={'User-Agent': 'Mozilla/5.0'})
        context = ssl._create_unverified_context()

        with urllib.request.urlopen(req, context=context, timeout=8) as response:
            raw = response.read().decode('utf-8').strip()
            if not raw:
                return

            # ntfy returns newline-delimited JSON — process each line
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    envelope = json.loads(line)
                    # ntfy wraps our payload in the "message" field
                    msg_str = envelope.get('message', '')
                    data = json.loads(msg_str)

                    meeting_id = data.get('id')
                    title = data.get('title')
                    meet_url = data.get('url')

                    if meeting_id and meeting_id not in triggered_ids:
                        triggered_ids.add(meeting_id)
                        threading.Thread(
                            target=trigger_chrome_takeover,
                            args=(title, meet_url),
                            daemon=True
                        ).start()
                except Exception:
                    pass

    except Exception:
        pass

# =========================================================================
# 🚀 MAIN
# =========================================================================
def main():
    print("=" * 60, flush=True)
    print("  Intelligent Meeting Takeover Daemon (IMTD)", flush=True)
    print(f"  Polling ntfy.sh topic: {NTFY_TOPIC}", flush=True)
    print("=" * 60, flush=True)
    print("🔋 Stealth monitoring started...", flush=True)

    while True:
        check_for_trigger()
        time.sleep(10)

if __name__ == "__main__":
    main()
