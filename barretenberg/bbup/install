#!/usr/bin/env bash

set -e

# Colors and symbols
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'
SUCCESS="✓"
ERROR="✗"

BB_DIR="${HOME}/.bb"
INSTALL_PATH="${BB_DIR}/bbup"
BBUP_URL="https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/bbup"

# Create .bb directory if it doesn't exist
mkdir -p "$BB_DIR"

# Download bbup
printf "${BLUE}Downloading bbup...${NC}\n"
if command -v curl &> /dev/null; then
    curl -fsSL "$BBUP_URL" -o "$INSTALL_PATH"
elif command -v wget &> /dev/null; then
    wget -q "$BBUP_URL" -O "$INSTALL_PATH"
else
    printf "${RED}${ERROR} Neither curl nor wget found. Please install either curl or wget.${NC}\n"
    exit 1
fi

if [ ! -f "$INSTALL_PATH" ]; then
    printf "${RED}${ERROR} Failed to download bbup${NC}\n"
    exit 1
fi

chmod 755 "$INSTALL_PATH"

# Add to shell config files if not already present
PATH_ENTRY="export PATH=\"\${HOME}/.bb:\${PATH}\""
FISH_PATH_ENTRY="set -gx PATH \${HOME}/.bb \$PATH"

add_to_config() {
    local config_file="$1"
    local entry="$2"
    if [ -f "$config_file" ] && ! grep -q "/.bb:" "$config_file"; then
        echo "$entry" >> "$config_file"
        return 0
    fi
    return 1
}

SHELL_UPDATED=false

if add_to_config "${HOME}/.bashrc" "$PATH_ENTRY"; then
    SHELL_UPDATED=true
fi

if add_to_config "${HOME}/.zshrc" "$PATH_ENTRY"; then
    SHELL_UPDATED=true
fi

if [ -f "${HOME}/.config/fish/config.fish" ] && ! grep -q "/.bb " "${HOME}/.config/fish/config.fish"; then
    echo "$FISH_PATH_ENTRY" >> "${HOME}/.config/fish/config.fish"
    SHELL_UPDATED=true
fi

printf "${GREEN}${SUCCESS} Successfully installed bbup${NC}\n"
if [ "$SHELL_UPDATED" = true ]; then
    printf "${BLUE}Please run 'source ~/.bashrc' or restart your terminal to use bbup${NC}\n"
else
    printf "${BLUE}Your PATH already includes ~/.bb - you can run 'bbup' from anywhere${NC}\n"
fi
