#!/usr/bin/env bash
# One-time setup for running the bot on a headless Ubuntu server (20.04/22.04/24.04).
# Installs Node.js 22, the system libraries Chromium/Puppeteer needs, and the
# npm dependencies. Run from the whatsapp-bot/ directory:
#
#   bash deploy/setup-ubuntu.sh
#
set -euo pipefail

echo "==> Updating apt"
sudo apt-get update -y

# --- Node.js 22 (skip if a recent node is already installed) -----------------
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  echo "==> Installing Node.js 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "==> Node already present: $(node -v)"
fi

# --- Chromium runtime libraries (Puppeteer downloads Chrome, but not these) --
echo "==> Installing Chromium system libraries"
sudo apt-get install -y \
  ca-certificates fonts-liberation wget xdg-utils \
  libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
  libexpat1 libfontconfig1 libgbm1 libgcc-s1 libglib2.0-0 libgtk-3-0 \
  libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
  libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
  libxkbcommon0 libxrandr2

# libasound2 was renamed on Ubuntu 24.04 — try the new name, fall back to old.
sudo apt-get install -y libasound2t64 2>/dev/null || sudo apt-get install -y libasound2

# --- npm dependencies (also triggers Puppeteer's Chrome download) ------------
echo "==> Installing npm dependencies"
npm install

echo
echo "✅ Setup complete."
echo "Next: cp .env.example .env  (edit it), then run 'npm start' once to scan the QR."
