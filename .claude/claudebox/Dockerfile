FROM aztecprotocol/devbox:3.0

ARG UID=30079
ARG GID=30079

# Create claude user matching host uid — needed for SSH, git, etc.
RUN groupadd -g $GID claude 2>/dev/null || true && \
    useradd -u $UID -g $GID -d /tmp/claudehome -s /bin/bash claude && \
    mkdir -p /tmp/claudehome/.ssh && \
    chown -R $UID:$GID /tmp/claudehome && \
    mkdir -p /workspace && chown $UID:$GID /workspace

# Git config: identity + safe.directory
RUN git config --system user.email "tech@aztec-labs.com" && \
    git config --system user.name "AztecBot" && \
    git config --system --add safe.directory /workspace/aztec-packages && \
    git config --system --add safe.directory /workspace

# SSH: trust bastion host
RUN printf "Host ci-bastion.aztecprotocol.com\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n  LogLevel ERROR\n" \
    > /etc/ssh/ssh_config.d/bastion.conf

# Bake in entrypoint + CLAUDE.md template
COPY container-entrypoint.sh /opt/claudebox/entrypoint.sh
COPY container-claude.md /opt/claudebox/container-claude.md
RUN chmod +x /opt/claudebox/entrypoint.sh

# Docker shim — drop-in replacement that proxies through the MCP sidecar.
# Claude's container has no docker socket; all docker commands go through this.
COPY dockerbox /usr/local/bin/docker
RUN chmod +x /usr/local/bin/docker
