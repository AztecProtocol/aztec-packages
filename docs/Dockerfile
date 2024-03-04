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

WORKDIR /usr/src
COPY . .

# TODO: Replace puppeteer with puppeteer-core to avoid this.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /usr/src/yarn-project
RUN ./bootstrap.sh

WORKDIR /usr/src/docs
RUN yarn && yarn build