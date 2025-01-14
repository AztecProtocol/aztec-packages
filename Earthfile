VERSION --raw-output 0.8

########################################################################################################################
# Builds
########################################################################################################################
bootstrap-base:
  # Note: Assumes EARTHLY_GIT_HASH has been pushed!
  FROM ./build-images+from-registry
  ENV GITHUB_LOG=1
  WORKDIR /build-volume
  LET bootstrap_aws='mkdir -p $HOME/.aws/ &&
    echo "[default]" > $HOME/.aws/credentials &&
    echo "aws_access_key_id = $AWS_ACCESS_KEY_ID" >> $HOME/.aws/credentials &&
    echo "aws_secret_access_key = $AWS_SECRET_ACCESS_KEY" >> $HOME/.aws/credentials &&
    chmod 600 $HOME/.aws/credentials'
  RUN --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY \
    bash -c "$bootstrap_aws"
bootstrap-noir-bb:
  FROM +bootstrap-base
  ARG EARTHLY_GIT_HASH
  LET bootstrap_noir_bb='rm -rf $(ls -A) &&
    git init >/dev/null 2>&1 &&
    git remote add origin https://github.com/aztecprotocol/aztec-packages >/dev/null 2>&1 &&
    (git fetch --depth 1 origin $EARTHLY_GIT_HASH >/dev/null 2>&1 || (echo "The commit was not pushed, run aborted." && exit 1)) &&
    git reset --hard FETCH_HEAD >/dev/null 2>&1 &&
    ./build-images/adhoc-installs.sh &&
    DENOISE=1 CI=1 ./noir/bootstrap.sh fast &&
    DENOISE=1 CI=1 ./barretenberg/bootstrap.sh fast &&
    mv $(ls -A) /usr/src'
  # Use a mounted volume for performance.
  # Note: Assumes EARTHLY_GIT_HASH has been pushed!
  RUN --raw-output --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY --mount type=cache,id=bootstrap-noir-bb-$EARTHLY_GIT_HASH,target=/build-volume \
    bash -c "$bootstrap_noir_bb"
  SAVE ARTIFACT /usr/src /usr/src
  WORKDIR /usr/src
  ENV CI=1
  ENV DENOISE=1
  ENV TEST=1
  ENV USE_CACHE=1
  ARG GITHUB_RUN_URL=""
  ENV GITHUB_RUN_URL="$GITHUB_RUN_URL"

bootstrap:
  # NOTE: Skips boxes.
  FROM +bootstrap-noir-bb
  WORKDIR /build-volume
  ARG EARTHLY_GIT_HASH
  LET bootstrap='rm -rf $(ls -A) &&
    mv $(find /usr/src -mindepth 1 -maxdepth 1) . &&
    DENOISE=1 CI=1 ./l1-contracts/bootstrap.sh fast &&
    DENOISE=1 CI=1 ./avm-transpiler/bootstrap.sh fast &&
    DENOISE=1 CI=1 ./noir-projects/bootstrap.sh fast &&
    DENOISE=1 CI=1 ./yarn-project/bootstrap.sh fast &&
    mv $(ls -A) /usr/src'
  # Use a mounted volume for performance.
  # TODO don't retry noir projects. It seems to have been flakey.
  RUN --raw-output --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/build-volume \
    bash -c "$bootstrap"

  SAVE ARTIFACT /usr/src /usr/src
  WORKDIR /usr/src

bootstrap-with-verifier:
  # TODO(ci3) roll this into normal bootstrap
  FROM +bootstrap
  WORKDIR /usr/src/yarn-project
  ENV DENOISE=1
  COPY --dir +rollup-verifier-contract-with-cache/usr/src/bb /usr/src

# Locally downloaded aztec image contents.
bootstrap-aztec:
  FROM +bootstrap-with-verifier
  WORKDIR /usr/src/yarn-project
  ENV DENOISE=1
  RUN yarn workspaces focus @aztec/aztec --production && yarn cache clean
  WORKDIR /usr/src
  # Focus on the biggest chunks to remove
  RUN find noir/noir-repo/target/release -type f ! -name "acvm" ! -name "nargo" -exec rm -rf {} + && \
    find avm-transpiler/target/release -type f ! -name "avm-transpiler" -exec rm -rf {} +
  RUN rm -rf \
    .git \
    .github \
    noir-projects \
    barretenberg/cpp/src \
    barretenberg/ts/node-cjs \
    barretenberg/ts/browser \
    barretenberg/ts/src \
    build-system \
    docs \
    yarn-project/end-to-end
  SAVE ARTIFACT /usr/src /usr/src

# Locally downloaded end-to-end image contents.
bootstrap-end-to-end:
  FROM +bootstrap-with-verifier
  WORKDIR /usr/src/yarn-project
  RUN yarn workspaces focus @aztec/end-to-end @aztec/cli-wallet --production && yarn cache clean
  WORKDIR /usr/src
  # Focus on the biggest chunks to remove
  RUN find noir/noir-repo/target/release -type f ! -name "acvm" ! -name "nargo" -exec rm -rf {} + && \
    find avm-transpiler/target/release -type f ! -name "avm-transpiler" -exec rm -rf {} +
  RUN rm -rf \
    .git .github \
    l1-contracts \
    build-system \
    noir-projects \
    docs \
    barretenberg/ts/dest/node-cjs
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
  LET artifact=noir-ci-tests-$(./noir/bootstrap.sh hash-test)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./noir/+format
      BUILD ./noir/+examples
      BUILD ./noir/+packages-test
      BUILD ./noir/+test
    END
    RUN ci3/cache_upload_flag $artifact
  END
  SET artifact=bb-ci-gcc-$(./barretenberg/cpp/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./barretenberg/cpp/+preset-gcc
    END
    RUN ci3/cache_upload_flag $artifact
  END
  SET artifact=bb-ts-ci-$(./barretenberg/ts/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./barretenberg/ts/+test
    END
    RUN ci3/cache_upload_flag $artifact
  END
  SET artifact=bb-ci-acir-tests-$(./barretenberg/acir_tests/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./barretenberg/acir_tests/+test
    END
    RUN ci3/cache_upload_flag $artifact
  END

# Simulates non-noir non-bb CI with chunks that use resources
ci-rest:
  FROM +bootstrap
  WAIT
    BUILD +avm-transpiler-with-cache
    # internally uses cache:
    BUILD +l1-contracts-with-cache
    BUILD +noir-projects-with-cache
  END
  LET artifact=yarn-project-ci-tests-$(./yarn-project/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./yarn-project/+format-check
      BUILD ./yarn-project/+test
      BUILD ./+network-test --test=./test-transfer.sh
    END
    RUN ci3/cache_upload_flag $artifact
  END

# Not actually used by current CI, but a good approximation.
ci:
  WAIT
    BUILD +ci-noir-bb
  END
  WAIT
    BUILD ./barretenberg/cpp/+bench
    BUILD ./barretenberg/cpp/+test --jobs=32
  END
  WAIT
    BUILD +ci-rest
  END
  WAIT
    BUILD +prover-client-with-cache
  END
  WAIT
    BUILD ./docs/+build
  END
  LOCALLY
  RUN ./bootstrap.sh test-e2e e2e_blacklist

########################################################################################################################
# Build helpers
########################################################################################################################
docs-with-cache:
  FROM +bootstrap
  ENV CI=1
  ENV USE_CACHE=1
  LET artifact=docs-ci-deploy-$(./docs/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD --pass-args ./docs/+deploy-preview
    END
    RUN ci3/cache_upload_flag $artifact
  END
prover-client-with-cache:
  FROM +bootstrap
  ENV CI=1
  ENV USE_CACHE=1
  LET artifact=prover-client-test-$(./yarn-project/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./yarn-project/+prover-client-test
    END
    RUN ci3/cache_upload_flag $artifact
  END
avm-transpiler-with-cache:
  FROM +bootstrap
  ENV CI=1
  ENV USE_CACHE=1
  LET artifact=avm-transpiler-ci-$(./avm-transpiler/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./avm-transpiler/+format
    END
    RUN ci3/cache_upload_flag $artifact
  END
l1-contracts-with-cache:
  FROM +bootstrap
  ENV CI=1
  ENV USE_CACHE=1
  LET artifact=l1-contracts-test-$(./l1-contracts/bootstrap.sh hash)
  IF ci3/test_should_run $artifact
    WAIT
      BUILD ./l1-contracts/+test
    END
    RUN ci3/cache_upload_flag $artifact
  END
# uses flag cache
noir-projects-with-cache:
  FROM +bootstrap
  ENV CI=1
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

rollup-verifier-contract-with-cache:
  FROM +bootstrap
  ENV CI=1
  ENV USE_CACHE=1
  LET artifact=rollup-verifier-contract-$(./noir-projects/bootstrap.sh hash).tar.gz
  # Running this directly in the 'if' means files are not permanent
  RUN ci3/cache_download rollup-verifier-contract-3e3a78f9a68f1f1e04240acf0728522d87a313ac-linux-gnu-x86_64 || true
  IF ! [ -d /usr/src/bb ]
    COPY --dir +rollup-verifier-contract/usr/src/bb /usr/src
    RUN ci3/cache_upload $artifact bb
  END
  SAVE ARTIFACT /usr/src/bb /usr/src/bb

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

# TODO(ci3): we either don't need this or should be in bootstrap
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
  RUN scripts/run_native_testnet.sh -i -t $test -val $validators
