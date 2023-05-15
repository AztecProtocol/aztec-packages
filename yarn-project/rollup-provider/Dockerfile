FROM yarn-project-base AS builder

COPY . .

WORKDIR /usr/src/yarn-project/rollup-provider
RUN yarn build && yarn formatting

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM node:18-alpine
COPY --from=builder /usr/src/ /usr/src/
WORKDIR /usr/src/yarn-project/rollup-provider
ENTRYPOINT ["yarn"]