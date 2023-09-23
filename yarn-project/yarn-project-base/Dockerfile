# This base dockerfile is for caching the workspace dependencies and running workspace checks.
# The dockerignore file ensures the context only contains package.json and tsconfig.json files.
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/circuits-wasm-linux-clang as circuits
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/l1-contracts as contracts

FROM node:18-alpine AS builder
RUN apk update && apk add --no-cache bash jq
WORKDIR /usr/src/yarn-project
# The dockerignore file ensures the context only contains package.json and tsconfig.json files.
COPY . .

# Install all workspace dependencies. There are issues with doing this naively.
#  - A non pnp install is many 100's MB larger. We use .yarnrc.prod.yml to enable pnp in docker.
#  - Yarn devs won't provide the ability to prune dev dependencies from the local cache:
#    https://github.com/yarnpkg/berry/issues/1789
#    This means we need a global cache, so we can clean the cache and reinstall prod modules without redownloading.
#  - The default global cache and local cache are simply copies, not hardlinks, thus doubling the size of modules.
#
# To work around this, we will construct a global cache from the local cache using hard links (requires a hacky rename).
# As long as file creation and hardlinks are created within the same layer it takes no additional space. Genius!
#
# When we build a downstream docker image, we:
# - Do the build in a named "builder" stage.
# - Erase the local cache with a `yarn cache clean`. Files will remain in global cache due to hard link.
# - Do a `yarn workspaces focus --production` to install production dependencies from the global cache, to .yarn/cache
# - Create a final stage from desired output, stripping away the global cache layer.
#
# TODO: puppeteer is adding ~300MB to this image (part of canary). Pull it out of the workspace?
# At time of writing, the image size is 773MB.
RUN mv .yarnrc.prod.yml .yarnrc.yml && yarn --immutable && /bin/bash -c '\
  cd .yarn/cache && \
  mkdir -p /root/.yarn/berry/cache && \
  for F in *; do \
    [[ $F =~ (.*-) ]] && ln $F /root/.yarn/berry/cache/${BASH_REMATCH[1]}8.zip; \
  done'

# If everything's worked properly, we should no longer need access to the network.
RUN echo "enableNetwork: false" >> .yarnrc.yml

# Check package.json inheritence and tsconfig project references.
RUN yarn prepare:check

# Bring in circuits wasms.
COPY --from=circuits /usr/src/circuits/cpp/build-wasm/bin /usr/src/circuits/cpp/build-wasm/bin

# Generate L1 contract TypeScript artifacts.
COPY --from=contracts /usr/src/l1-contracts/out /usr/src/l1-contracts/out
RUN cd l1-artifacts && ./scripts/generate-artifacts.sh