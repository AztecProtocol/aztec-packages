FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/noir as noir
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/aztec-nr as aztec-nr
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/noir-protocol-circuits as noir-protocol-circuits
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/avm-transpiler as transpiler
FROM ubuntu:lunar

# Copy in nargo
COPY --from=noir /usr/src/noir/target/release/nargo /usr/src/noir/target/release/nargo
# Copy in aztec-nr
COPY --from=aztec-nr /usr/src/aztec-nr /usr/src/aztec-nr
# Copy in noir-protocol-circuits
COPY --from=noir-protocol-circuits /usr/src/noir-protocol-circuits /usr/src/noir-protocol-circuits
# Copy in transpiler
COPY --from=transpiler /usr/src/avm-transpiler/target/release/avm-transpiler /usr/src/avm-transpiler/target/release/avm-transpiler

WORKDIR /usr/src/noir-contracts
# Copy in noir contracts
COPY . .
# Build
RUN ./scripts/compile.sh && ./scripts/transpile.sh