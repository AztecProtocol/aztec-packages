FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project AS builder

COPY /usr/src/yarn-project/end-to-end /usr/src/end-to-end
COPY /usr/src/yarn-project/end-to-end /usr/src/end-to-end

# Setup & Build end-to-end package
WORKDIR /usr/src/end-to-end
# Extract canary @aztec dependencies
RUN ../canary/scripts/extract_packages.sh ../canary/package.json > ./target_pkgs.txt
# Update end-to-end dependencies with target version
RUN ./scripts/setup_canary.sh canary ./target_pkgs.txt
RUN rm ./target_pkgs.txt
# Need to yarn install & rebuild to apply changes (canary packages)
RUN yarn && yarn build

# Install & build canary in different dir
COPY --from=builder /usr/src/yarn-project/canary /usr/src/canary
WORKDIR /usr/src/canary
RUN ./scripts/update_packages.sh canary
RUN yarn && yarn build

FROM node:18-alpine AS intermediate
RUN apk update && apk add --no-cache udev ttf-freefont chromium curl jq bash
ENV CHROME_BIN="/usr/bin/chromium-browser" PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"

COPY --from=builder /usr/src/ /usr/src/
WORKDIR /usr/src/yarn-project/canary

WORKDIR /usr/src/yarn-project/canary
# Copy browser script
RUN cp ../end-to-end/scripts/start_e2e_ci_browser.sh ./scripts/start_e2e_ci_browser.sh
RUN chmod +x scripts/start_e2e_ci_browser.sh

RUN cp ./node_modules/@aztec/aztec.js/dest/main.js src/web/
RUN cp ./node_modules/@aztec/circuits.js/resources/aztec3-circuits.wasm src/web/

# Fresh image to copy over just the canary folder
FROM node:18-alpine

COPY --from=intermediate /usr/src/yarn-project/canary /usr/src/yarn-project/canary
COPY --from=intermediate /usr/src/yarn-project/end-to-end /usr/src/yarn-project/end-to-end
COPY --from=intermediate /usr/src/yarn-project/node_modules /usr/src/yarn-project/node_modules
COPY --from=intermediate /usr/src/yarn-project/package.json /usr/src/yarn-project/package.json
COPY --from=intermediate /usr/src/yarn-project/yarn.lock /usr/src/yarn-project/yarn.lock

WORKDIR /usr/src/yarn-project/canary

ENTRYPOINT ["yarn", "test"]
