# Stage 1: Get built nargo binary
FROM aztecprotocol/noir AS built-noir

# Stage 2: Get built avm-transpiler binary
FROM aztecprotocol/avm-transpiler AS built-transpiler

# Stage 3: Final image
FROM ubuntu:noble

# Install required packages
RUN apt-get update \
    && apt-get install -y \
        git \
        tini \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set up binary paths
ENV NARGO_BIN=/usr/bin/nargo \
    TRANSPILER_BIN=/usr/bin/avm-transpiler \
    SCRIPT_PATH=/usr/src/avm-transpiler/scripts

# Copy binaries and script
COPY --from=built-noir /usr/src/noir/noir-repo/target/release/nargo ${NARGO_BIN}
COPY --from=built-transpiler /usr/src/avm-transpiler/target/release/avm-transpiler ${TRANSPILER_BIN}
COPY ./avm-transpiler/scripts/compile_then_transpile.sh ${SCRIPT_PATH}/compile_then_transpile.sh

# Use tini as init process
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/src/avm-transpiler/scripts/compile_then_transpile.sh"]
