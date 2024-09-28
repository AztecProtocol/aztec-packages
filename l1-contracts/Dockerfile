# Building requires foundry.
FROM ubuntu:lunar

RUN apt update && apt install curl git jq bash nodejs npm python3.11-full python3-pip -y

# Use virtualenv, do not try to use pipx, it's not working.
# RUN python3 -m venv /root/.venv
# RUN /root/.venv/bin/pip3 install slither-analyzer==0.10.0 slitherin==0.5.0
RUN curl -L https://foundry.paradigm.xyz | bash

# Set env variables for foundry and venv
ENV PATH="${PATH}:/root/.foundry/bin:/root/.venv/bin"
RUN foundryup --version nightly-25f24e677a6a32a62512ad4f561995589ac2c7dc6

WORKDIR /usr/src/l1-contracts
COPY . .

# Cleanup CI/CD files
RUN rm -rf terraform scripts

#RUN git init
RUN forge clean && forge fmt --check && forge build && forge test --no-match-contract UniswapPortalTest

RUN npm install --global solhint
RUN solhint --config ./.solhint.json --fix "src/**/*.sol"

# RUN git add . && yarn slither && yarn slither-has-diff
RUN forge build

FROM scratch
COPY --from=0 /usr/src/l1-contracts/ /usr/src/l1-contracts/
