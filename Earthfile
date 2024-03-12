VERSION 0.8
FROM ubuntu:lunar

run-registry:
  # Run our own registry to alow for 
  LOCALLY
  IF ! docker ps | grep registry
    RUN docker run -d -p 5000:5000 --restart=always --name registry registry:2.7
  END
  SAVE IMAGE hello:latest

build-ci:
    BUILD ./avm-transpiler/+build
    BUILD ./barretenberg/cpp/+build-release
    BUILD ./barretenberg/cpp/+build-wasm
    BUILD ./barretenberg/cpp/+build-gcc
    BUILD ./barretenberg/cpp/+build-fuzzing
    BUILD ./barretenberg/cpp/+build-clang-assert
    BUILD ./barretenberg/cpp/+test-clang-format
    BUILD ./barretenberg/cpp/+test-clang-format
    BUILD ./boxes/+build
    BUILD ./noir/+build-packages
    BUILD ./noir/+build-nargo
    BUILD ./noir-projects/+build
    BUILD ./yarn-project/+build
    BUILD +test-end-to-end

build:
    # yarn-project has the entry point to Aztec
    BUILD ./yarn-project/+build

test-end-to-end:
    BUILD ./yarn-project/end-to-end/+build-ci

bench:
  RUN echo hi
