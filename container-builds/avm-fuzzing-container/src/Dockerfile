# AVM Fuzzing Container
# Builds all 14 AVM fuzzer targets with Node.js runtime for differential testing.
#
# Build latest from 'next' branch:
#   docker build -t avm-fuzzing container-builds/avm-fuzzing-container/src/
#
# Build specific commit:
#   docker build -t avm-fuzzing --build-arg COMMIT=<sha> container-builds/avm-fuzzing-container/src/

# =============================================================================
# Builder stage
# =============================================================================
FROM aztecprotocol/build:3.0-amd64 AS builder

ARG BRANCH=next
ARG COMMIT=""

# Install ldid (not included in build image, only in basebox)
RUN curl -sL https://github.com/ProcursusTeam/ldid/releases/download/v2.1.5-procursus7/ldid_linux_x86_64 -o /usr/local/bin/ldid \
    && chmod +x /usr/local/bin/ldid

# Install Node.js 24 (build image has Node 22, but bootstrap requires 24)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs

WORKDIR /root

# Clone the repository
RUN git clone https://github.com/AztecProtocol/aztec-packages.git --depth 1 --branch ${BRANCH} && \
    cd aztec-packages && \
    if [ -n "$COMMIT" ]; then \
        git fetch origin $COMMIT --depth 1; \
        git checkout $COMMIT || exit 1; \
    fi

WORKDIR /root/aztec-packages

# Run bootstrap up to yarn-project (release-image needs docker which isn't available)
RUN ./bootstrap.sh build yarn-project

# Download CRS
WORKDIR /root/aztec-packages/barretenberg
RUN CRS_FORMAT=uncompressed ./crs/bootstrap.sh

WORKDIR /root/aztec-packages/barretenberg/cpp

# Create a clean copy of the source tree BEFORE builds (for coverage reports)
RUN cp -r /root/aztec-packages /root/aztec-packages-src && rm -rf /root/aztec-packages-src/.git

# Build AVM-specific fuzzers only via the umbrella target (the preset also
# rebuilds all base fuzzers as a side effect — avm_fuzzers avoids that).
RUN cmake --preset fuzzing-avm
RUN cmake --build build-fuzzing-avm --target avm_fuzzers

# Build coverage variants (instrumented for llvm-cov)
RUN cmake -B build-fuzzing-avm-cov -G Ninja \
    -DCMAKE_C_COMPILER=clang-20 -DCMAKE_CXX_COMPILER=clang++-20 \
    -DCMAKE_BUILD_TYPE=RelWithAssert \
    -DFUZZING=ON -DFUZZING_AVM=ON -DDISABLE_ASM=OFF -DMULTITHREADING=ON \
    -DFUZZER_PRESET_NAME=fuzzing-cov \
    -DCMAKE_CXX_FLAGS="-fprofile-instr-generate -fcoverage-mapping" \
    -DCMAKE_C_FLAGS="-fprofile-instr-generate -fcoverage-mapping"
RUN cmake --build build-fuzzing-avm-cov --target avm_fuzzers

# Flatten binaries into /targets/ and auto-generate v2 manifest.
# AVM fuzzers use a singleton LMDB world state that cannot handle concurrent
# writers, so they run single-threaded (cpus=1, memory_gb=8).
RUN python3 scripts/flatten_and_manifest.py /targets /tmp/fuzzer_manifest.json \
    build-fuzzing-avm/bin/fuzzer_manifest.json \
    --copy-only build-fuzzing-avm-cov/bin/fuzzer_manifest.json \
    --cpus 1 --memory-gb 8

# =============================================================================
# Runtime stage
# =============================================================================
FROM ubuntu:noble AS runtime

RUN apt-get update && apt-get install -y \
    libstdc++6 \
    libgcc-s1 \
    libc6 \
    libdw1 \
    libelf1 \
    libdwarf1 \
    ca-certificates \
    curl \
    llvm-20 && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    corepack enable && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN useradd -m fuzzer
WORKDIR /home/fuzzer

# Copy yarn-project (fully built)
COPY --from=builder /root/aztec-packages/yarn-project \
    ./aztec-packages/yarn-project/

# Copy barretenberg/ts (for @aztec/bb.js)
COPY --from=builder /root/aztec-packages/barretenberg/ts \
    ./aztec-packages/barretenberg/ts/

# Copy noir packages (for portal symlinks)
COPY --from=builder /root/aztec-packages/noir/packages \
    ./aztec-packages/noir/packages/

# Copy source tree for coverage reports at the same path used during build,
# so llvm-cov can find source files without path remapping.
COPY --from=builder /root/aztec-packages-src /root/aztec-packages

# Copy coverage build directory (needed for llvm-cov links)
COPY --from=builder /root/aztec-packages/barretenberg/cpp/build-fuzzing-avm-cov/ \
    /root/aztec-packages/barretenberg/cpp/build-fuzzing-avm-cov/

# Copy CRS to a world-readable location so non-root containers can access it
COPY --from=builder /root/.bb-crs /opt/bb-crs
RUN chmod -R 755 /opt/bb-crs
ENV CRS_PATH=/opt/bb-crs

# AVM simulator binary path for differential fuzzers
ENV AVM_SIMULATOR_BIN=/home/fuzzer/aztec-packages/yarn-project/simulator/dest/public/fuzzing/avm_simulator_bin.js
ENV AVM_FUZZER_LOGGING=1

# Copy flattened target binaries
COPY --from=builder /targets/ /targets/

# Copy auto-generated fuzzer manifest
COPY --from=builder /tmp/fuzzer_manifest.json ./fuzzer_manifest.json

# Copy entrypoint script
COPY entrypoint.sh ./entrypoint.sh

# The container runs as a non-root UID (65534/nobody) on the fuzzing platform.
# All copied files must be world-readable/executable.
RUN chmod a+rx /home/fuzzer && \
    chmod -R a+rX /home/fuzzer/aztec-packages/ && \
    chmod a+rx /root && \
    chmod -R a+rX /root/aztec-packages/ && \
    chmod a+rx /home/fuzzer/entrypoint.sh && \
    chmod -R a+rx /targets/

# Create directories for corpus, crashes, output, and temp
RUN mkdir -p /corpus /crashes /output /reproduce-input /tmp && \
    chmod 777 /corpus /crashes /output /reproduce-input /tmp

ENTRYPOINT ["./entrypoint.sh"]
