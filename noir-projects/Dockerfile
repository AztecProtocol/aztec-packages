FROM 278380418400.dkr.ecr.us-east-2.amazonaws.com/noir:cache-a4626cc4d5f6d0e3e9072af37d45826b295e0e7c as noir
FROM 278380418400.dkr.ecr.us-east-2.amazonaws.com/avm-transpiler:cache-6b4e5a4eab181a710269d48de4917273f222c5e3 as transpiler
#FROM aztecprotocol/noir as noir
#FROM aztecprotocol/avm-transpiler as transpiler

FROM ubuntu:lunar AS builder
RUN apt-get update && apt-get install -y parallel jq
# Copy in nargo
COPY --from=noir /usr/src/noir/noir-repo/target/release/nargo /usr/src/noir/noir-repo/target/release/nargo
ENV PATH="/usr/src/noir/noir-repo/target/release:${PATH}"
# Copy in transpiler
COPY --from=transpiler /usr/src/avm-transpiler/target/release/avm-transpiler /usr/src/avm-transpiler/target/release/avm-transpiler
ENV PATH="/usr/src/avm-transpiler/target/release:${PATH}"
# Copy in noir projects
WORKDIR /usr/src/noir-projects
COPY . .
# Build
WORKDIR /usr/src/noir-projects/noir-contracts
RUN echo foo
RUN ./bootstrap.sh && nargo test --silence-warnings
# WORKDIR /usr/src/noir-projects/noir-protocol-circuits
# RUN ./bootstrap.sh && nargo test --silence-warnings
# WORKDIR /usr/src/noir-projects/aztec-nr
# RUN nargo test --silence-warnings

FROM scratch
COPY --from=builder /usr/src/noir-projects /usr/src/noir-projects