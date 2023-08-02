FROM node:18-alpine AS builder

# Build smoke-test
WORKDIR /usr/src/yarn-project/smoke-test
RUN yarn build && yarn formatting

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

# Create final, minimal size image.
FROM node:18-alpine
RUN apk update && apk add --no-cache curl jq bash
COPY --from=builder /usr/src /usr/src
WORKDIR /usr/src/yarn-project/smoke-test
ENTRYPOINT ["yarn", "test"]