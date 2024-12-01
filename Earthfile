VERSION 0.8

########################################################################################################################
# Builds
########################################################################################################################

bootstrap-noir-bb:
  # Note: Assumes EARTHLY_GIT_HASH has been pushed!
  FROM ./build-images+from-registry
  ENV AZTEC_CACHE_COMMIT=6abb3ef82027151716dfb7f22fa655cf8f119168
  ARG EARTHLY_GIT_HASH
  # ENV EARTHLY_GIT_HASH=5a325d3cac201bbc684d6bfb93982686b72f0cfd
  WORKDIR /build-volume
  # Use a cache volume for performance
  RUN --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/build-volume \
    rm -rf $(ls -A) && \
    git init 2>/dev/null && \
    git remote add origin https://github.com/aztecprotocol/aztec-packages 2>/dev/null && \
    git fetch --depth 1 origin $AZTEC_CACHE_COMMIT 2>/dev/null && \
    (git fetch --depth 1 origin $EARTHLY_GIT_HASH 2>/dev/null || (echo "The commit was not pushed, run aborted." && exit 1)) && \
    git reset --hard FETCH_HEAD && \
    echo "noir: " && BUILD_SYSTEM_DEBUG=1 CI=1 TEST=0 USE_CACHE=1 ./noir/bootstrap.sh && \
    echo "barretenberg: " && BUILD_SYSTEM_DEBUG=1 CI=1 TEST=0 USE_CACHE=1 ./barretenberg/bootstrap.sh && \
    mv $(ls -A) /usr/src
  WORKDIR /usr/src
  SAVE ARTIFACT /usr/src /usr/src

bootstrap:
  # Note: Assumes EARTHLY_GIT_HASH has been pushed!
  FROM ./build-images+from-registry
  ENV AZTEC_CACHE_COMMIT=6abb3ef82027151716dfb7f22fa655cf8f119168
  ARG EARTHLY_GIT_HASH
  # ENV EARTHLY_GIT_HASH=5a325d3cac201bbc684d6bfb93982686b72f0cfd
  WORKDIR /build-volume
  # Use a cache volume for performance
  RUN --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/build-volume \
    rm -rf $(ls -A) && \
    git init 2>/dev/null && \
    git remote add origin https://github.com/aztecprotocol/aztec-packages 2>/dev/null && \
    git fetch --depth 1 origin $AZTEC_CACHE_COMMIT 2>/dev/null && \
    (git fetch --depth 1 origin $EARTHLY_GIT_HASH 2>/dev/null || (echo "The commit was not pushed, run aborted." && exit 1)) && \
    git reset --hard FETCH_HEAD && \
    CI=1 TEST=0 ./bootstrap.sh fast && \
    mv $(ls -A) /usr/src
  WORKDIR /usr/src
  SAVE ARTIFACT /usr/src /usr/src

bootstrap-release-base:
  FROM +bootstrap
  RUN rm -rf \
    .git \
    .github \
    .yarn \
    noir-projects \
    l1-contracts \
    barretenberg/cpp/src \
    barretenberg/ts/src \
    ci3 \
    build-system \
    docs

bootstrap-aztec:
  FROM +bootstrap-release-base
  WORKDIR /usr/src/yarn-project
  ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
  ENV DENOISE=1
  # TODO Copied from yarn-project+build, move into bootstrap.sh before yarn test
  RUN cd ivc-integration && npx playwright install && npx playwright install-deps
  RUN rm -rf node_modules && yarn workspaces focus @aztec/aztec --production && yarn cache clean
  COPY --dir +rollup-verifier-contract/usr/src/bb /usr/src
  WORKDIR /usr/src
  # Focus on the biggest chunks to remove
  RUN rm -rf \
    yarn-project/end-to-end \
    yarn-project/noir-protocol-circuits-types \
    yarn-project/*/src
  SAVE ARTIFACT /usr/src /usr/src

bootstrap-faucet:
  FROM +bootstrap-release-base
  RUN rm -rf node_modules && yarn workspaces focus @aztec/aztec-faucet --production && yarn cache clean
  RUN rm -rf \
    aztec.js/dest/main.js \
    end-to-end \
    **/src
  SAVE ARTIFACT /usr/src /usr/src

# We care about creating a slimmed down e2e image because we have to serialize it from earthly to docker for running.
bootstrap-end-to-end:
  FROM +bootstrap-release-base
  WORKDIR /usr/src/yarn-project
  RUN rm -rf node_modules && yarn workspaces focus @aztec/end-to-end @aztec/cli-wallet --production && yarn cache clean
  COPY --dir +rollup-verifier-contract/usr/src/bb /usr/src
  SAVE ARTIFACT /usr/src /usr/src
  SAVE ARTIFACT /opt/foundry/bin/anvil

########################################################################################################################
# Build helpers
########################################################################################################################

bb-cli:
    FROM +bootstrap-release-base
    ENV BB_WORKING_DIRECTORY=/usr/src/bb
    ENV BB_BINARY_PATH=/usr/src/barretenberg/cpp/build/bin/bb
    ENV ACVM_WORKING_DIRECTORY=/usr/src/acvm
    ENV ACVM_BINARY_PATH=/usr/src/noir/noir-repo/target/release/acvm

    RUN mkdir -p $BB_WORKING_DIRECTORY $ACVM_WORKING_DIRECTORY
    WORKDIR /usr/src/yarn-project
    RUN yarn workspaces focus @aztec/bb-prover --production && yarn cache clean
    # yarn symlinks the binary to node_modules/.bin
    ENTRYPOINT ["/usr/src/yarn-project/node_modules/.bin/bb-cli"]

# helper target to generate vks in parallel
verification-key:
    ARG circuit="RootRollupArtifact"
    FROM +bb-cli

    # this needs to be exported as an env var for RUN to pick it up
    ENV CIRCUIT=$circuit
    RUN --entrypoint write-vk -c $CIRCUIT

    SAVE ARTIFACT /usr/src/bb /usr/src/bb

protocol-verification-keys:
    LOCALLY
    LET circuits = "RootRollupArtifact PrivateKernelTailArtifact PrivateKernelTailToPublicArtifact"

    FOR circuit IN $circuits
        BUILD +verification-key --circuit=$circuit
    END

    # this could be FROM scratch
    # but FOR doesn't work without /bin/sh
    FROM ubuntu:noble
    WORKDIR /usr/src/bb

    FOR circuit IN $circuits
        COPY (+verification-key/usr/src/bb --circuit=$circuit) .
    END

    SAVE ARTIFACT /usr/src/bb /usr/src/bb

rollup-verifier-contract:
    FROM +bb-cli
    COPY --dir +protocol-verification-keys/usr/src/bb /usr/src
    RUN --entrypoint write-contract -c RootRollupArtifact -n UltraHonkVerifier.sol
    SAVE ARTIFACT /usr/src/bb /usr/src/bb

########################################################################################################################
# Logs Uploading
########################################################################################################################

UPLOAD_LOGS:
  FUNCTION
  ARG PULL_REQUEST
  ARG BRANCH
  ARG COMMIT_HASH
  ARG LOG_FILE=./log
  LOCALLY
  LET COMMIT_HASH="${COMMIT_HASH:-$(git rev-parse HEAD)}"
  FROM +base-log-uploader
  COPY $LOG_FILE /usr/var/log
  ENV PULL_REQUEST=$PULL_REQUEST
  ENV BRANCH=$BRANCH
  ENV COMMIT_HASH=$COMMIT_HASH
  RUN --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY /usr/src/scripts/logs/upload_logs_to_s3.sh /usr/var/log

base-log-uploader:
  # Install awscli on a fresh ubuntu, and copy the repo "scripts" folder, which we'll use to upload logs
  # Note that we cannot do this LOCALLY because Earthly does not support using secrets locally
  FROM ubuntu:noble
  RUN apt update && \
    apt install -y curl git jq unzip
  RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update && \
    rm -rf aws awscliv2.zip
  COPY +scripts/scripts /usr/src/scripts

########################################################################################################################
# File Visibility Boilerplate
########################################################################################################################
release-meta:
  FROM scratch
  COPY .release-please-manifest.json /usr/src/.release-please-manifest.json
  SAVE ARTIFACT /usr/src /usr/src

scripts:
  FROM scratch
  COPY scripts /usr/src/scripts
  SAVE ARTIFACT /usr/src/scripts scripts
