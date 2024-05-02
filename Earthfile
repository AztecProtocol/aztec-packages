VERSION 0.8
FROM ubuntu:noble

build-ci:
    BUILD ./avm-transpiler/+build
    BUILD ./barretenberg/cpp/+preset-release
    BUILD ./barretenberg/cpp/+preset-wasm
    BUILD ./barretenberg/cpp/+preset-gcc
    BUILD ./barretenberg/cpp/+preset-fuzzing
    BUILD ./barretenberg/cpp/+preset-clang-assert
    BUILD ./barretenberg/cpp/+test-clang-format
    BUILD ./boxes/+build
    BUILD ./noir/+packages
    BUILD ./noir/+nargo
    BUILD ./noir-projects/+build
    BUILD ./yarn-project/+end-to-end
    BUILD ./yarn-project/+aztec

build:
    # yarn-project has the entry point to Aztec
    BUILD ./yarn-project/+build

test-end-to-end:
    BUILD ./yarn-project/end-to-end+e2e-tests

bench:
  RUN echo hi

release-meta:
    COPY .release-please-manifest.json /usr/src/.release-please-manifest.json
    SAVE ARTIFACT /usr/src /usr/src

scripts:
    FROM ubuntu:lunar
    RUN apt-get update && apt-get install -y awscli
    COPY scripts /usr/src/scripts
    SAVE ARTIFACT /usr/src/scripts scripts

UPLOAD_LOGS:
    FUNCTION
    ARG PULL_REQUEST
    ARG BRANCH
    ARG COMMIT_HASH
    LOCALLY
    LET COMMIT_HASH="${COMMIT_HASH:-$(git rev-parse HEAD)}"
    FROM +scripts
    COPY ./log /usr/var/log
    ENV PULL_REQUEST=$PULL_REQUEST
    ENV BRANCH=$BRANCH
    ENV COMMIT_HASH=$COMMIT_HASH
    RUN --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY /usr/src/scripts/logs/upload_logs_to_s3.sh /usr/var/log
      