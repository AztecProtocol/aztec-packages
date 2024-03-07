FROM ubuntu:lunar as builder

RUN apt update && apt install -y \
  build-essential \
  curl \
  git \
  cmake \
  lsb-release \
  wget \
  software-properties-common \
  gnupg \
  ninja-build \
  npm \
  libssl-dev \
  jq \
  bash \
  libstdc++6

RUN wget https://apt.llvm.org/llvm.sh && chmod +x llvm.sh && ./llvm.sh 16

WORKDIR /usr/src/barretenberg/cpp

COPY ./cpp .
# Build everything to ensure everything builds. All tests will be run from the result of this build.
RUN cmake --preset clang16  && cmake --build --preset clang16 --target solidity_key_gen solidity_proof_gen

# FROM docker.io/frolvlad/alpine-glibc:alpine-3.17_glibc-2.34 as builder
# RUN apk update && apk add git curl build-base openmp-dev bash
FROM ubuntu:lunar
RUN apt update && apt install -y \
  build-essential \
  curl \
  git \
  bash \
  libomp-dev

COPY --from=builder /usr/src/barretenberg/cpp/build/bin /usr/src/barretenberg/cpp/build/bin
COPY --from=builder /usr/src/barretenberg/cpp/srs_db /usr/src/barretenberg/cpp/srs_db
WORKDIR /usr/src/barretenberg/sol
COPY ./sol .

# Copy forge binary directly from foundry
# COPY --from=ghcr.io/foundry-rs/foundry:latest /usr/local/bin/forge /usr/local/bin/forge
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="${PATH}:/root/.foundry/bin"
RUN foundryup

RUN cd ../cpp/srs_db && ./download_ignition.sh 3 && cd ../../sol

RUN ./scripts/init.sh

# TestBase is excluded as it is just boilerplate
RUN forge test --no-match-contract TestBase
