VERSION 0.8
FROM ubuntu:lunar

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

bench:
  RUN echo hi
