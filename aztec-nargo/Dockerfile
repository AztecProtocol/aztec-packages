# to get built nargo binary
FROM aztecprotocol/noir AS built-noir

# to get built avm-transpiler binary
FROM aztecprotocol/avm-transpiler AS built-transpiler

# to get built barretenberg binary
FROM --platform=linux/amd64 aztecprotocol/barretenberg-x86_64-linux-clang as barretenberg


FROM ubuntu:noble
# Install Tini as nargo doesn't handle signals properly.
# Install git as nargo needs it to clone.
RUN apt-get update && apt-get install -y git tini jq curl nodejs npm && rm -rf /var/lib/apt/lists/* && apt-get clean

# Copy binaries to /usr/bin
COPY --from=built-noir /usr/src/noir/noir-repo/target/release/nargo /usr/bin/nargo
COPY --from=built-transpiler /usr/src/avm-transpiler/target/release/avm-transpiler /usr/bin/avm-transpiler
COPY --from=barretenberg /usr/src/barretenberg/cpp/build/bin/bb /usr/bin/bb

# Copy in script that calls both binaries
COPY ./aztec-nargo/compile_then_postprocess.sh /usr/src/aztec-nargo/compile_then_postprocess.sh

# Profiler
COPY --from=built-noir /usr/src/noir/noir-repo/target/release/noir-profiler /usr/bin/noir-profiler
COPY ./noir-projects/noir-contracts/scripts/flamegraph.sh /usr/bin/flamegraph.sh
COPY ./noir-projects/noir-contracts/scripts/extractFunctionAsNoirArtifact.js /usr/bin/extractFunctionAsNoirArtifact.js

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/src/aztec-nargo/compile_then_postprocess.sh"]
