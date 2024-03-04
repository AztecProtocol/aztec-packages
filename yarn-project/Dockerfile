FROM aztecprotocol/yarn-project-base AS builder
RUN yarn workspaces focus @aztec/cli @aztec/aztec --production && yarn cache clean

# TODO: Use release-please to update package.json directly, and remove this!
# It's here to ensure the image rebuilds if the commit tag changes (as the content hash won't).
ARG COMMIT_TAG=""
RUN ./scripts/version_packages.sh

# We no longer need nargo etc.
RUN rm -rf /usr/src/noir/noir-repo /usr/src/noir-projects /usr/src/l1-contracts

# Create minimal size image.
FROM node:18.19.1-slim
ARG COMMIT_TAG=""
ENV COMMIT_TAG=$COMMIT_TAG
COPY --from=builder /usr/src /usr/src
ENTRYPOINT ["yarn"]
