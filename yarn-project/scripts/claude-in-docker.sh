#!/usr/bin/env bash
# Run Claude Code inside an aztecprotocol/claudebox container
set -eu

# Image to use - claudebox extends devbox with Claude Code pre-installed
IMAGE="${CLAUDE_DOCKER_IMAGE:-aztecprotocol/claudebox:latest}"

# Docker mode:
# - "none": No Docker support (minimal, most secure)
# - "socket": Mount host Docker socket (less isolation, simpler)
# - "dind": Docker-in-Docker with specific capabilities (more isolated)
# - "privileged": Full privileged mode (least secure, but guaranteed to work)
DOCKER_MODE="${CLAUDE_DOCKER_MODE:-privileged}"

# SSH mode (opt-in):
# - "none": No SSH access (default)
# - "agent": Mount SSH agent socket (recommended - keys stay on host)
# - "keys": Mount SSH keys directly (less secure)
SSH_MODE="${CLAUDE_SSH_MODE:-none}"

# Firewall mode:
# - "off": No firewall (default, full network access)
# - "on": Enable firewall to restrict network access to approved domains only
FIREWALL_MODE="${CLAUDE_FIREWALL_MODE:-on}"

# Get the git root to mount the whole repo
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [[ -z "$GIT_ROOT" ]]; then
  MOUNT_DIR="$PWD"
  WORKDIR="/workspace"
else
  MOUNT_DIR="$GIT_ROOT"
  # Calculate relative path from git root to current dir
  REL_PATH="${PWD#$GIT_ROOT}"
  WORKDIR="/workspaces/aztec-packages${REL_PATH}"
fi

# Claude Code config directory (credentials, settings)
CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CLAUDE_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/claude-code"

# On linux, align uid/gid so files have correct ownership
ID_ARGS=""
if [[ "$OSTYPE" == "linux"* ]]; then
  ID_ARGS="-e LOCAL_USER_ID=$(id -u) -e LOCAL_GROUP_ID=$(id -g)"
fi

# Build mount arguments for Claude credentials
CLAUDE_MOUNTS=""
if [[ -d "$CLAUDE_HOME" ]]; then
  CLAUDE_MOUNTS="$CLAUDE_MOUNTS -v$CLAUDE_HOME:/home/aztec-dev/.claude:rw"
fi
if [[ -d "$CLAUDE_CONFIG" ]]; then
  CLAUDE_MOUNTS="$CLAUDE_MOUNTS -v$CLAUDE_CONFIG:/home/aztec-dev/.config/claude-code:rw"
fi

# SSH access based on mode
SSH_ARGS=""
case "$SSH_MODE" in
  none)
    # No SSH access (default)
    ;;
  agent)
    # Mount SSH agent socket - keys stay on host, works with hardware keys
    if [[ -n "${SSH_AUTH_SOCK:-}" ]]; then
      echo "SSH mode: agent (forwarding SSH agent socket)"
      SSH_ARGS="-v$SSH_AUTH_SOCK:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent"
    else
      echo "Warning: SSH_AUTH_SOCK not set, cannot forward SSH agent"
    fi
    # Still mount known_hosts for host verification
    if [[ -f "$HOME/.ssh/known_hosts" ]]; then
      SSH_ARGS="$SSH_ARGS -v$HOME/.ssh/known_hosts:/home/aztec-dev/.ssh/known_hosts:ro"
    fi
    ;;
  keys)
    # Mount SSH keys directly (less secure, use agent mode when possible)
    echo "SSH mode: keys (mounting SSH keys directly - consider using 'agent' mode instead)"
    if [[ -f "$HOME/.ssh/id_rsa" ]]; then
      SSH_ARGS="-v$HOME/.ssh/id_rsa:/home/aztec-dev/.ssh/id_rsa:ro"
    elif [[ -f "$HOME/.ssh/id_ed25519" ]]; then
      SSH_ARGS="-v$HOME/.ssh/id_ed25519:/home/aztec-dev/.ssh/id_ed25519:ro"
    fi
    if [[ -f "$HOME/.ssh/known_hosts" ]]; then
      SSH_ARGS="$SSH_ARGS -v$HOME/.ssh/known_hosts:/home/aztec-dev/.ssh/known_hosts:ro"
    fi
    ;;
  *)
    echo "Unknown CLAUDE_SSH_MODE: $SSH_MODE"
    echo "Valid options: none, agent, keys"
    exit 1
    ;;
esac

# Git config (read-only)
GIT_MOUNTS=""
if [[ -f "$HOME/.gitconfig" ]]; then
  GIT_MOUNTS="-v$HOME/.gitconfig:/home/aztec-dev/.gitconfig:ro"
fi

# Network mode:
# - Default is bridge networking (isolated from host)
# - Host networking shares the host's network namespace (DANGEROUS with firewall!)
NETWORK_ARGS=""
if [[ "${CLAUDE_USE_HOST_NETWORK:-0}" == "1" ]]; then
  NETWORK_ARGS="--network=host"
  # Firewall MUST be disabled with host networking - it would modify host iptables!
  if [[ "$FIREWALL_MODE" == "on" ]]; then
    echo "ERROR: Cannot use firewall with host networking - it would modify your host's iptables!"
    echo "Either set CLAUDE_USE_HOST_NETWORK=0 (default) or CLAUDE_FIREWALL_MODE=off"
    exit 1
  fi
fi

# Mount VS Code server directory if it exists (for extension data sharing)
VSCODE_MOUNTS=""
if [[ -d "$HOME/.vscode-server" ]]; then
  VSCODE_MOUNTS="-v$HOME/.vscode-server:/home/aztec-dev/.vscode-server"
fi

# Docker support based on mode
DOCKER_ARGS=""
case "$DOCKER_MODE" in
  none)
    # No Docker support - most secure, sufficient for most Claude Code tasks
    echo "Docker mode: none (no container spawning support)"
    ;;
  socket)
    # Mount host Docker socket - containers run on host, less isolation
    echo "Docker mode: socket (using host Docker daemon)"
    DOCKER_ARGS="-v/var/run/docker.sock:/var/run/docker.sock"
    ;;
  dind)
    # Docker-in-Docker with specific capabilities
    echo "Docker mode: dind (Docker-in-Docker with specific capabilities)"
    DOCKER_ARGS="--cap-add=SYS_ADMIN --cap-add=NET_ADMIN --cap-add=MKNOD"
    DOCKER_ARGS="$DOCKER_ARGS --security-opt seccomp=unconfined"
    DOCKER_ARGS="$DOCKER_ARGS --security-opt apparmor=unconfined"
    DOCKER_ARGS="$DOCKER_ARGS -vdevbox-var-lib-docker:/var/lib/docker"
    ;;
  privileged)
    # Full privileged mode - guaranteed to work but least secure
    echo "Docker mode: privileged (full access)"
    DOCKER_ARGS="--privileged -vdevbox-var-lib-docker:/var/lib/docker"
    ;;
  *)
    echo "Unknown CLAUDE_DOCKER_MODE: $DOCKER_MODE"
    echo "Valid options: none, socket, dind, privileged"
    exit 1
    ;;
esac

# Firewall setup command
FIREWALL_CMD=""
if [[ "$FIREWALL_MODE" == "on" ]]; then
  echo "Firewall: enabled (network restricted to approved domains)"
  FIREWALL_CMD="sudo /usr/local/bin/init-firewall.sh && "
else
  echo "Firewall: disabled (full network access)"
fi

echo "Starting container with image $IMAGE..."
echo "Mounting: $MOUNT_DIR -> /workspaces/aztec-packages"
echo "Working directory: $WORKDIR"
[[ -n "$CLAUDE_MOUNTS" ]] && echo "Claude credentials mounted" || true

docker run \
  -it --rm \
  --hostname claude-devbox \
  -e SSH_CONNECTION=' ' \
  -e DOCKER_CONFIG=/home/aztec-dev/.docker-devbox \
  -e TERM="${TERM:-xterm-256color}" \
  -e HOME=/home/aztec-dev \
  ${ID_ARGS} \
  -w"$WORKDIR" \
  -v"$MOUNT_DIR":/workspaces/aztec-packages \
  $CLAUDE_MOUNTS \
  $SSH_ARGS \
  $GIT_MOUNTS \
  $VSCODE_MOUNTS \
  $NETWORK_ARGS \
  $DOCKER_ARGS \
  "$IMAGE" \
  /bin/bash -c "${FIREWALL_CMD}claude --dangerously-skip-permissions"
