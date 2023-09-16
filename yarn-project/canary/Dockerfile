FROM 278380418400.dkr.ecr.us-east-2.amazonaws.com/yarn-project-base:cache-bac67d29a415980ebfdada76c76fbd4509313973 AS builder

RUN apk update && apk add --no-cache udev ttf-freefont chromium curl jq bash
ENV CHROME_BIN="/usr/bin/chromium-browser" PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"

ARG COMMIT_TAG="0.7.5"

COPY . .

# Setup & Build end-to-end package
WORKDIR /usr/src/yarn-project/end-to-end
RUN ./scripts/setup_canary.sh $COMMIT_TAG ../canary/scripts/extract_packages.sh
RUN ls
RUN cat package.json
RUN yarn && yarn build

# Build canary package
WORKDIR /usr/src/yarn-project/canary
# Update @aztec deps
RUN ./scripts/update_packages.sh $COMMIT_TAG
RUN yarn && yarn build

# Copy web artifacts for browser test
RUN cp ../node_modules/@aztec/aztec.js/dest/main.js src/web/
RUN cp ../node_modules/@aztec/circuits.js/resources/aztec3-circuits.wasm src/web/

ENTRYPOINT ["yarn", "test"]