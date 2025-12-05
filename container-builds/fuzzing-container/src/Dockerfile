# Build stage
FROM ubuntu:noble AS base-build

RUN apt-get update && \
    apt-get install -y \
        build-essential \
        python3 \
        git wget curl unzip \
        clang llvm-18 libstdc++6 libgcc-s1 libc6 \
        cmake ninja-build\
        libdw-dev libelf-dev libdwarf-dev libdw1 libelf1 libdwarf1 binutils-dev \
        ca-certificates && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN useradd -m fuzzer -G sudo
WORKDIR /home/fuzzer

# Build argument to avoid layer caching
ARG COMMIT=latest

RUN git clone https://github.com/AztecProtocol/aztec-packages.git --depth 1 && \
    cd aztec-packages &&                                                       \
    if [ "$COMMIT" != "latest" ]; then                                         \
        git checkout $COMMIT || exit 1;                                        \
    fi

# Download crs
WORKDIR /home/fuzzer/aztec-packages/barretenberg
RUN ./crs/bootstrap.sh

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

# Build AVM fuzzers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing-avm
RUN cmake --build build-fuzzing-avm

# Copy entrypoint script
COPY entrypoint.sh .
