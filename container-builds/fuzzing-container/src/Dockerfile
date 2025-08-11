FROM ubuntu:noble AS base-build

RUN apt-get update && \
    apt-get install -y build-essential python3 wget unzip git cmake clang ninja-build curl && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN useradd -m fuzzer -G sudo
WORKDIR /home/fuzzer

# Build arguemnt to avoid layer caching
ARG COMMIT=latest

RUN git clone https://github.com/AztecProtocol/aztec-packages.git && \
    cd aztec-packages &&                                             \
    if [ "$COMMIT" != "latest" ]; then                               \
        git checkout $COMMIT || exit 1;                              \
    fi

# Download crs
WORKDIR /home/fuzzer/aztec-packages/barretenberg
RUN ./scripts/download_bb_crs.sh

WORKDIR /home/fuzzer/aztec-packages/barretenberg/cpp

# Build all fuzzers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing
RUN cmake --build build-fuzzing

# Build all fuzzers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing-noasm
RUN cmake --build build-fuzzing-noasm

# Build all post-crash loggers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing-asan
RUN cmake --build build-fuzzing-asan

# Build all coverage fuzzers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing-coverage
RUN cmake --build build-fuzzing-cov

COPY entrypoint.sh .
