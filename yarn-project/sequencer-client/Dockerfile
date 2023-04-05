FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

# (1) project
COPY sequencer-client sequencer-client

# (2) dependencies
COPY circuits.js circuits.js

# (2) build
WORKDIR /usr/src/yarn-project/sequencer-client
RUN yarn build && yarn formatting

# (2.5) test
RUN yarn test

# (3) Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

# (4) set up entry point
FROM node:18-alpine
COPY --from=builder /usr/src/yarn-project /usr/src/yarn-project
WORKDIR /usr/src/yarn-project/sequencer-client
ENTRYPOINT ["yarn", "test"]
