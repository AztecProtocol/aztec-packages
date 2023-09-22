FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

# Copy in the whole of yarn-project.
COPY . .

# Build aztec.js web.
WORKDIR /usr/src/yarn-project/aztec.js
RUN yarn build
RUN yarn cache clean

# Build end-to-end.
WORKDIR /usr/src/yarn-project/end-to-end
RUN yarn build && yarn formatting

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

# Create final, minimal size image.
FROM ghcr.io/puppeteer/puppeteer:20.9.0
# RUN apk update && apk add --no-cache udev ttf-freefont google-chrome
RUN ls /usr/bin/google-chrome-stable
ENV CHROME_BIN="/usr/bin/google-chrome-stable" PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"
COPY --from=builder /usr/src /usr/src

# Use root to delete files
USER root
RUN rm /usr/src/yarn-project/end-to-end/src/web/aztec3-circuits.wasm
RUN rm /usr/src/yarn-project/end-to-end/src/web/main.js
COPY --from=builder /usr/src/circuits/cpp/build-wasm/bin/aztec3-circuits.wasm /usr/src/yarn-project/end-to-end/src/web/aztec3-circuits.wasm
COPY --from=builder /usr/src/yarn-project/aztec.js/dest/main.js /usr/src/yarn-project/end-to-end/src/web/main.js
WORKDIR /usr/src/yarn-project/end-to-end

# Use suggested user by puppeteer
USER pptruser

# Run everything after as non-privileged user.
ENTRYPOINT ["yarn", "test"]