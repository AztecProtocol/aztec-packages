FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

# (1) project
COPY world-state world-state
# (2) dependencies
COPY foundation foundation
COPY ethereum.js ethereum.js
COPY barretenberg.js barretenberg.js
COPY l1-contracts l1-contracts
COPY circuits.js circuits.js
COPY l2-block l2-block
COPY merkle-tree merkle-tree

# (3) build
WORKDIR /usr/src/yarn-project/world-state
RUN yarn build && yarn formatting

# (3.5) test
RUN yarn test

# (4) Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

# (5) set up entry point
FROM node:18-alpine
COPY --from=builder /usr/src/yarn-project/world-state /usr/src/yarn-project/world-state
WORKDIR /usr/src/yarn-project/world-state
ENTRYPOINT ["yarn", "test"]