FROM aztecprotocol/noir as noir
FROM aztecprotocol/avm-transpiler as transpiler
FROM aztecprotocol/yarn-project AS yarn-project

FROM ubuntu:lunar AS builder
RUN apt-get update && apt-get install -y parallel nodejs npm 
RUN npm install --global yarn
# Copy in nargo
COPY --from=noir /usr/src/noir/noir-repo/target/release/nargo /usr/src/noir/noir-repo/target/release/nargo
ENV PATH="/usr/src/noir/noir-repo/target/release:${PATH}"
# Copy in transpiler
COPY --from=transpiler /usr/src/avm-transpiler/target/release/avm-transpiler /usr/src/avm-transpiler/target/release/avm-transpiler
ENV PATH="/usr/src/avm-transpiler/target/release:${PATH}"
# Copy in noir projects
WORKDIR /usr/src/noir-projects
COPY . .

# Launch TXE
WORKDIR /usr/src/yarn-project/txe
RUN yarn start & echo $! > /tmp/txe.pid

# Build
WORKDIR /usr/src/noir-projects/noir-contracts
RUN ./bootstrap.sh && nargo test --silence-warnings --oracle-resolver http://localhost:8080
WORKDIR /usr/src/noir-projects/noir-protocol-circuits
RUN ./bootstrap.sh && nargo test --silence-warnings
WORKDIR /usr/src/noir-projects/aztec-nr
RUN nargo test --silence-warnings --oracle-resolver http://localhost:8080

# Kill TXE
RUN kill $(cat /tmp/txe.pid)

FROM scratch
COPY --from=builder /usr/src/noir-projects /usr/src/noir-projects