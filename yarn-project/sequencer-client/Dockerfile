FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

# (1) project
COPY sequencer-client sequencer-client

# (2) dependencies
COPY circuits.js circuits.js
COPY barretenberg.js barretenberg.js
COPY ethereum.js ethereum.js
COPY foundation foundation
COPY l1-contracts l1-contracts
COPY l2-block l2-block
COPY merkle-tree merkle-tree
COPY p2p p2p
COPY tx tx
COPY world-state world-state

# (3) build
WORKDIR /usr/src/yarn-project/sequencer-client
RUN yarn build && yarn formatting

# (3.5) test
RUN yarn test

# (4) Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

# (5) set up entry point
FROM node:18-alpine
COPY --from=builder /usr/src/yarn-project /usr/src/yarn-project
WORKDIR /usr/src/yarn-project/sequencer-client
ENTRYPOINT ["yarn", "test"]
