# AVM TX Fuzzer Container
# Builds a container that can run the AVM transaction fuzzer
#
# Build latest from 'next' branch:
#   docker build -t avm-tx-fuzzer container-builds/avm-fuzzing-container/src/
#
# Build specific commit:
#   docker build -t avm-tx-fuzzer --build-arg COMMIT=<sha> container-builds/avm-fuzzing-container/src/

FROM aztecprotocol/build:3.0-amd64 AS builder

ARG COMMIT=""

# Install ldid (not included in build image, only in basebox)
RUN curl -sL https://github.com/ProcursusTeam/ldid/releases/download/v2.1.5-procursus7/ldid_linux_x86_64 -o /usr/local/bin/ldid \
    && chmod +x /usr/local/bin/ldid

WORKDIR /root

# Clone the repository
RUN git clone https://github.com/AztecProtocol/aztec-packages.git --depth 1 --branch next && \
    cd aztec-packages && \
    if [ -n "$COMMIT" ]; then \
        git fetch origin $COMMIT --depth 1; \
        git checkout $COMMIT || exit 1; \
    fi

WORKDIR /root/aztec-packages

# Run bootstrap up to yarn-project (release-image needs docker which isn't available)
RUN BOOTSTRAP_TO=yarn-project ./bootstrap.sh

# Build the tx fuzzer
WORKDIR /root/aztec-packages/barretenberg/cpp
RUN cmake --preset fuzzing-avm
RUN cmake --build build-fuzzing-avm --target avm_fuzzer_tx_fuzzer

# =============================================================================
# Runtime image
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
    curl && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    corepack enable && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN useradd -m fuzzer -G sudo

# Create a dummy sudo wrapper that just executes the command
# (Node.js 24 nodesource script calls sudo which isn't installed)
RUN mkdir -p /usr/local/bin && \
    printf '#!/bin/sh\nexec "$@"\n' > /usr/local/bin/sudo && \
    chmod +x /usr/local/bin/sudo

WORKDIR /home/fuzzer

# Copy fuzzer binary
COPY --from=builder /root/aztec-packages/barretenberg/cpp/build-fuzzing-avm/bin/avm_fuzzer_tx_fuzzer \
    ./aztec-packages/barretenberg/cpp/build-fuzzing-avm/bin/

# Copy run_fuzzer.sh
COPY --from=builder /root/aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/run_fuzzer.sh \
    ./aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/

# Copy yarn-project (fully built)
COPY --from=builder /root/aztec-packages/yarn-project \
    ./aztec-packages/yarn-project/

# Copy barretenberg/ts (for @aztec/bb.js)
COPY --from=builder /root/aztec-packages/barretenberg/ts \
    ./aztec-packages/barretenberg/ts/

# Copy noir packages (for portal symlinks)
COPY --from=builder /root/aztec-packages/noir/packages \
    ./aztec-packages/noir/packages/

# Create directories for corpus, crashes, etc.
RUN mkdir -p aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/corpus/tx \
    aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/sync_corpus/tx \
    corpus output crash-reports artifacts

# Make run_fuzzer.sh executable
RUN chmod +x aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/run_fuzzer.sh

# Copy entrypoint script
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

WORKDIR /home/fuzzer/aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer

ENTRYPOINT ["/home/fuzzer/entrypoint.sh"]
