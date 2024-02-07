FROM aztecprotocol/noir as noir
FROM aztecprotocol/aztec-nr as aztec-nr
FROM node:18.19.0

# Copy in nargo
COPY --from=noir /usr/src/noir/target/release/nargo /usr/src/noir/target/release/nargo
# Copy in aztec-nr
COPY --from=aztec-nr /usr/src/aztec-nr /usr/src/yarn-project/aztec-nr

WORKDIR /usr/src/noir-contracts
# Copy in noir contracts
COPY . .
# Clean
RUN rm -rf .tsbuildinfo ./target
# Build
RUN ./scripts/compile.sh && ./scripts/transpile.sh