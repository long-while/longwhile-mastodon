#!/bin/bash
set -euo pipefail

if [ "${BIRD_UI_OVERWRITE:-}" != "1" ]; then
  echo "update-bird-ui.sh: this overwrites the hand-edited bird-ui stylesheet." >&2
  echo "Re-run with BIRD_UI_OVERWRITE=1 if you really want to replace it, then review git diff." >&2
  exit 1
fi

export MASTODON_VERSION_FOR_BIRD_UI="nightly"
TARGET=app/javascript/styles/mastodon-bird-ui/layout-single-column.scss

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# Download the CSS file for single column layout
wget --no-cache --no-cookies --no-http-keep-alive https://raw.githubusercontent.com/Lastorder-DEV/mastodon-bird-ui/$MASTODON_VERSION_FOR_BIRD_UI/layout-single-column.css -O "$TMP"
[ -s "$TMP" ] || { echo "update-bird-ui.sh: download was empty, $TARGET left as it was." >&2; exit 1; }

# Replace theme-contrast with theme-mastodon-bird-ui-contrast for single column layout
sed -i 's/theme-contrast/theme-mastodon-bird-ui-contrast/g' "$TMP"

# Replace theme-mastodon-light with theme-mastodon-bird-ui-light for single column layout
sed -i 's/theme-mastodon-light/theme-mastodon-bird-ui-light/g' "$TMP"

chmod 644 "$TMP"
mv "$TMP" "$TARGET"
trap - EXIT
