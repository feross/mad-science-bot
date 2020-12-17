#!/bin/sh
# Update code and restart server (run on server)
set -e

if [ -d "/home/feross/bot/build-mad-science-bot" ]; then
  echo "ERROR: Build folder exists. Is another build in progress?"
  exit 1
fi

if [ -d "/home/feross/bot/old-mad-science-bot" ]; then
  echo "ERROR: Old folder exists. Did a previous build crash?"
  exit 1
fi

cp -a /home/feross/bot/mad-science-bot /home/feross/bot/build-mad-science-bot

cd /home/feross/bot/build-mad-science-bot && git pull
cd /home/feross/bot/build-mad-science-bot && rm -rf node_modules
cd /home/feross/bot/build-mad-science-bot && npm ci --no-progress
cd /home/feross/bot/build-mad-science-bot && npm run build
cd /home/feross/bot/build-mad-science-bot && npm prune --production --no-progress

sudo supervisorctl stop mad-science-bot

cd /home/feross/bot && mv mad-science-bot old-mad-science-bot
cd /home/feross/bot && mv build-mad-science-bot mad-science-bot

sudo supervisorctl start mad-science-bot

cd /home/feross/bot && rm -rf old-mad-science-bot
