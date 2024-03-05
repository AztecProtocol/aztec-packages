FROM aztecprotocol/yarn-project AS builder

# Build web bundle for browser tests
WORKDIR /usr/src/yarn-project/end-to-end
RUN yarn build:web

# Productionify. See comment in yarn-project-base/Dockerfile.
RUN yarn workspaces focus --production && yarn cache clean

# Create final, minimal size image.
# TODO: Not very minimal as chromium adds about 500MB of bloat :/ Separate or install at test runtime?
# Create fresh minimal size image.
# Installs our specific version of node, stripping out the unnecessary.
# We could probably just apt install nodejs, but it's both a different version, and seemingly a bit slower.
# We could also use distroless, to get us about 20mb off, but meh. It's actually useful to shell into containers.
#FROM gcr.io/distroless/nodejs18-debian12
FROM ubuntu:lunar

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
# Yarn is used for unboxing.
ENV YARN_VERSION=1.22.19
RUN curl -fsSLO --compressed "https://yarnpkg.com/downloads/$YARN_VERSION/yarn-v$YARN_VERSION.tar.gz" && \
  mkdir -p /opt && \
  tar -xzf yarn-v$YARN_VERSION.tar.gz -C /opt/ && \
  ln -s /opt/yarn-v$YARN_VERSION/bin/yarn /usr/local/bin/yarn && \
  ln -s /opt/yarn-v$YARN_VERSION/bin/yarnpkg /usr/local/bin/yarnpkg && \
  rm yarn-v$YARN_VERSION.tar.gz && \
  yarn --version

RUN apt update && apt install -y chromium-browser

ENV CHROME_BIN="/usr/bin/chromium-browser" PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" ACVM_BINARY_PATH="/usr/src/noir/noir-repo/target/release/acvm" ACVM_WORKING_DIRECTORY="/tmp/acvm"
COPY --from=builder /usr/src /usr/src

RUN ls /usr/src/noir/noir-repo/target/release

WORKDIR /usr/src/yarn-project/end-to-end

ENTRYPOINT ["yarn", "test"]
