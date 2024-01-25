# Building requires foundry.
FROM ghcr.io/foundry-rs/foundry:nightly-c331b5eeee1b4151ef7354a081667e2d770b37f5
# Required for foundry
RUN apk update && apk add git jq bash nodejs npm yarn python3 py3-pip && pip3 install slither-analyzer
WORKDIR /usr/src/l1-contracts
COPY . .
RUN git init
# Install deps
RUN forge install --no-commit \
  https://github.com/foundry-rs/forge-std \
  https://github.com/openzeppelin/openzeppelin-contracts
# Run build and tests
RUN forge clean && forge fmt --check && forge build && forge test
#RUN yarn && yarn lint &&  yarn slither && yarn slither-has-diff