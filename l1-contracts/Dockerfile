# Building requires foundry.
# FROM ghcr.io/foundry-rs/foundry:nightly-4a643801d0b3855934cdec778e33e79c79971783
FROM ubuntu:lunar
RUN apt update && apt install git jq bash nodejs npm yarn python3 python3-pip -y && pip3 install slither-analyzer==0.10.0 slitherin==0.5.0

RUN curl -L https://foundry.paradigm.xyz | bash
RUN source ~/.bashrc
ENV PATH="~/.foundry/bin:${PATH}"
RUN foundryup

WORKDIR /usr/src/l1-contracts
COPY . .
RUN git init
RUN forge clean && forge fmt --check && forge build && forge test
RUN yarn && yarn lint
RUN git add . && yarn slither && yarn slither-has-diff
RUN forge build

FROM scratch
COPY --from=0 /usr/src/l1-contracts/out /usr/src/l1-contracts/out
