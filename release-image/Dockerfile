# Create our final slim image.
FROM aztecprotocol/release-image-base
# Copy in project files.
COPY . /usr/src

ARG BUILD_METADATA=""
ENV BUILD_METADATA=$BUILD_METADATA

# Provide paths to bb and acvm for use in yarn-project, also create default working directories for each
ENV BB_WORKING_DIRECTORY=/usr/src/bb
ENV BB_BINARY_PATH=/usr/src/barretenberg/cpp/build/bin/bb
ENV ACVM_WORKING_DIRECTORY=/usr/src/acvm
ENV ACVM_BINARY_PATH=/usr/src/noir/noir-repo/target/release/acvm
RUN mkdir -p $BB_WORKING_DIRECTORY $ACVM_WORKING_DIRECTORY && chmod 777 $BB_WORKING_DIRECTORY $ACVM_WORKING_DIRECTORY
WORKDIR "/usr/src/yarn-project"

# Ensure the correct version shows in aztec --version
ARG VERSION
RUN echo '{".": "'$VERSION'"}' > /usr/src/.release-please-manifest.json

ENTRYPOINT ["/bin/bash", "-c", "node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js"]
