FROM yarn-project-base

COPY noir-contracts noir-contracts
WORKDIR /usr/src/yarn-project/noir-contracts
RUN yarn build && yarn formatting && yarn test

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM node:18-alpine
COPY --from=builder /usr/src/yarn-project/noir-contracts /usr/src/yarn-project/noir-contracts
WORKDIR /usr/src/yarn-project/noir-contracts
ENTRYPOINT ["yarn"]