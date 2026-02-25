FROM aztecprotocol/devbox:3.0

ARG UID=30079
ARG GID=30079

# Create claude user matching host uid — needed for SSH, git, etc.
RUN groupadd -g $GID claude 2>/dev/null || true && \
    useradd -u $UID -g $GID -d /tmp/claudehome -s /bin/bash claude && \
    mkdir -p /tmp/claudehome/.ssh && \
    chown -R $UID:$GID /tmp/claudehome && \
    mkdir -p /workspace && chown $UID:$GID /workspace

# Git safe.directory for workspace
RUN git config --system --add safe.directory /workspace/aztec-packages && \
    git config --system --add safe.directory /workspace

# SSH: trust bastion host
RUN printf "Host ci-bastion.aztecprotocol.com\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n  LogLevel ERROR\n" \
    > /etc/ssh/ssh_config.d/bastion.conf

# Bake in entrypoint + CLAUDE.md template
COPY container-entrypoint.sh /opt/claudebox/entrypoint.sh
COPY container-claude.md /opt/claudebox/container-claude.md
RUN chmod +x /opt/claudebox/entrypoint.sh
