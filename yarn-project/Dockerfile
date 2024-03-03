FROM --platform=linux/amd64 aztecprotocol/bb.js as bb.js
FROM --platform=linux/amd64 aztecprotocol/noir-packages as noir-packages
FROM --platform=linux/amd64 aztecprotocol/l1-contracts as contracts
FROM --platform=linux/amd64 aztecprotocol/noir-projects as noir-projects

FROM node:18.19.0 as builder
RUN apt update && apt install -y jq curl perl && rm -rf /var/lib/apt/lists/* && apt-get clean

# Copy in portalled packages.
COPY --from=bb.js /usr/src/barretenberg/ts /usr/src/barretenberg/ts
COPY --from=noir-packages /usr/src/noir/packages /usr/src/noir/packages
COPY --from=contracts /usr/src/l1-contracts /usr/src/l1-contracts
COPY --from=noir-projects /usr/src/noir-projects /usr/src/noir-projects

WORKDIR /usr/src/yarn-project
COPY . .

# We install a symlink to yarn-project's node_modules at a location that all portalled packages can find as they
# walk up the tree as part of module resolution. The supposedly idiomatic way of supporting module resolution
# correctly for portalled packages, is to use --preserve-symlinks when running node.
# This does kind of work, but jest doesn't honor it correctly, so this seems like a neat workaround.
# Also, --preserve-symlinks causes duplication of portalled instances such as bb.js, and breaks the singleton logic
# by initialising the module more than once. So at present I don't see a viable alternative.
RUN ln -s /usr/src/yarn-project/node_modules /usr/src/node_modules

# TODO: Replace puppeteer with puppeteer-core to avoid this.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN ./bootstrap.sh
RUN yarn workspaces focus @aztec/cli @aztec/aztec @aztec/aztec-faucet @aztec/aztec.js --production && yarn cache clean

# TODO: Use release-please to update package.json directly, and remove this!
# It's here to ensure the image rebuilds if the commit tag changes (as the content hash won't).
ARG COMMIT_TAG=""
RUN ./scripts/version_packages.sh

# We no longer need nargo.
RUN rm -rf /usr/src/noir/noir-repo

# Create fresh minimal size image.
# Installs our specific version of node, stripping out the unnecessary.
# We could probably just apt install nodejs, but it's both a different version, and seemingly a bit slower.
FROM ubuntu:lunar
ARG COMMIT_TAG=""
ENV COMMIT_TAG=$COMMIT_TAG
# RUN apt update && apt install -y nodejs && rm -rf /var/lib/apt/lists/* && apt-get clean
RUN apt update && apt install -y curl && rm -rf /var/lib/apt/lists/* && apt-get clean
ENV NODE_VERSION=18.19.0
RUN ARCH= && \
  dpkgArch="$(dpkg --print-architecture)" && \
  case "${dpkgArch##*-}" in \
  amd64) ARCH='x64';; \
  arm64) ARCH='arm64';; \
  *) echo "unsupported architecture"; exit 1 ;; \
  esac && \
  curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.gz" && \
  tar zxf "node-v$NODE_VERSION-linux-$ARCH.tar.gz" -C /usr --strip-components=1 --no-same-owner \
  --exclude "*/share/*" \
  --exclude "*/bin/corepack" \
  --exclude "*/bin/npx" \
  --exclude "*/bin/npm" \
  --exclude "*/corepack/*" \
  --exclude "*/npm/man/*" \
  --exclude "*/npm/docs/*" \
  --exclude "*/include/*" && \
  rm "node-v$NODE_VERSION-linux-$ARCH.tar.gz" && \
  node --version
COPY --from=builder /usr/src /usr/src
ENTRYPOINT ["/usr/bin/node"]
