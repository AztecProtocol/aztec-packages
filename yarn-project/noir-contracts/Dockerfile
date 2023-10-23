FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/noir-compiler-build

RUN apk add bash perl

WORKDIR /usr/src/yarn-project/
COPY noir-contracts noir-contracts
COPY aztec-nr aztec-nr

WORKDIR /usr/src/yarn-project/noir-contracts
RUN yarn noir:build:all
