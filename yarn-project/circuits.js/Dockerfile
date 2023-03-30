FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

COPY foundation foundation
COPY circuits.js circuits.js

WORKDIR /usr/src/yarn-project/foundation
RUN yarn build

RUN cp /usr/src/aztec3-circuits/cpp/build-wasm/bin/aztec3-circuits.wasm dest/wasm/barretenberg.wasm

WORKDIR /usr/src/yarn-project/circuits.js
RUN yarn build && yarn formatting && yarn test

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM alpine:latest
COPY --from=builder /usr/src/yarn-project/circuits.js /usr/src/yarn-project/circuits.js
WORKDIR /usr/src/yarn-project/merkle-tree
ENTRYPOINT ["yarn", "test"]