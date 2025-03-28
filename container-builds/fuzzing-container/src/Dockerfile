FROM ubuntu:noble AS base-build

RUN apt-get update
RUN apt-get install -y build-essential python3 wget unzip git
RUN apt-get install -y cmake clang-16 ninja-build
RUN apt-get -y autoremove
RUN apt-get clean
RUN rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /fuzzing

# Check whether the version of barretenberg is fresh
ADD https://api.github.com/repos/AztecProtocol/barretenberg/git/refs/heads/master version.json

RUN git clone https://github.com/AztecProtocol/barretenberg.git
WORKDIR /fuzzing/barretenberg/cpp

# Build all fuzzers
RUN cmake --preset fuzzing
RUN cmake --build --preset fuzzing

# Build all post-crash loggers
RUN cmake --preset fuzzing-asan
RUN cmake --build --preset fuzzing-asan

COPY entrypoint.sh .
