# to get built nargo binary
FROM aztecprotocol/noir as built-noir

# to get built avm-transpiler binary
FROM aztecprotocol/avm-transpiler as built-transpiler


FROM ubuntu:lunar
# Install Tini as nargo doesn't handle signals properly.
# Install git as nargo needs it to clone.
RUN apt-get update && apt-get install -y git tini && rm -rf /var/lib/apt/lists/* && apt-get clean
ENV PATH="/usr/src/noir/noir-repo/target/release:${PATH}"
ENV PATH="/usr/src/avm-transpiler/target/release:${PATH}"
COPY --from=built-noir /usr/src/noir/noir-repo/target/release/nargo /usr/src/noir/noir-repo/target/release/nargo
COPY --from=built-transpiler /usr/src/avm-transpiler/target/release/avm-transpiler /usr/src/avm-transpiler/target/release/avm-transpiler

# Grab the compiler script
WORKDIR /usr/src
COPY ./avm-transpiler/scripts/compile_then_transpile.sh ./avm-transpiler/scripts/compile_then_transpile.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/src/avm-transpiler/scripts/compile_then_transpile.sh"]
