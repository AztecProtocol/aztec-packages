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
    FROM scratch
    COPY scripts /usr/src/scripts
    SAVE ARTIFACT /usr/src/scripts scripts

# Push all our targets that are set up for inline caching
# We use a custom #aztec-tag=cache syntax to clearly mark which SAVE IMAGE commands we want to take.
# Unfortunately, Earthly does not trigger SAVE IMAGE just from our natural dependency usage.
# We grep for lines with the tag and BUILD them dynamically this keeps a clutter of bug-prone redundant BUILD statements away.
# See https://docs.earthly.dev/docs/caching/caching-via-registry#inline-cache for inline caching details
remote-cache:
    LOCALLY
    FOR module IN build-images barretenberg/cpp noir barretenberg/ts l1-contracts avm-transpiler
        FOR target IN $(cat $module/Earthfile | grep '#aztec-tag=cache' | cut -d':' -f1)
            BUILD ./$module/+$target
        END
    END

