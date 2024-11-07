# Produces a container that can be run to test a specific box. See docker-compose.yml.
FROM aztecprotocol/aztec AS aztec
FROM aztecprotocol/noir as noir
FROM aztecprotocol/noir-projects as noir-projects
FROM --platform=linux/amd64 aztecprotocol/barretenberg-x86_64-linux-clang as barretenberg
FROM aztecprotocol/avm-transpiler AS transpiler

# We need yarn. Start fresh container.
FROM node:18.19.0
RUN apt update && apt install netcat-openbsd jq
COPY --from=aztec /usr/src /usr/src
COPY --from=noir-projects /usr/src/noir-projects/aztec-nr /usr/src/noir-projects/aztec-nr
COPY --from=noir-projects /usr/src/noir-projects/noir-protocol-circuits/crates/types /usr/src/noir-projects/noir-protocol-circuits/crates/types
# Copy binaries to /usr/bin
COPY --from=noir /usr/src/noir/noir-repo/target/release/nargo /usr/src/noir/noir-repo/target/release/nargo
COPY --from=transpiler /usr/src/avm-transpiler/target/release/avm-transpiler /usr/bin/avm-transpiler
COPY --from=barretenberg /usr/src/barretenberg/cpp/build/bin/bb /usr/bin/bb

WORKDIR /usr/src/boxes
COPY . .
ENV AZTEC_NARGO=/usr/aztec-nargo/compile_then_postprocess.sh
ENV AZTEC_BUILDER=/usr/src/yarn-project/builder/aztec-builder-dest
RUN yarn
RUN npx -y playwright@1.42 install --with-deps
ENTRYPOINT ["/bin/sh", "-c"]
