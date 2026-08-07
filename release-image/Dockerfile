# Create our final slim image.
FROM aztecprotocol/release-image-base
# Copy in project files.
COPY . /usr/src

ARG BUILD_METADATA=""
ENV BUILD_METADATA=$BUILD_METADATA

# Provide paths to bb and acvm for use in yarn-project, also create default working directories for each
ENV UV_THREADPOOL_SIZE=8
ENV BB_WORKING_DIRECTORY=/usr/src/bb
ENV BB_BINARY_PATH=/usr/src/barretenberg/cpp/build/bin/bb-avm
ENV ACVM_WORKING_DIRECTORY=/usr/src/acvm
ENV ACVM_BINARY_PATH=/usr/src/labs-aztec-toolchain/bin/acvm
RUN mkdir -p $BB_WORKING_DIRECTORY $ACVM_WORKING_DIRECTORY && chmod 777 $BB_WORKING_DIRECTORY $ACVM_WORKING_DIRECTORY
WORKDIR "/usr/src/yarn-project"

# Ensure the correct version shows in aztec --version
ARG VERSION
RUN echo '{".": "'$VERSION'"}' > /usr/src/.release-please-manifest.json
# Stamp the version into stdlib/package.json, which getPackageVersion() reads at runtime.
RUN jq --arg v "$VERSION" '.version = $v' /usr/src/yarn-project/stdlib/package.json > /tmp/p.json \
    && mv /tmp/p.json /usr/src/yarn-project/stdlib/package.json

# Stamp aztec_version into the shipped contract artifacts. The build-time stamp in
# noir-projects/labs/noir-contracts/bootstrap.sh writes "dev" unconditionally; $VERSION here is the authoritative release
# version for this image.
RUN for dir in \
        /usr/src/yarn-project/accounts/artifacts \
        /usr/src/yarn-project/noir-contracts.js/artifacts \
        /usr/src/yarn-project/noir-test-contracts.js/artifacts; do \
      for f in "$dir"/*.json; do \
        jq --arg v "$VERSION" '.aztec_version = $v' "$f" > /tmp/a.json && mv /tmp/a.json "$f"; \
      done; \
    done

ENTRYPOINT ["node", "--no-warnings", "/usr/src/yarn-project/aztec/dest/bin/index.js"]
