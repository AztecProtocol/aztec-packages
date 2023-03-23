FROM yarn-project-base as builder

COPY foundation foundation
COPY ethereum.js ethereum.js
WORKDIR /usr/src/yarn-project/ethereum.js
RUN ls /usr/src/yarn-project/node_modules/@aztec/*
RUN ls /usr/src/yarn-project/*
RUN yarn build && yarn formatting && yarn test

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM alpine:latest
COPY --from=builder /usr/src/yarn-project/ethereum.js /usr/src/yarn-project/ethereum.js
