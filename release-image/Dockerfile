# Create our final slim image.
FROM aztecprotocol/release-image-base
# Copy in project files.
COPY . /usr/src

# We do a short (~3 second) forge build of 3 stubborn files to make sure the cache has all entries.
# This saves time when users make a local network.
# This is impossibly finicky to get right from outside the container, due to having a different set of files.
RUN cd /usr/src/l1-contracts && \
    forge build && \
    # Remove test files from the cache that cause warnings.
    cache="cache/solidity-files-cache.json" && \
    jq '.files |= with_entries(select(.key | endswith(".t.sol") | not))' "$cache" > "$cache.tmp" && mv "$cache.tmp" "$cache"

# Even after that, we want to make sure that forge COULD force a rebuild for FOUNDRY_PROFILE=production.
# This is used in the prod deploy. As well, --broadcast writes to l1-contracts/broadcast.
RUN mkdir -p /usr/src/l1-contracts/broadcast && \
    chmod -R a+rwX /usr/src/l1-contracts/out /usr/src/l1-contracts/cache /usr/src/l1-contracts/broadcast

ARG BUILD_METADATA=""
ENV BUILD_METADATA=$BUILD_METADATA

# Provide paths to bb and acvm for use in yarn-project, also create default working directories for each
ENV BB_WORKING_DIRECTORY=/usr/src/bb
ENV BB_BINARY_PATH=/usr/src/barretenberg/cpp/build/bin/bb-avm
ENV ACVM_WORKING_DIRECTORY=/usr/src/acvm
ENV ACVM_BINARY_PATH=/usr/src/noir/noir-repo/target/release/acvm
RUN mkdir -p $BB_WORKING_DIRECTORY $ACVM_WORKING_DIRECTORY && chmod 777 $BB_WORKING_DIRECTORY $ACVM_WORKING_DIRECTORY
WORKDIR "/usr/src/yarn-project"

# Ensure the correct version shows in aztec --version
ARG VERSION
RUN echo '{".": "'$VERSION'"}' > /usr/src/.release-please-manifest.json

ENTRYPOINT ["node", "--no-warnings", "/usr/src/yarn-project/aztec/dest/bin/index.js"]
