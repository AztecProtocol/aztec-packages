FROM aztecprotocol/noir as noir
FROM aztecprotocol/aztec-nr as aztec-nr
FROM aztecprotocol/noir-protocol-circuits as noir-protocol-circuits
FROM aztecprotocol/avm-transpiler as transpiler
FROM node:18.19.0

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
RUN yarn build