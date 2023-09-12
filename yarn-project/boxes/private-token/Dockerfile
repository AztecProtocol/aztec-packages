FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

COPY . .

# Build circuits.js
WORKDIR /usr/src/yarn-project/aztec.js
RUN yarn build
RUN yarn cache clean


WORKDIR /usr/src/yarn-project/boxes/private-token
RUN yarn build && yarn formatting && yarn test

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM node:18-alpine
COPY --from=builder /usr/src/yarn-project/boxes/private-token /usr/src/yarn-project/boxes/private-token
WORKDIR /usr/src/yarn-project/boxes/private-token
ENTRYPOINT ["yarn", "test:integration"]