FROM aztecprotocol/build:3.0-amd64 AS builder

ARG COMMIT=""

# Install ldid (not included in build image, only in basebox)
RUN curl -sL https://github.com/ProcursusTeam/ldid/releases/download/v2.1.5-procursus7/ldid_linux_x86_64 -o /usr/local/bin/ldid \
    && chmod +x /usr/local/bin/ldid

# Install Node.js 24 (build image has Node 22, but bootstrap requires 24)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs

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

WORKDIR /root/aztec-packages/barretenberg/cpp

# Build AVM with ASAN and run AVM proven bulk test
# If sanitizer reports errors, this will fail and the container will exit with a non-zero status
RUN cmake . --preset=asan && \
    cmake --build build-asan --target bb-avm && \
    mv build-asan/bin/bb-avm build/bin/bb-avm && \
    cd /root/aztec-packages/yarn-project/bb-prover && \
    yarn test -t 'AVM proven bulk test' --verbose

# Build AVM with MSAN and run AVM proven bulk test
# If sanitizer reports errors, this will fail and the container will exit with a non-zero status
RUN cmake . --preset=msan && \
    cmake --build build-msan --target bb-avm && \
    mv build-msan/bin/bb-avm build/bin/bb-avm && \
    cd /root/aztec-packages/yarn-project/bb-prover && \
    yarn test -t 'AVM proven bulk test' --verbose
