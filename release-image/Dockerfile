# Create our final slim image.
FROM aztecprotocol/release-image-base
# Copy in project files.
COPY . /usr/src

# Create proofs directory and copy proofs if they exist
# Proofs should be copied to yarn-project/cli/dest/proofs by the build script
RUN mkdir -p /usr/src/proofs && \
    if [ -d /usr/src/yarn-project/cli/dest/proofs ]; then \
      echo "Found proofs in dest directory, copying..." && \
      cp /usr/src/yarn-project/cli/dest/proofs/*.bin /usr/src/proofs/ && \
      echo "Proofs copied:" && \
      ls -la /usr/src/proofs/; \
    else \
      echo "No proofs found in /usr/src/yarn-project/cli/dest/proofs"; \
    fi

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

ENTRYPOINT ["node", "--no-warnings", "/usr/src/yarn-project/aztec/dest/bin/index.js"]
