# Multi-stage Dockerfile for AVM TX Fuzzer
# Builds a container that can run the AVM transaction fuzzer
#
# Build from aztec-packages root:
#   docker build -t avm-tx-fuzzer -f container-builds/avm-fuzzing-container/src/Dockerfile .

# =============================================================================
# Stage 1: Build C++ fuzzer binary
# =============================================================================
FROM ubuntu:noble AS builder

# Install build dependencies and LLVM script requirements
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    ninja-build \
    git \
    curl \
    wget \
    libdw-dev \
    binutils-dev \
    libelf-dev \
    libdwarf-dev \
    lsb-release \
    software-properties-common \
    gnupg && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install clang-20 via LLVM script
RUN wget https://apt.llvm.org/llvm.sh && \
    chmod +x llvm.sh && \
    ./llvm.sh 20 && \
    rm llvm.sh

RUN useradd -m fuzzer -G sudo
WORKDIR /home/fuzzer

# Copy only the necessary directories from build context
# barretenberg/cpp - the C++ source code
COPY barretenberg/cpp ./aztec-packages/barretenberg/cpp/

# Build the tx fuzzer only
WORKDIR /home/fuzzer/aztec-packages/barretenberg/cpp

# Remove any local build directories that may have been copied
RUN rm -rf build-* srs_db

RUN cmake --preset fuzzing-avm
RUN cmake --build build-fuzzing-avm --target avm_fuzzer_tx_fuzzer

# =============================================================================
# Stage 2: Build Node.js simulator
# =============================================================================
FROM ubuntu:noble AS simulator-builder

# Install Node.js 22 and build dependencies for native modules
RUN apt-get update && \
    apt-get install -y curl git build-essential python3 parallel && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Enable corepack for yarn
RUN corepack enable

WORKDIR /home/fuzzer/aztec-packages

# Copy yarn-project from build context (includes .yarnrc.yml and yarn.lock)
COPY yarn-project ./yarn-project/

# Copy barretenberg/ts (required as yarn workspace dependency via portal)
COPY barretenberg/ts ./barretenberg/ts/

# Copy noir packages (required as yarn workspace dependencies via portal/file)
COPY noir/packages/acvm_js ./noir/packages/acvm_js/
COPY noir/packages/types ./noir/packages/types/
COPY noir/packages/noirc_abi ./noir/packages/noirc_abi/
COPY noir/packages/noir_codegen ./noir/packages/noir_codegen/
COPY noir/packages/noir_js ./noir/packages/noir_js/

WORKDIR /home/fuzzer/aztec-packages/yarn-project

# Install dependencies (but skip building - we'll use pre-built files from build context)
RUN yarn install

# =============================================================================
# Stage 3: Runtime image
# =============================================================================
FROM ubuntu:noble AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libstdc++6 \
    libgcc-s1 \
    libc6 \
    libdw1 \
    libelf1 \
    libdwarf1 \
    ca-certificates \
    curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN useradd -m fuzzer -G sudo
WORKDIR /home/fuzzer

# Create directory structure that matches run_fuzzer.sh expectations
# run_fuzzer.sh calculates paths relative to itself:
#   SCRIPT_DIR = /home/fuzzer/aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer
#   BARRETENBERG_ROOT = SCRIPT_DIR/../../../.. = /home/fuzzer/aztec-packages/barretenberg
#   CPP_DIR = BARRETENBERG_ROOT/cpp
#   BUILD_DIR = CPP_DIR/build-fuzzing-avm
#   PROJECT_ROOT = BARRETENBERG_ROOT/.. = /home/fuzzer/aztec-packages
#   AVM_SIMULATOR_BIN = PROJECT_ROOT/yarn-project/simulator/dest/public/fuzzing/avm_simulator_bin.js

# Copy fuzzer binary to the expected location
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/build-fuzzing-avm/bin/avm_fuzzer_tx_fuzzer \
    ./aztec-packages/barretenberg/cpp/build-fuzzing-avm/bin/

# Copy run_fuzzer.sh to its expected location
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/run_fuzzer.sh \
    ./aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/

# Copy corpus
COPY --from=builder /home/fuzzer/aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/corpus/ \
    ./aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/corpus/

# Copy entire yarn-project with built packages (includes all dest directories)
COPY --from=simulator-builder /home/fuzzer/aztec-packages/yarn-project \
    ./aztec-packages/yarn-project/

# Copy barretenberg/ts (needed for @aztec/bb.js symlink)
COPY --from=simulator-builder /home/fuzzer/aztec-packages/barretenberg/ts \
    ./aztec-packages/barretenberg/ts/

# Copy noir packages (needed for portal symlinks)
COPY --from=simulator-builder /home/fuzzer/aztec-packages/noir/packages \
    ./aztec-packages/noir/packages/

# Create directories for corpus, sync_corpus, and crashes
RUN mkdir -p aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/corpus/tx \
    aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/sync_corpus/tx \
    corpus output crash-reports artifacts

# Make run_fuzzer.sh executable
RUN chmod +x aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/run_fuzzer.sh

# Copy entrypoint script
COPY container-builds/avm-fuzzing-container/src/entrypoint.sh .
RUN chmod +x entrypoint.sh

# Set working directory
WORKDIR /home/fuzzer/aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer

ENTRYPOINT ["/home/fuzzer/entrypoint.sh"]
