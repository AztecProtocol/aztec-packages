# This base dockerfile adds all the remaining source files, performs artifact generation, and builds the project.
# See yarn-project-base/Dockerfile for deeper insight into why things are how they are.
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/noir-contracts-build as noir
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base as builder

# Copy in the entire workspace.
COPY . .

# Generate Noir contract TypeScript artifacts.
COPY --from=noir /usr/src/yarn-project/noir-contracts/target /usr/src/yarn-project/noir-contracts/target
# Run yarn build to have the json ABIs available for the types generator, generate types, build again.
RUN apk add perl
RUN cd /usr/src/yarn-project/noir-contracts && yarn build && ./scripts/types_all.sh && yarn build
# Cleanup to reduce final image size.
RUN rm -rf noir-contracts/target

# Build the entire project and check formatting.
RUN yarn tsc -b
RUN yarn formatting

# We're happy. We now now enable pnp and create a slimmed down final image.
# This significantly improves build times and results in smaller final containers for users to download.
# Don't sacrifice this unless you've really hit some kind of wall.
# This effectively removes all the node_modules folders, just leaving the zipped packages in the global/local caches.
RUN mv .yarnrc.prod.yml .yarnrc.yml && yarn

# Create final slim image.
FROM node:18-alpine
COPY --from=builder /usr/src /usr/src
WORKDIR /usr/src/yarn-project
ENTRYPOINT ["yarn"]
