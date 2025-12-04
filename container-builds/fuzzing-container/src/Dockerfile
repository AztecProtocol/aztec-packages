# Build stage
FROM ubuntu:noble AS builder

RUN apt-get update && \
    apt-get install -y \
        build-essential \
        python3 \
        wget \
        curl \
        unzip \
        git \
        cmake \
        clang \
        ninja-build \
        libdw-dev \
        binutils-dev \
        libelf-dev \
        libdwarf-dev && \
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

# Build avm fuzzers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing-avm
RUN cmake --build build-fuzzing-avm

# Runtime stage
FROM ubuntu:noble AS runtime

# Install only runtime dependencies needed for fuzzing and coverage tools
RUN apt-get update && \
    apt-get install -y \
        libstdc++6 \
        libgcc-s1 \
        libc6 \
        libdw1 \
        libelf1 \
        libdwarf1 \
        llvm-18 \
        curl \
        unzip \
        ca-certificates && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN useradd -m fuzzer -G sudo
WORKDIR /home/fuzzer

# Copy binaries from build stage
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/build-fuzzing/bin ./build-fuzzing/bin
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/build-fuzzing-noasm/bin ./build-fuzzing-noasm/bin
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/build-fuzzing-asan/bin ./build-fuzzing-asan/bin
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/build-fuzzing-cov/bin ./build-fuzzing-cov/bin
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/build-fuzzing-avm/bin ./build-fuzzing-avm/bin
COPY --from=builder /root/.bb-crs /root/.bb-crs

# Copy entrypoint script
COPY entrypoint.sh .
