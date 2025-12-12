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
# Alternatively pass nothing for latest commit, and delete the build for a rebuild.
ARG COMMIT=""

RUN git clone https://github.com/AztecProtocol/aztec-packages.git --depth 1 && \
    cd aztec-packages &&                                                       \
    if [ -n "$COMMIT" ]; then                                                  \
        git fetch origin $COMMIT;                                              \
        git checkout $COMMIT || exit 1;                                        \
    fi

# Create a clean copy of the source tree for the runtime image
RUN cp -r ./aztec-packages aztec-packages-src && rm -rf ./aztec-packages-src/.git

# Download crs
WORKDIR /home/fuzzer/aztec-packages/barretenberg
RUN ./crs/bootstrap.sh

WORKDIR /home/fuzzer/aztec-packages/barretenberg/cpp

# We cleanup after each build to save disk space.

# Build all fuzzers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing
RUN cmake --build build-fuzzing && mv build-fuzzing/bin bin-fuzzing && rm -rf build-fuzzing

# Build all fuzzers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing-noasm
RUN cmake --build build-fuzzing-noasm && mv build-fuzzing-noasm/bin bin-fuzzing-noasm && rm -rf build-fuzzing-noasm

# Build all post-crash loggers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing-asan
RUN cmake --build build-fuzzing-asan && mv build-fuzzing-asan/bin bin-fuzzing-asan && rm -rf build-fuzzing-asan

# Build all coverage fuzzers (keep full build for LLVM links and external dependencies)
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing-coverage
RUN cmake --build build-fuzzing-cov

# Build avm fuzzers
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset fuzzing-avm
RUN cmake --build build-fuzzing-avm && mv build-fuzzing-avm/bin bin-fuzzing-avm && rm -rf build-fuzzing-avm

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
        ca-certificates && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN useradd -m fuzzer -G sudo
WORKDIR /home/fuzzer

# Reuse source tree from builder for coverage reports
COPY --from=builder /home/fuzzer/aztec-packages-src /home/fuzzer/aztec-packages

WORKDIR /home/fuzzer/aztec-packages/barretenberg/cpp

# Copy binaries from build stage
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/bin-fuzzing ./build-fuzzing/bin
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/bin-fuzzing-noasm ./build-fuzzing-noasm/bin
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/bin-fuzzing-asan ./build-fuzzing-asan/bin
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/bin-fuzzing-avm ./build-fuzzing-avm/bin

# Copy full cov-build to keep LLVM links and external dependencies for coverage report
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/build-fuzzing-cov/ ./build-fuzzing-cov/

# Copy CRS
COPY --from=builder /root/.bb-crs /root/.bb-crs

# Copy entrypoint script
COPY entrypoint.sh .
