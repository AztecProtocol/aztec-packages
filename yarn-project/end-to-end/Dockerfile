FROM aztecprotocol/yarn-project-base

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