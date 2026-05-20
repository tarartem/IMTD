#!/usr/bin/env python3
"""
IMTD - Intelligent Meeting Takeover Daemon (MacBook Component)
Polls a Google Sheet every 10 seconds for meeting triggers from Google Apps Script.
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
SHEET_ID = "17doybHrGqzhAxilnBIWrclAv0lyyphUEgS2k7ebsH_8"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=0"

triggered_ids = set()

# =========================================================================
# 🚨 CHROME TAKEOVER
# =========================================================================
def trigger_chrome_takeover(title, meet_url):
    """Full MacBook screen takeover: open Chrome to meeting URL + play loud alarm."""
    print(f"🚨 ACTIVE TAKEOVER for: {title}", flush=True)

    subprocess.Popen(['afplay', '/System/Library/Sounds/Sosumi.aiff'])
    if not meet_url or meet_url == "null":
        meet_url = "https://calendar.google.com"

    takeover_script = f"""
    do shell script "\\"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\\" --profile-directory=\\"Profile 2\\" '{meet_url}' > /dev/null 2>&1 &"
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
# 📡 GOOGLE SHEET POLLING LOOP
# =========================================================================
def check_for_trigger():
    """Poll the Google Sheet for a new meeting trigger written by Apps Script."""
    global triggered_ids
    try:
        req = urllib.request.Request(SHEET_URL, headers={'User-Agent': 'Mozilla/5.0'})
        context = ssl._create_unverified_context()

        with urllib.request.urlopen(req, context=context, timeout=8) as response:
            raw = response.read().decode('utf-8').strip()

            # Strip CSV quotes if present (Sheets wraps values in quotes)
            if raw.startswith('"') and raw.endswith('"'):
                raw = raw[1:-1].replace('""', '"')

            if not raw or raw.lower() == "null" or raw == "":
                return

            try:
                data = json.loads(raw)
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
            except Exception as parse_err:
                print(f"⚠️ Parse error: {parse_err} | raw={raw[:100]}", flush=True)

    except Exception as e:
        pass

# =========================================================================
# 🚀 MAIN
# =========================================================================
def main():
    print("=" * 60, flush=True)
    print("  Intelligent Meeting Takeover Daemon (IMTD)", flush=True)
    print(f"  Polling Google Sheet relay", flush=True)
    print("=" * 60, flush=True)
    print("🔋 Stealth monitoring started...", flush=True)

    while True:
        check_for_trigger()
        time.sleep(10)

if __name__ == "__main__":
    main()
