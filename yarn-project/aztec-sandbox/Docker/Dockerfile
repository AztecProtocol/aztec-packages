FROM yarn-project-base AS builder

COPY . .

WORKDIR /usr/src/yarn-project/aztec-sandbox
RUN yarn build
# && yarn formatting && yarn test

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM node:18-alpine
COPY --from=builder /usr/src/yarn-project/aztec-sandbox /usr/src/yarn-project/aztec-sandbox
WORKDIR /usr/src/yarn-project/aztec-sandbox
ENTRYPOINT ["yarn", "start"]
EXPOSE 8080