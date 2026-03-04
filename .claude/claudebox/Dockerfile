FROM aztecprotocol/devbox:3.0

ARG UID=30079
ARG GID=30079

# Remap aztec-dev to match host UID/GID (same as devbox entrypoint does at runtime,
# but we do it at build time since we run with --user instead of gosu).
RUN groupmod -g $GID aztec-dev && \
    usermod -u $UID -g $GID aztec-dev && \
    chown -R $UID:$GID /home/aztec-dev && \
    mkdir -p /workspace && chown $UID:$GID /workspace

# Use bash as default shell (not zsh — Claude's Bash tool uses login shell)
RUN chsh -s /bin/bash aztec-dev
ENV SHELL=/bin/bash
SHELL ["/bin/bash", "-c"]

# Git config: identity + safe.directory
RUN git config --system user.email "tech@aztec-labs.com" && \
    git config --system user.name "AztecBot" && \
    git config --system --add safe.directory /workspace/aztec-packages && \
    git config --system --add safe.directory /workspace/barretenberg-claude && \
    git config --system --add safe.directory /workspace

# SSH: trust bastion host
RUN printf "Host ci-bastion.aztecprotocol.com\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n  LogLevel ERROR\n" \
    > /etc/ssh/ssh_config.d/bastion.conf

# Bake in entrypoint + CLAUDE.md template (profile paths bind-mounted at runtime)
COPY container-entrypoint.sh /opt/claudebox/entrypoint.sh
COPY profiles/default/container-claude.md /opt/claudebox/container-claude.md
RUN chmod +x /opt/claudebox/entrypoint.sh
