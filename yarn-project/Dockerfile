# This base dockerfile adds all the remaining source files and builds the project.
# See yarn-project-base/Dockerfile for why we have separate base Dockerfile.
FROM aztecprotocol/bb.js as bb.js
FROM aztecprotocol/noir-packages as noir-packages
FROM aztecprotocol/l1-contracts as contracts
FROM aztecprotocol/noir-projects as noir-projects
FROM aztecprotocol/boxes-files as boxes-files

FROM node:18.19.0
RUN apt update && apt install -y jq curl perl && rm -rf /var/lib/apt/lists/* && apt-get clean

# Copy in portalled packages.
COPY --from=bb.js /usr/src/barretenberg/ts /usr/src/barretenberg/ts
COPY --from=noir-packages /usr/src/noir/packages /usr/src/noir/packages
COPY --from=contracts /usr/src/l1-contracts /usr/src/l1-contracts
COPY --from=noir-projects /usr/src/noir-projects /usr/src/noir-projects
COPY --from=boxes-files /usr/src/boxes /usr/src/boxes

WORKDIR /usr/src/yarn-project
COPY . .

# We install a symlink to yarn-project's node_modules at a location that all portalled packages can find as they
# walk up the tree as part of module resolution. The supposedly idiomatic way of supporting module resolution
# correctly for portalled packages, is to use --preserve-symlinks when running node.
# This does kind of work, but jest doesn't honor it correctly, so this seems like a neat workaround.
# Also, --preserve-symlinks causes duplication of portalled instances such as bb.js, and breaks the singleton logic
# by initialising the module more than once. So at present I don't see a viable alternative.
RUN ln -s /usr/src/yarn-project/node_modules /usr/src/node_modules

RUN ./bootstrap.sh

# Check package.json inheritance and tsconfig project references.
RUN yarn prepare:check

ENTRYPOINT ["yarn"]