VERSION 0.8
FROM ubuntu:lunar

build-ci:
    BUILD ./noir/+build-packages
    BUILD ./noir/+build-nargo
    BUILD ./avm-transpiler/+build
    BUILD ./boxes/+build
    BUILD ./barretenberg/cpp/+build-release
    BUILD ./barretenberg/cpp/+build-wasm
    BUILD ./barretenberg/cpp/+build-gcc
    BUILD ./barretenberg/cpp/+build-fuzzing
    BUILD ./barretenberg/cpp/+build-clang-assert
    BUILD ./barretenberg/cpp/+test-clang-format
    BUILD ./barretenberg/cpp/+test-clang-format

bench:
  RUN echo hi
