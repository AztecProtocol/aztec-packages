#!/bin/bash
set -eu

cd $(dirname $0) # enter source dir

# Ensure we have NPM
command -v npm >/dev/null || (sudo apt update && sudo apt install -y npm)
command -v lsof >/dev/null || (sudo apt update && sudo apt install -y lsof)

# Check if port 8337 is in use
# If not, start the server with nohup and redirect logs
if lsof -i:8337 -sTCP:LISTEN -t >/dev/null; then
  echo "Port 8337 is already in use. Not starting aztec cache tool."
else
  npm install
  nohup npm start > log.stdout 2> log.stderr &
  echo "Aztec cache tool server started successfully in detached mode, logging to log.stdout and log.stderr."
fi
