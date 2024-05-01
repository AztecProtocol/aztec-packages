FROM rust:bullseye as builder

WORKDIR /usr/src
COPY ./avm-transpiler ./avm-transpiler
COPY ./noir ./noir

WORKDIR /usr/src/avm-transpiler
RUN apt-get update && apt-get install -y git
RUN ./scripts/bootstrap_native.sh

# to get built nargo binary
FROM aztecprotocol/noir as built-noir

FROM ubuntu:lunar
# Install Tini as nargo doesn't handle signals properly.
# Install git as nargo needs it to clone.
RUN apt-get update && apt-get install -y git tini && rm -rf /var/lib/apt/lists/* && apt-get clean
ENV PATH="/usr/src/noir/noir-repo/target/release:${PATH}"
ENV PATH="/usr/src/avm-transpiler/target/release:${PATH}"
COPY --from=builder /usr/src/avm-transpiler/target/release/avm-transpiler /usr/src/avm-transpiler/target/release/avm-transpiler
COPY --from=builder /usr/src/avm-transpiler/scripts/compile_then_transpile.sh /usr/src/avm-transpiler/scripts/compile_then_transpile.sh
COPY --from=built-noir /usr/src/noir/noir-repo/target/release/nargo /usr/src/noir/noir-repo/target/release/nargo
ENTRYPOINT ["/usr/bin/tini", "--"]
