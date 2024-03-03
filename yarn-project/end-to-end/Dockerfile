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
# Build web bundle for browser tests
RUN yarn workspace @aztec/end-to-end run build:web
RUN yarn workspaces focus @aztec/end-to-end --production && yarn cache clean

# We no longer need nargo etc.
RUN rm -rf /usr/src/noir/noir-repo /usr/src/noir-projects /usr/src/l1-contracts

# Create minimal image.
FROM node:18.19.1-slim
RUN apt-get update && apt-get install gnupg wget -y && \
    wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
    sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
    apt-get update && \
    apt-get install google-chrome-stable -y --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*
ENV CHROME_BIN="/usr/bin/google-chrome-stable"
COPY --from=builder /usr/src /usr/src
WORKDIR /usr/src/yarn-project/end-to-end
ENTRYPOINT ["yarn", "test"]

# FROM ubuntu:lunar
# RUN apt update && apt install -y curl jq && rm -rf /var/lib/apt/lists/* && apt-get clean
# # ENV CHROME_BIN="/usr/bin/chromium-browser"
# ENV NODE_VERSION=18.19.0
# RUN ARCH= && \
#   dpkgArch="$(dpkg --print-architecture)" && \
#   case "${dpkgArch##*-}" in \
#   amd64) ARCH='x64';; \
#   arm64) ARCH='arm64';; \
#   *) echo "unsupported architecture"; exit 1 ;; \
#   esac && \
#   curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.gz" && \
#   tar zxf "node-v$NODE_VERSION-linux-$ARCH.tar.gz" -C /usr --strip-components=1 --no-same-owner \
#   --exclude "*/share/*" \
#   --exclude "*/bin/corepack" \
#   --exclude "*/bin/npx" \
#   --exclude "*/bin/npm" \
#   --exclude "*/corepack/*" \
#   --exclude "*/npm/man/*" \
#   --exclude "*/npm/docs/*" \
#   --exclude "*/include/*" && \
#   rm "node-v$NODE_VERSION-linux-$ARCH.tar.gz" && \
#   node --version
# # Yarn.
# ENV YARN_VERSION=1.22.19
# RUN curl -fsSLO --compressed "https://yarnpkg.com/downloads/$YARN_VERSION/yarn-v$YARN_VERSION.tar.gz" && \
#   mkdir -p /opt && \
#   tar -xzf yarn-v$YARN_VERSION.tar.gz -C /opt/ && \
#   ln -s /opt/yarn-v$YARN_VERSION/bin/yarn /usr/local/bin/yarn && \
#   ln -s /opt/yarn-v$YARN_VERSION/bin/yarnpkg /usr/local/bin/yarnpkg && \
#   rm yarn-v$YARN_VERSION.tar.gz && \
#   yarn --version
# COPY --from=builder /usr/src /usr/src
# WORKDIR /usr/src/yarn-project/end-to-end
# ENTRYPOINT ["yarn", "test"]