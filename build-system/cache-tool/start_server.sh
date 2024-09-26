#!/bin/bash
set -eu

cd $(dirname $0) # enter source dir

# Ensure we have NPM
command -v npm >/dev/null || (sudo apt update && sudo apt install -y npm)
command -v lsof >/dev/null || (sudo apt update && sudo apt install -y lsof)

# Check the current version of Node.js
CURRENT_NODE_VERSION=$(node -v || echo "v0.0.0")
REQUIRED_NODE_VERSION="v18.0.0"

# Function to install nvm if not already installed
install_nvm() {
  echo "Installing NVM (Node Version Manager)..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
  [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
}

# Ensure nvm is installed and node is at least version 18
if [[ "${CURRENT_NODE_VERSION:1}" < "${REQUIRED_NODE_VERSION:1}" ]]; then
  echo "Node.js version is less than 18. Checking for NVM..."
  if ! command -v nvm >/dev/null 2>&1; then
    install_nvm
  else
    echo "NVM is already installed."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # Load NVM
  fi

  echo "Installing and using Node.js version 18..."
  nvm install 18
  nvm use 18
  nvm alias default 18
fi

# Check if port 8337 is in use
# If not, start the server with nohup and redirect logs
if lsof -i:8337 -sTCP:LISTEN -t >/dev/null; then
  echo "Port 8337 is already in use. Not starting aztec cache tool."
else
  npm install
  nohup npm start > log.stdout 2> log.stderr &
  echo "Aztec cache tool server started successfully in detached mode, logging to log.stdout and log.stderr."
fi
