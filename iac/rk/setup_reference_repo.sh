#!/usr/bin/env bash
set -e

# Setup script for the aztec-packages reference repository
# This creates a bare clone optimized for fast git operations

REPO_URL="https://github.com/AztecProtocol/aztec-packages.git"
DEFAULT_REPO_PATH="/home/ubuntu/aztec-packages-ci-reference"
LOGS_DISK_PATH="/mnt/logs-disk/aztec-packages-ci-reference"

echo "=== Aztec Packages Reference Repository Setup ==="
echo ""

# Determine where to place the repository
echo "Checking available disk space..."
HOME_AVAIL=$(df -BG /home/ubuntu 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/G//')
LOGS_AVAIL=$(df -BG /mnt/logs-disk 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/G//' || echo "0")

echo "Available space in /home/ubuntu: ${HOME_AVAIL}GB"
echo "Available space in /mnt/logs-disk: ${LOGS_AVAIL}GB"
echo ""

# Decide on location (needs ~4GB)
if [ "${HOME_AVAIL}" -ge 5 ]; then
    REPO_PATH="${DEFAULT_REPO_PATH}"
    echo "Using /home/ubuntu (sufficient space available)"
elif [ "${LOGS_AVAIL}" -ge 5 ]; then
    REPO_PATH="${LOGS_DISK_PATH}"
    echo "Using /mnt/logs-disk (insufficient space in /home/ubuntu)"
else
    echo "ERROR: Not enough disk space available in either location"
    echo "Need at least 4GB, have ${HOME_AVAIL}GB in /home/ubuntu and ${LOGS_AVAIL}GB in /mnt/logs-disk"
    exit 1
fi

echo "Repository will be created at: ${REPO_PATH}"
echo ""

# Check if repository already exists
if [ -d "${REPO_PATH}" ]; then
    echo "Repository already exists at ${REPO_PATH}"
    echo "Do you want to:"
    echo "  1) Update existing repository"
    echo "  2) Remove and re-clone"
    echo "  3) Exit"
    read -p "Choice (1-3): " choice

    case $choice in
        1)
            echo "Updating repository..."
            cd "${REPO_PATH}"
            git fetch --all --tags --prune
            echo "Repository updated successfully"
            exit 0
            ;;
        2)
            echo "Removing existing repository..."
            rm -rf "${REPO_PATH}"
            ;;
        3)
            echo "Exiting"
            exit 0
            ;;
        *)
            echo "Invalid choice, exiting"
            exit 1
            ;;
    esac
fi

# Create directory if it doesn't exist
mkdir -p "$(dirname "${REPO_PATH}")"

echo "Cloning repository as bare clone (this may take a few minutes)..."
git clone --bare "${REPO_URL}" "${REPO_PATH}"

echo ""
echo "=== Setup Complete ==="
echo "Reference repository created at: ${REPO_PATH}"
echo ""
echo "Repository size:"
du -sh "${REPO_PATH}"
echo ""
echo "Set the following environment variable when running the API:"
echo "  export REPO_PATH=\"${REPO_PATH}\""
echo ""
echo "To update the repository in the future:"
echo "  cd ${REPO_PATH} && git fetch --all --tags --prune"
