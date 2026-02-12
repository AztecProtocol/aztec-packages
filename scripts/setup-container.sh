#!/bin/bash
set -euo pipefail

# =============================================================================
# Aztec Development Container Setup Script
# =============================================================================
# This script sets up an Ubuntu container with all dependencies needed to build
# the Aztec project, plus Claude Code with restricted outbound network access.
#
# Last updated: 2026-01-30
#
# Usage: sudo ./setup-container.sh
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (sudo ./setup-container.sh)"
    exit 1
fi

# Get the actual user if running via sudo
ACTUAL_USER=${SUDO_USER:-$USER}
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

export DEBIAN_FRONTEND=noninteractive

# =============================================================================
# SECTION 1: Base System Packages
# =============================================================================
log_info "Installing base system packages..."

apt-get update
apt-get install -y \
    build-essential \
    ca-certificates \
    bash \
    clang \
    cmake \
    make \
    ninja-build \
    git \
    curl \
    gnupg \
    gnupg2 \
    python3 \
    wget \
    time \
    jq \
    gawk \
    unzip \
    netcat-openbsd \
    parallel \
    xz-utils \
    lsof \
    xxd \
    zstd \
    lsb-release \
    software-properties-common \
    clang-16 \
    clang-format-16 \
    libc++-dev \
    libomp-dev \
    doxygen \
    libdw-dev \
    libelf-dev \
    pkg-config \
    libssl-dev \
    python3-clang \
    less \
    procps \
    sudo \
    fzf \
    zsh \
    man-db \
    nano \
    vim \
    iptables \
    ipset \
    iproute2 \
    dnsutils \
    aggregate

apt-get -y autoremove
apt-get clean

# =============================================================================
# SECTION 2: Node.js 24
# =============================================================================
log_info "Installing Node.js 24..."

curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs=24.12.0-1nodesource1

# =============================================================================
# SECTION 3: Clang 18/20
# =============================================================================
log_info "Installing Clang 18 and 20..."

wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
./llvm.sh 18 all
./llvm.sh 20 all
rm llvm.sh

# =============================================================================
# SECTION 4: Rust
# =============================================================================
log_info "Installing Rust..."

export RUSTUP_HOME=/opt/rust/rustup
export CARGO_HOME=/opt/rust/cargo

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.85.0
source /opt/rust/cargo/env

rustup target add wasm32-unknown-unknown wasm32-wasip1

# Make rust accessible to all users
chmod -R a+w /opt/rust

# Add to system-wide profile
cat >> /etc/profile.d/rust.sh << 'EOF'
export RUSTUP_HOME=/opt/rust/rustup
export CARGO_HOME=/opt/rust/cargo
export PATH="/opt/rust/cargo/bin:$PATH"
EOF
chmod +x /etc/profile.d/rust.sh

# =============================================================================
# SECTION 5: wasi-sdk
# =============================================================================
log_info "Installing wasi-sdk 27..."

arch=$(uname -m)
if [ "$arch" = "aarch64" ]; then arch="arm64"; fi
wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-27/wasi-sdk-27.0-${arch}-linux.tar.gz
tar xvf wasi-sdk-27.0-${arch}-linux.tar.gz
mv wasi-sdk-27.0-${arch}-linux /opt/wasi-sdk
rm wasi-sdk-27.0-${arch}-linux.tar.gz

# =============================================================================
# SECTION 6: Foundry
# =============================================================================
log_info "Installing Foundry v1.4.1..."

export PATH="/opt/rust/cargo/bin:$PATH"
export FOUNDRY_BIN_DIR="/tmp/foundry-bin"
export RUSTFLAGS="-C target-cpu=generic"

curl -L https://foundry.paradigm.xyz | bash
$HOME/.foundry/bin/foundryup -i v1.4.1

mkdir -p /opt/foundry/bin
for t in forge cast anvil chisel; do
    mv $HOME/.foundry/bin/$t /opt/foundry/bin/$t
    strip /opt/foundry/bin/$t
done
rm -rf $HOME/.foundry

# Add to system-wide profile
cat >> /etc/profile.d/foundry.sh << 'EOF'
export PATH="/opt/foundry/bin:$PATH"
EOF
chmod +x /etc/profile.d/foundry.sh

# =============================================================================
# SECTION 7: Zig
# =============================================================================
log_info "Installing Zig 0.15.1..."

arch=$(uname -m)
zig_version=0.15.1
curl -fsSL https://ziglang.org/download/${zig_version}/zig-${arch}-linux-${zig_version}.tar.xz | tar xJ
mv zig-${arch}-linux-${zig_version} /opt/zig
ln -sf /opt/zig/zig /usr/local/bin/zig

# =============================================================================
# SECTION 8: yq
# =============================================================================
log_info "Installing yq v4..."

curl -sL https://github.com/mikefarah/yq/releases/download/v4.42.1/yq_linux_$(dpkg --print-architecture) \
    -o /usr/local/bin/yq && chmod +x /usr/local/bin/yq

# =============================================================================
# SECTION 9: ldid (for macOS cross-compilation signing)
# =============================================================================
log_info "Installing ldid..."

curl -sL https://github.com/ProcursusTeam/ldid/releases/download/v2.1.5-procursus7/ldid_linux_x86_64 \
    -o /usr/local/bin/ldid && chmod +x /usr/local/bin/ldid

# =============================================================================
# SECTION 10: wasmtime
# =============================================================================
log_info "Installing wasmtime..."

curl -fsSL https://github.com/bytecodealliance/wasmtime/releases/download/v20.0.2/wasmtime-v20.0.2-$(uname -m)-linux.tar.xz | tar xJ
mv wasmtime-v20.0.2-$(uname -m)-linux/wasmtime /usr/local/bin
rm -rf wasmtime*

# =============================================================================
# SECTION 11: npm global packages
# =============================================================================
log_info "Installing npm global packages (corepack, yarn, solhint)..."

npm install --global corepack
corepack enable
corepack install --global yarn@4.5.2
npm install --global solhint

# =============================================================================
# SECTION 12: GitHub CLI
# =============================================================================
log_info "Installing GitHub CLI..."

mkdir -p -m 755 /etc/apt/keyrings
wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg > /etc/apt/keyrings/githubcli-archive-keyring.gpg
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update
apt-get install -y gh

# =============================================================================
# SECTION 13: Claude Code
# =============================================================================
log_info "Installing Claude Code..."

npm install -g @anthropic-ai/claude-code

# =============================================================================
# SECTION 14: Create Firewall Script
# =============================================================================
log_info "Creating firewall initialization script..."

cat > /usr/local/bin/init-firewall.sh << 'FIREWALL_EOF'
#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

echo "Initializing firewall with restricted outbound access..."

# 1. Extract Docker DNS info BEFORE any flushing
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# Flush existing rules and delete existing ipsets
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# 2. Selectively restore ONLY internal Docker DNS resolution
if [ -n "$DOCKER_DNS_RULES" ]; then
    echo "Restoring Docker DNS rules..."
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
else
    echo "No Docker DNS rules to restore"
fi

# First allow DNS and localhost before any restrictions
# Allow outbound DNS
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
# Allow inbound DNS responses
iptables -A INPUT -p udp --sport 53 -j ACCEPT
# Allow outbound SSH
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
# Allow inbound SSH responses
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
# Allow localhost
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Create ipset with CIDR support
ipset create allowed-domains hash:net

# Fetch GitHub meta information and aggregate + add their IP ranges
echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta)
if [ -z "$gh_ranges" ]; then
    echo "ERROR: Failed to fetch GitHub IP ranges"
    exit 1
fi

if ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
    echo "ERROR: GitHub API response missing required fields"
    exit 1
fi

echo "Processing GitHub IPs..."
while read -r cidr; do
    if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        echo "ERROR: Invalid CIDR range from GitHub meta: $cidr"
        exit 1
    fi
    echo "Adding GitHub range $cidr"
    ipset add allowed-domains "$cidr"
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)

# Resolve and add other allowed domains
# Including Aztec CI server and standard Claude Code domains
for domain in \
    "ci.aztec-labs.com" \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "sentry.io" \
    "statsig.anthropic.com" \
    "statsig.com" \
    "marketplace.visualstudio.com" \
    "vscode.blob.core.windows.net" \
    "update.code.visualstudio.com"; do
    echo "Resolving $domain..."
    ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
    if [ -z "$ips" ]; then
        echo "WARNING: Failed to resolve $domain (may be expected if not using this service)"
        continue
    fi

    while read -r ip; do
        if [[ ! "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            echo "ERROR: Invalid IP from DNS for $domain: $ip"
            exit 1
        fi
        echo "Adding $ip for $domain"
        ipset add allowed-domains "$ip"
    done < <(echo "$ips")
done

# Get host IP from default route
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
    echo "ERROR: Failed to detect host IP"
    exit 1
fi

HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
echo "Host network detected as: $HOST_NETWORK"

# Set up remaining iptables rules
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# Set default policies to DROP first
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# First allow established connections for already approved traffic
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Then allow only specific outbound traffic to allowed domains
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# Explicitly REJECT all other outbound traffic for immediate feedback
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

echo "Firewall configuration complete"
echo "Verifying firewall rules..."

# Verify blocked access
if curl --connect-timeout 5 https://example.com >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - was able to reach https://example.com"
    exit 1
else
    echo "Firewall verification passed - unable to reach https://example.com as expected"
fi

# Verify GitHub API access
if ! curl --connect-timeout 5 https://api.github.com/zen >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - unable to reach https://api.github.com"
    exit 1
else
    echo "Firewall verification passed - able to reach https://api.github.com as expected"
fi

echo ""
echo "=== Firewall Active ==="
echo "Allowed domains:"
echo "  - GitHub (api, web, git)"
echo "  - ci.aztec-labs.com"
echo "  - registry.npmjs.org"
echo "  - api.anthropic.com"
echo "  - statsig.anthropic.com"
echo "  - sentry.io"
echo "  - VS Code marketplace"
echo "========================"
FIREWALL_EOF

chmod +x /usr/local/bin/init-firewall.sh

# Allow non-root users to run the firewall script
echo "$ACTUAL_USER ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/user-firewall
chmod 440 /etc/sudoers.d/user-firewall

# =============================================================================
# SECTION 15: Environment Setup
# =============================================================================
log_info "Setting up environment..."

# Create combined environment file
cat > /etc/profile.d/aztec-env.sh << 'EOF'
export RUSTUP_HOME=/opt/rust/rustup
export CARGO_HOME=/opt/rust/cargo
export PATH="/opt/rust/cargo/bin:/opt/foundry/bin:/opt/zig:$PATH"
export LANG=C.UTF-8
export TERM=xterm-256color
EOF
chmod +x /etc/profile.d/aztec-env.sh

# =============================================================================
# SECTION 16: Verification
# =============================================================================
log_info "Verifying installations..."

# Source environment
source /etc/profile.d/aztec-env.sh
source /etc/profile.d/rust.sh
source /etc/profile.d/foundry.sh

echo ""
echo "=== Installed Versions ==="

echo -n "Node.js: "
node --version

echo -n "npm: "
npm --version

echo -n "Rust: "
rustc --version

echo -n "Clang 20: "
clang++-20 --version | head -n1

echo -n "Zig: "
zig version

echo -n "Foundry (forge): "
/opt/foundry/bin/forge --version

echo -n "wasi-sdk: "
cat /opt/wasi-sdk/VERSION

echo -n "yq: "
yq --version

echo -n "GitHub CLI: "
gh --version | head -n1

echo -n "Claude Code: "
claude --version 2>/dev/null || echo "installed (run 'claude' to authenticate)"

echo ""
echo "==========================="

# =============================================================================
# Final Instructions
# =============================================================================
log_info "Setup complete!"

cat << 'INSTRUCTIONS'

=== NEXT STEPS ===

1. Source the environment (or log out and back in):
   source /etc/profile.d/aztec-env.sh

2. Authenticate Claude Code:
   claude

3. (Optional) Enable firewall to restrict outbound access:
   sudo /usr/local/bin/init-firewall.sh

   This will restrict network access to only:
   - GitHub (for git operations)
   - ci.aztec-labs.com (Aztec CI)
   - npm registry
   - Anthropic API (for Claude)
   - VS Code marketplace

4. Bootstrap the Aztec project:
   cd /path/to/aztec
   ./bootstrap.sh check  # Verify toolchains
   ./bootstrap.sh        # Full build

===================

INSTRUCTIONS
