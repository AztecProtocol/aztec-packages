# This base dockerfile adds all the remaining source files, performs artifact generation, and builds the project.
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base-deps as noir_types

# Copy in the entire workspace.
COPY . .

# Generate Noir contract TypeScript artifacts.
# Run yarn build to have the json ABIs available for the types generator, generate types, build again.
# COPY --from=noir /usr/src/yarn-project/noir-contracts/src/contracts /usr/src/yarn-project/noir-contracts/src/contracts
RUN cd /usr/src/yarn-project/noir-contracts && yarn build && ./scripts/types_all.sh && yarn build

# Build the entire project and check formatting.
RUN yarn tsc -b && yarn formatting