FROM aztecprotocol/noir as noir

WORKDIR /usr/src/noir-contracts
# Copy in noir contracts
COPY . .
COPY ../aztec-nr ./aztec-nr
# Clean
RUN rm -rf .tsbuildinfo ./target
# Build
RUN ./scripts/compile.sh && ./scripts/transpile.sh