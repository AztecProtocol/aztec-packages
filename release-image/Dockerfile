FROM aztecprotocol/build:3.0 AS build
# Copy files explicitly listed in .dockerignore into container.
COPY . /usr/src
# Install yarn-project production dependencies.
# Explicitly specify projects that we use to keep as slim as possible.
WORKDIR /usr/src/yarn-project
RUN yarn workspaces focus @aztec/aztec @aztec/cli-wallet --production && rm -rf .yarn*
# We install a symlink to yarn-project's node_modules at a location that all portalled packages can find as they
# walk up the tree as part of module resolution. The supposedly idiomatic way of supporting module resolution
# correctly for portalled packages, is to use --preserve-symlinks when running node.
# However I noticed --preserve-symlinks causes duplication of portalled instances such as bb.js, breaking the singleton
# logic by initialising the module more than once. So at present I don't see a viable alternative.
RUN ln -s /usr/src/yarn-project/node_modules /usr/src/node_modules

# Create our final slim image.
FROM ubuntu:noble
# Install node 18.19.1
RUN apt update && apt install -y \
      curl \
      ca-certificates \
      git \
      gnupg \
      netcat-openbsd && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt update && apt install -y nodejs=18.19.1-1nodesource1 && \
    rm -rf /var/lib/apt/lists/*
# Install foundry.
COPY --from=build /opt/foundry /opt/foundry
ENV PATH="/opt/foundry/bin:$PATH"
# Copy in project files.
COPY --from=build /usr/src /usr/src
WORKDIR "/usr/src/yarn-project"
