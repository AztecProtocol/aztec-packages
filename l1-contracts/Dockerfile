FROM node:18.19.1-slim
RUN apt update && apt install -y curl jq pip git

# Install solhint.
RUN npm install -g solhint

# Install slither.
RUN pip install --no-cache-dir --break-system-packages slither-analyzer==0.10.0 slitherin==0.5.0

# Install foundry.
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH=${PATH}:/root/.foundry/bin
RUN foundryup

WORKDIR /usr/src/l1-contracts
COPY . .
RUN git init && git add . && yarn lint && yarn slither && yarn slither-has-diff
RUN forge clean && forge fmt --check && forge build && forge test

FROM scratch
COPY --from=0 /usr/src/l1-contracts/out /usr/src/l1-contracts/out