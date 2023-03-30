FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

COPY foundation foundation
COPY circuits.js circuits.js

WORKDIR /usr/src/yarn-project/foundation
RUN yarn build

# TODO: It seems we're loading the wasm from dest and from src, depending on how we run,
# so we copy the wasm to both locations just in case, but we should set up a proper pipeline
# and location for the wasm.
RUN cp /usr/src/aztec3-circuits/cpp/build-wasm/bin/aztec3-circuits.wasm dest/wasm/aztec3-circuits.wasm
RUN cp /usr/src/aztec3-circuits/cpp/build-wasm/bin/aztec3-circuits.wasm src/wasm/aztec3-circuits.wasm

WORKDIR /usr/src/yarn-project/circuits.js
RUN yarn build && yarn formatting && yarn test

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM alpine:latest
COPY --from=builder /usr/src/yarn-project/circuits.js /usr/src/yarn-project/circuits.js
WORKDIR /usr/src/yarn-project/merkle-tree
ENTRYPOINT ["yarn", "test"]