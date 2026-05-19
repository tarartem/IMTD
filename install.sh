#!/bin/bash

echo "🚀 Installing Intelligent Meeting Takeover Daemon (IMTD)..."

# 1. Generate unique App Key for this user
APP_KEY=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 8)
echo "🔑 Generated Unique App Key: $APP_KEY"

# 2. Setup Directories
INSTALL_DIR="$HOME/Library/Application Support/IMTD"
mkdir -p "$INSTALL_DIR"

# 3. Copy Python Daemon and inject App Key
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cp "$DIR/reminder_daemon.py" "$INSTALL_DIR/reminder_daemon.py"

# Compatible cross-platform sed (Mac & Linux) to inject the random key
sed -i '' "s/APP_KEY_PLACEHOLDER/$APP_KEY/g" "$INSTALL_DIR/reminder_daemon.py"

# 4. Compile the macOS App Wrapper
APP_PATH="$HOME/Applications/IMTD.app"
echo "📦 Compiling macOS background app to $APP_PATH..."
mkdir -p "$HOME/Applications"

# We use the system Python 3 explicitly
osacompile -o "$APP_PATH" -e "do shell script \"/usr/bin/python3 '$INSTALL_DIR/reminder_daemon.py' > /tmp/imtd_daemon.log 2>&1 &\""

# Hide the app icon from the Dock
plutil -insert LSUIElement -bool YES "$APP_PATH/Contents/Info.plist"

# 5. Add to Login Items
echo "🔄 Adding to macOS Login Items for auto-start..."
osascript -e "tell application \"System Events\" to make login item at end with properties {path:\"$APP_PATH\", hidden:false}" > /dev/null 2>&1

# 6. Start it now
echo "▶️ Launching the daemon..."
kill $(pgrep -f reminder_daemon.py) 2>/dev/null
open "$APP_PATH"

echo "========================================================="
echo "✅ INSTALLATION COMPLETE!"
echo ""
echo "Your MacBook daemon is now running silently in the background."
echo "Every time you restart your Mac, it will start automatically."
echo ""
echo "🔥 NEXT STEPS:"
echo "1. Go to script.google.com and deploy the contents of AppsScript.js"
echo "2. Inside the Apps Script editor, update the configuration block at the top with your unique key:"
echo ""
echo "   var KV_APP_KEY = \"$APP_KEY\";"
echo ""
echo "========================================================="
