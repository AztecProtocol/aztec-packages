FROM ubuntu:noble AS base-build

RUN apt-get update && \
    apt-get install -y build-essential python3 wget unzip git cmake clang-16 ninja-build curl && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN userdel -r ubuntu && useradd -m fuzzer -G sudo
WORKDIR /home/fuzzer

# Check whether the version of barretenberg is fresh
ADD https://api.github.com/repos/AztecProtocol/aztec-packages/commits?path=barretenberg version.json

RUN git clone https://github.com/AztecProtocol/aztec-packages.git

# Download crs
WORKDIR /home/fuzzer/aztec-packages/barretenberg
RUN ./scripts/download_bb_crs.sh

WORKDIR /home/fuzzer/aztec-packages/barretenberg/cpp

# Build all fuzzers
RUN cmake --preset fuzzing
RUN cmake --build --preset fuzzing

# Build all post-crash loggers
RUN cmake --preset fuzzing-asan
RUN cmake --build --preset fuzzing-asan

# Build all coverage fuzzers
RUN cmake --preset fuzzing-coverage
RUN cmake --build --preset fuzzing-coverage

RUN mv ./build-fuzzing ./build-fuzzing-asan ./build-fuzzing-cov /home/fuzzer
WORKDIR /home/fuzzer

COPY entrypoint.sh .
COPY coverage_style.css .
