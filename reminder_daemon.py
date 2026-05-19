#!/usr/bin/env python3
"""
IMTD - Intelligent Meeting Takeover Daemon (MacBook Component)
Polls the secure keyvalue.immanuel.co store every 10 seconds for meeting triggers.
"""
import subprocess
import threading
import time
import json
import ssl
import urllib.request
import urllib.parse
import base64

# =========================================================================
# ⚙️ CONFIGURATION
# =========================================================================
# This key is automatically injected during install.sh
APP_KEY = "APP_KEY_PLACEHOLDER"
KV_GET_URL = f"https://keyvalue.immanuel.co/api/KeyVal/GetValue/{APP_KEY}/trigger"
KV_SET_URL = f"https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/{APP_KEY}/trigger/"

triggered_ids = set()

# =========================================================================
# 🚨 CHROME TAKEOVER
# =========================================================================
def trigger_chrome_takeover(title, meet_url):
    """Full MacBook screen takeover: open Chrome to meeting URL + play loud alarm."""
    print(f"🚨 ACTIVE TAKEOVER for: {title}", flush=True)

    # Play loud alarm sound
    subprocess.Popen(['afplay', '/System/Library/Sounds/Sosumi.aiff'])
    takeover_script = f"""
    tell application "Google Chrome"
        activate
        if (count of windows) is 0 then
            make new window
        end if
        tell window 1
            make new tab with properties {{URL:"{meet_url}"}}
        end tell
        display dialog "🚨 MEETING STARTING IN 1 MINUTE:\\n\\n{title}" with title "Meeting Alarm" buttons {{"JOIN MEET"}} default button "JOIN MEET" giving up after 15
    end tell
    """
    subprocess.run(['osascript', '-e', takeover_script], timeout=20)

# =========================================================================
# 📡 STEALTH POLLING LOOP
# =========================================================================
def clear_trigger_in_cloud():
    """Clear the trigger payload in the cloud database."""
    try:
        url = f"{KV_SET_URL}null"
        cmd = ['curl', '-s', '-X', 'POST', '-H', 'Content-Length: 0', url]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
    except Exception as e:
        print(f"⚠️ Failed to clear trigger in cloud: {e}", flush=True)

def check_for_trigger():
    """Poll the cloud database for a new meeting trigger."""
    global triggered_ids
    try:
        # Perform standard GET request (completely stealthy outgoing HTTPS traffic)
        req = urllib.request.Request(KV_GET_URL, headers={'User-Agent': 'Mozilla/5.0'})
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=5) as response:
            raw_val = response.read().decode('utf-8').strip()
            
            # Clean string quotes returned by the keyvalue API
            if raw_val.startswith('"') and raw_val.endswith('"'):
                raw_val = raw_val[1:-1]
            
            if not raw_val or raw_val == "null":
                return

            # Decode the base64web-safe payload
            try:
                # Add missing padding character '=' if necessary
                missing_padding = len(raw_val) % 4
                if missing_padding:
                    raw_val += '=' * (4 - missing_padding)
                
                decoded_bytes = base64.urlsafe_b64decode(raw_val)
                data = json.loads(decoded_bytes.decode('utf-8'))
                
                meeting_id = data.get('id')
                title = data.get('title')
                meet_url = data.get('url')

                if meeting_id and meeting_id not in triggered_ids:
                    triggered_ids.add(meeting_id)
                    
                    # Perform local Chrome takeover
                    threading.Thread(
                        target=trigger_chrome_takeover,
                        args=(title, meet_url),
                        daemon=True
                    ).start()
                    
                    # Clear trigger from cloud immediately
                    clear_trigger_in_cloud()
                    
            except Exception as parse_err:
                clear_trigger_in_cloud()

    except Exception as e:
        pass

# =========================================================================
# 🚀 MAIN
# =========================================================================
def main():
    print("=" * 60, flush=True)
    print("  Intelligent Meeting Takeover Daemon (IMTD)", flush=True)
    print("  MacBook Silent Poller", flush=True)
    print("=" * 60, flush=True)
    print("🔋 Stealth monitoring started...", flush=True)

    while True:
        check_for_trigger()
        time.sleep(10) # Poll every 10 seconds

if __name__ == "__main__":
    main()
