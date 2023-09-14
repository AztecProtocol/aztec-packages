# FROM node:18-alpine
FROM 278380418400.dkr.ecr.us-east-1.amazonaws.com/yarn-project-base AS builder

RUN apk update && apk add --no-cache udev ttf-freefont chromium curl jq bash
ENV CHROME_BIN="/usr/bin/chromium-browser" PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"

ARG COMMIT_TAG=""

# Build canary with external @aztec deps
COPY . .
WORKDIR /usr/src/yarn-project/canary
RUN ./scripts/update_packages.sh $COMMIT_TAG
RUN yarn && yarn build

RUN cp node_modules/@aztec/aztec.js/dest/main.js src/web/
RUN cp node_modules/@aztec/circuits.js/resources/aztec3-circuits.wasm src/web/

ENTRYPOINT ["yarn", "test"]