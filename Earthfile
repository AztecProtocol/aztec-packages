VERSION --raw-output 0.8

########################################################################################################################
# Builds
########################################################################################################################
bootstrap-noir-bb:
  # Note: Assumes EARTHLY_BUILD_SHA has been pushed!
  FROM ./build-images+from-registry
  ARG EARTHLY_GIT_HASH
  ENV GITHUB_LOG=1
  WORKDIR /build-volume
  # ENV AZTEC_CACHE_COMMIT=3d41cba64667950d6c0c3686864d9065da640fd7
  # Use a cache volume for performance
  RUN --raw-output --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/build-volume \
    rm -rf $(ls -A) && \
    git init 2>&1 >/dev/null && \
    git remote add origin https://github.com/aztecprotocol/aztec-packages 2>&1 >/dev/null && \
    # Verify that the commit exists on the remote. It will be the remote tip of itself if so.
    ([ -z "$AZTEC_CACHE_COMMIT" ] || git fetch --depth 1 origin $AZTEC_CACHE_COMMIT 2>&1 >/dev/null) && \
    (git fetch --depth 1 origin $EARTHLY_GIT_HASH 2>&1 >/dev/null || (echo "The commit was not pushed, run aborted." && exit 1)) && \
    git reset --hard FETCH_HEAD && \
    DENOISE=1 CI=1 TEST=0 USE_CACHE=1 parallel ::: ./noir/bootstrap.sh ./barretenberg/cpp/bootstrap.sh ./barretenberg/ts/bootstrap.sh && \
    DENOISE=1 CI=1 TEST=0 ./barretenberg/acir_tests/bootstrap.sh && \
    mv $(ls -A) /usr/src
  WORKDIR /usr/src
  SAVE ARTIFACT /usr/src /usr/src

bootstrap:
  # Note: Assumes EARTHLY_BUILD_SHA has been pushed!
  FROM ./build-images+from-registry
  ARG EARTHLY_GIT_HASH
  ENV GITHUB_LOG=1
  WORKDIR /build-volume
  # ENV AZTEC_CACHE_COMMIT=5684b5052e4f7b4d44d98a7ba407bbf7eb462c1d
  # Use a cache volume for performance
  RUN --raw-output --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/build-volume \
    rm -rf $(ls -A) && \
    git init 2>&1 >/dev/null && \
    git remote add origin https://github.com/aztecprotocol/aztec-packages 2>&1 >/dev/null && \
    # Verify that the commit exists on the remote. It will be the remote tip of itself if so.
    ([ -z "$AZTEC_CACHE_COMMIT" ] || git fetch --depth 1 origin $AZTEC_CACHE_COMMIT 2>&1 >/dev/null) && \
    (git fetch --depth 1 origin $EARTHLY_GIT_HASH 2>&1 >/dev/null || (echo "The commit was not pushed, run aborted." && exit 1)) && \
    git reset --hard FETCH_HEAD && \
    DENOISE=1 CI=1 TEST=0 USE_CACHE=1 parallel ::: ./noir/bootstrap.sh ./barretenberg/cpp/bootstrap.sh ./barretenberg/ts/bootstrap.sh && \
    DENOISE=1 CI=1 TEST=0 USE_CACHE=1 ./barretenberg/acir_tests/bootstrap.sh && \
    DENOISE=1 CI=1 TEST=0 USE_CACHE=1 ./l1-contracts/bootstrap.sh && \
    DENOISE=1 CI=1 TEST=0 USE_CACHE=1 ./avm-transpiler/bootstrap.sh && \
    DENOISE=1 CI=1 TEST=0 USE_CACHE=1 ./noir-projects/bootstrap.sh && \
    DENOISE=1 CI=1 TEST=0 USE_CACHE=1 ./yarn-projects/bootstrap.sh && \
    mv $(ls -A) /usr/src
  SAVE ARTIFACT /usr/src /usr/src

bootstrap-aztec:
  FROM +bootstrap
  WORKDIR /usr/src/yarn-project
  ENV DENOISE=1
  LET ci3=$(git rev-parse --show-toplevel)/ci3
  RUN rm -rf node_modules && yarn workspaces focus @aztec/aztec --production && yarn cache clean
  COPY --dir +rollup-verifier-contract/usr/src/bb /usr/src
  WORKDIR /usr/src
  # Focus on the biggest chunks to remove
  RUN rm -rf \
    .git \
    .github \
    .yarn \
    noir-projects \
    l1-contracts \
    barretenberg/cpp/src \
    barretenberg/ts \
    build-system \
    docs \
    yarn-project/end-to-end \
    yarn-project/*/src
  SAVE ARTIFACT /usr/src /usr/src

# We care about creating a slimmed down e2e image because we have to serialize it from earthly to docker for running.
bootstrap-end-to-end:
  FROM +bootstrap
  RUN rm -rf \
    .git .github \
    noir-projects \
    l1-contracts \
    build-system \
    docs \
    barretenberg/ts/src \
    barretenberg/ts/dest/node-cjs \
    barretenberg/ts/dest/browser
  WORKDIR /usr/src/yarn-project
  RUN rm -rf node_modules && yarn workspaces focus @aztec/end-to-end @aztec/cli-wallet --production && yarn cache clean
  COPY --dir +rollup-verifier-contract/usr/src/bb /usr/src
  SAVE ARTIFACT /usr/src /usr/src
  SAVE ARTIFACT /opt/foundry/bin/anvil

bootstrap-aztec-faucet:
  FROM +bootstrap
  RUN yarn workspaces focus @aztec/aztec-faucet --production && yarn cache clean
  RUN rm -rf \
    .git \
    noir-projects \
    l1-contracts \
    barretenberg/ts/src \
    barretenberg/ts/dest/node-cjs \
    barretenberg/ts/dest/browser \
    yarn-project/aztec.js/dest/main.js \
    yarn-project/end-to-end \
    yarn-project/**/src
  SAVE ARTIFACT /usr/src /usr/src

# Simulates noir+bb CI with chunks that use resources
ci-noir-bb:
  FROM +bootstrap-noir-bb
  ENV USE_CACHE=1
  LET artifact=noir-ci-native-tests-$(./noir/bootstrap.sh hash-native)-$(./noir/bootstrap.sh hash-packages)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./noir/+format
      BUILD ./noir/+examples
      BUILD ./noir/+packages-test
      BUILD ./noir/+test
    END
    RUN ci3/cache_upload_flag $artifact
  END
  LET artifact=bb-ci-gcc-$(./barretenberg/cpp/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./barretenberg/cpp/+preset-gcc
    END
    RUN ci3/cache_upload_flag $artifact
  END
  LET artifact=bb-ci-gcc-$(./barretenberg/ts/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./barretenberg/ts/+test
    END
    RUN ci3/cache_upload_flag $artifact
  END
  WAIT
    LET artifact=bb-ci-acir-tests-$(./barretenberg/acir_tests/bootstrap.sh hash)
    IF ci3/test_should_run $artifact
      BUILD ./barretenberg/acir_tests/+test
      RUN ci3/cache_upload_flag $artifact
    END
  END

# Simulates non-noir non-bb CI with chunks that use resources
ci-rest:
  FROM +bootstrap
  ENV USE_CACHE=1
  WAIT
    BUILD ./avm-transpiler/+format
    BUILD ./yarn-project/+format-check
    # internally uses cache:
    BUILD ./l1-contracts+test
    BUILD +noir-projects-helper
  END
  LET artifact=yarn-project-ci-tests-$(./yarn-project/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./yarn-project/+network-test --test=./test-transfer.sh
    END
    WAIT
      BUILD ./yarn-project/+prover-client-test
    END
    WAIT
      BUILD ./yarn-project/+test
    END
    RUN ci3/cache_upload_flag $artifact
  END

########################################################################################################################
# Build helpers
########################################################################################################################
# uses flag cache
docs-helper:
  FROM +bootstrap
  ENV USE_CACHE=1
  LET artifact=docs-ci-deploy-$(./barretenberg/acir_tests/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD --pass-args ./docs/+deploy-preview
    END
    RUN ci3/cache_upload_flag $artifact
  END
# uses flag cache
noir-projects-helper:
  FROM +bootstrap
  ENV USE_CACHE=1
  LET artifact=noir-projects-ci-tests-$(./noir-projects/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    # could be changed to bootstrap once txe solution found
    WAIT
      BUILD ./noir-projects/+format
      BUILD ./noir-projects/+test
    END
    RUN ci3/cache_upload_flag $artifact
  END

bb-cli:
    FROM +bootstrap
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
# File-copying boilerplate
########################################################################################################################

release-meta:
  FROM ubuntu:noble
  COPY .release-please-manifest.json /usr/src/.release-please-manifest.json
  SAVE ARTIFACT /usr/src /usr/src

scripts:
  FROM scratch
  COPY scripts /usr/src/scripts
  SAVE ARTIFACT /usr/src/scripts scripts

########################################################################################################################
# Log helpers
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
# Tests
########################################################################################################################
network-test:
    FROM +bootstrap
    ARG test=./test-transfer.sh
    ARG validators=3
    WORKDIR /usr/src/yarn-project
    # All script arguments are in the end-to-end/scripts/native-network folder
    ENV LOG_LEVEL=verbose
    RUN INTERLEAVED=true end-to-end/scripts/native_network_test.sh \
        "$test" \
        ./deploy-l1-contracts.sh \
        ./deploy-l2-contracts.sh \
        ./boot-node.sh \
        ./ethereum.sh \
        "./prover-node.sh 8078 false" \
        ./pxe.sh \
        "./validators.sh $validators"