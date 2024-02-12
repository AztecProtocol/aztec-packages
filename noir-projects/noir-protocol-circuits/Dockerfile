FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/noir as noir
FROM node:18.19.0

# Copy in nargo
COPY --from=noir /usr/src/noir/target/release/nargo /usr/src/noir/target/release/nargo

WORKDIR /usr/src/noir-protocol-circuits
# Copy in noir contracts
COPY . .
# Build
RUN yarn build