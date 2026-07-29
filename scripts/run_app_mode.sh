#!/usr/bin/env bash

# LocalMaster Kiosk Standalone App Window Launcher (Port: 5179)
PORT=5179
URL="http://localhost:${PORT}"

echo "========================================================"
echo "  LocalMaster Kiosk - Standalone App Window Launcher"
echo "  Port: ${PORT}"
echo "========================================================"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if [ -d "/Applications/Google Chrome.app" ]; then
        echo "Launching Google Chrome App Mode on macOS..."
        open -na "Google Chrome" --args --app="${URL}"
    elif [ -d "/Applications/Microsoft Edge.app" ]; then
        echo "Launching Microsoft Edge App Mode on macOS..."
        open -na "Microsoft Edge" --args --app="${URL}"
    else
        echo "Defaulting to open URL..."
        open "${URL}"
    fi
else
    # Linux
    if command -v google-chrome &> /dev/null; then
        google-chrome --app="${URL}" &
    elif command -v chromium-browser &> /dev/null; then
        chromium-browser --app="${URL}" &
    else
        xdg-open "${URL}"
    fi
fi
