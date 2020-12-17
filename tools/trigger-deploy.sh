#!/bin/sh
# Trigger a deploy on server
set -e

figlet "Deploying..."
git push
ssh future -t zsh -ci "/home/feross/bot/mad-science-bot/tools/deploy.sh"
figlet "Deployed"
