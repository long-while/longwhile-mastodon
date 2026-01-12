#!/bin/bash

export MASTODON_VERSION_FOR_BIRD_UI="nightly"

# Download the CSS file for single column layout
wget -N --no-check-certificate --no-cache --no-cookies --no-http-keep-alive https://raw.githubusercontent.com/Lastorder-DEV/mastodon-bird-ui/$MASTODON_VERSION_FOR_BIRD_UI/layout-single-column.css -O app/javascript/styles/mastodon-bird-ui/layout-single-column.scss

# Replace theme-contrast with theme-mastodon-bird-ui-contrast for single column layout
sed -i 's/theme-contrast/theme-mastodon-bird-ui-contrast/g' app/javascript/styles/mastodon-bird-ui/layout-single-column.scss

# Replace theme-mastodon-light with theme-mastodon-bird-ui-light for single column layout
sed -i 's/theme-mastodon-light/theme-mastodon-bird-ui-light/g' app/javascript/styles/mastodon-bird-ui/layout-single-column.scss
