FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/barretenberg-x86_64-linux-clang-assert

FROM node:18-alpine
RUN apk update && apk add git bash curl jq
COPY --from=0 /usr/src/barretenberg/cpp/build /usr/src/barretenberg/cpp/build
WORKDIR /usr/src/barretenberg/acir_tests
COPY . .
# Run every acir test through a solidity verifier".
RUN (cd sol-test && yarn)
RUN FLOW=sol ./run_acir_tests.sh
