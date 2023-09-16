# This base dockerfile adds all the remaining source files, and performs artifact generation.
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base-deps as noir_types
# Copy in the entire workspace.
COPY . .
# Generate Aztec.nr contract artifacts
COPY --from=noir /usr/src/yarn-project/noir-contracts/src/contracts /usr/src/yarn-project/noir-contracts/src/contracts
COPY --from=noir /usr/src/yarn-project/noir-contracts/target /usr/src/yarn-project/noir-contracts/target
WORKDIR /usr/src/yarn-project/noir-contracts
# Run yarn build to have the json ABIs available for the types generator
RUN yarn build
RUN ./scripts/types_all.sh
# Run yarn build again to build the types
RUN yarn build

# Take Aztec.nr contract artifacts into the final build image
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base-deps as builder
COPY . .
Generate TS-importable contract artifacts
RUN cd l1-artifacts && ./scripts/generate-artifacts.sh
# COPY --from=noir_types /usr/src/yarn-project/noir-contracts/src/artifacts /usr/src/yarn-project/noir-contracts/src/artifacts
# COPY --from=noir_types /usr/src/yarn-project/noir-contracts/src/types /usr/src/yarn-project/noir-contracts/src/types
