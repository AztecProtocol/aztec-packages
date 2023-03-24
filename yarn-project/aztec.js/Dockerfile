FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder
COPY foundation foundation
COPY ethereum.js ethereum.js
COPY merkle-tree merkle-tree
COPY archiver archiver
COPY world-state world-state
COPY p2p p2p
COPY aztec-node aztec-node
COPY acir-simulator acir-simulator
COPY kernel-prover kernel-prover
COPY aztec-rpc aztec-rpc
COPY aztec.js aztec.js
RUN cd ethereum.js && yarn build
RUN cd archiver && yarn build 
RUN cd merkle-tree && yarn build 
RUN cd world-state && yarn build
RUN cd p2p && yarn build
RUN cd aztec-node && yarn build
RUN cd acir-simulator && yarn build
RUN cd kernel-prover && yarn build
RUN cd aztec-rpc && yarn build
WORKDIR /usr/src/yarn-project/aztec.js
RUN yarn build && yarn formatting && yarn test

# Prune dev dependencies. See comment in base image.
RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM node:18-alpine
COPY --from=builder /usr/src/yarn-project/aztec.js /usr/src/yarn-project/aztec.js
WORKDIR /usr/src/yarn-project/aztec.js
ENTRYPOINT ["yarn"]