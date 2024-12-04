#!/bin/bash

# URL of the aztec-spartan.sh script
DEFAULT_URL="https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/master/spartan/releases/rough-rhino/aztec-spartan.sh"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Download the script
echo "Downloading aztec-spartan.sh..."
if curl -L -o aztec-spartan.sh "${1:-$DEFAULT_URL}"; then
    chmod +x aztec-spartan.sh
    echo -e "${GREEN}✓ aztec-spartan.sh has been downloaded and made executable${NC}"
    echo "You can now run it with: ./aztec-spartan.sh"
else
    echo -e "${RED}✗ Failed to download aztec-spartan.sh${NC}"
    exit 1
fi
