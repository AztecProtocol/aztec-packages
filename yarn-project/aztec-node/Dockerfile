FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

# Copy in the whole of yarn-project.
COPY . .

# Build circuits.js to ensure wasm is in the dest folder.
WORKDIR /usr/src/yarn-project/circuits.js
RUN yarn build

WORKDIR /usr/src/yarn-project/aztec-node
RUN yarn build && yarn formatting && yarn test

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM node:18-alpine
COPY --from=builder /usr/src/yarn-project/aztec-node /usr/src/yarn-project/aztec-node
WORKDIR /usr/src/yarn-project/aztec-node
ENTRYPOINT ["yarn"]