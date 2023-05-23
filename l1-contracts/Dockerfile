FROM ghcr.io/foundry-rs/foundry:nightly as builder

# Required for foundry
RUN apk update && apk add git

WORKDIR /usr/src/l1-contracts

# Install foundry
RUN git init

# Install deps
RUN forge install --no-commit \
  https://github.com/foundry-rs/forge-std \
  https://github.com/openzeppelin/openzeppelin-contracts

# Run build and tests
RUN forge clean && forge fmt --check && forge build && forge test

WORKDIR /usr/src/l1-contracts
