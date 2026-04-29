#!/bin/zsh
# Save all open Safari tabs to My Links app
# Usage: save-safari-session.sh [tag]
#   If tag is omitted, prompts via a native dialog (pre-filled with today's date)

API_TOKEN="YOUR_API_TOKEN_HERE"
API_URL="https://links.1000600.xyz/links/batch"
DEFAULT_TAG=$(date '+%Y-%m-%d')

# Use argument if provided (command-line use), otherwise show native dialog
if [[ -n "$1" ]]; then
    SESSION_TAG="$1"
else
    SESSION_TAG=$(osascript -e "
tell application \"System Events\"
    set response to display dialog \"Session tag:\" default answer \"$DEFAULT_TAG\" buttons {\"Cancel\", \"Save\"} default button \"Save\" with title \"Save Safari Tabs\"
    return text returned of response
end tell
" 2>/dev/null)
    [[ -z "$SESSION_TAG" ]] && SESSION_TAG=$DEFAULT_TAG
fi

# Get Safari tabs into temp file
osascript -e '
tell application "Safari"
    set tabList to {}
    repeat with w in windows
        repeat with t in tabs of w
            set u to URL of t
            if u is not missing value then
                set end of tabList to (name of t) & "|||||" & u
            end if
        end repeat
    end repeat
    set outStr to ""
    repeat with i from 1 to count of tabList
        if i > 1 then set outStr to outStr & linefeed
        set outStr to outStr & item i of tabList
    end repeat
    return outStr
end tell
' > /tmp/safari_tabs.txt

# Build JSON payload with Python
JSON=$(python3 - "$SESSION_TAG" <<'PYEOF'
import json, sys

tag = sys.argv[1]
with open('/tmp/safari_tabs.txt') as f:
    lines = [l.strip() for l in f if '|||||' in l]

links = []
for line in lines:
    title, tab_url = line.split('|||||', 1)
    if tab_url.strip() and not tab_url.startswith('about:'):
        links.append({'url': tab_url.strip(), 'title': title.strip(), 'tags': tag})

print(json.dumps({'links': links}))
PYEOF
)

# POST with curl
RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d "$JSON")

SAVED=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('saved',0))")
echo "Saved $SAVED tabs with tag: $SESSION_TAG"

rm -f /tmp/safari_tabs.txt
