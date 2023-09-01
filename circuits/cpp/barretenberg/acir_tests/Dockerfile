FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/barretenberg-x86_64-linux-clang-assert
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/bb.js

FROM node:18-alpine AS native_and_node_tests
RUN apk update && apk add git bash curl jq
COPY --from=0 /usr/src/barretenberg/cpp/build /usr/src/barretenberg/cpp/build
COPY --from=1 /usr/src/barretenberg/ts /usr/src/barretenberg/ts
WORKDIR /usr/src/barretenberg/acir_tests
COPY . .
# Run every acir test through native bb build "prove_and_verify".
RUN ./run_acir_tests.sh
# Run 1_mul through native bb build, all_cmds flow, to test all cli args.
ENV VERBOSE=1
RUN FLOW=all_cmds ./run_acir_tests.sh 1_mul
# Run 1_mul through bb.js build, all_cmds flow, to test all cli args.
RUN BIN=../ts/dest/node/main.js FLOW=all_cmds ./run_acir_tests.sh 1_mul
# Run double_verify_proof through bb.js on node to check 512k support.
# TODO: double_verify_proof recently broke. fix!
# RUN BIN=../ts/dest/node/main.js ./run_acir_tests.sh double_verify_proof

FROM node:18 AS browser_tests
COPY --from=1 /usr/src/barretenberg/ts /usr/src/barretenberg/ts
RUN apt update && apt install lsof
WORKDIR /usr/src/barretenberg/acir_tests
# Build/install ts apps.
COPY browser-test-app browser-test-app
COPY headless-test headless-test
RUN (cd browser-test-app && yarn && yarn build) && (cd headless-test && yarn && npx playwright install && npx playwright install-deps)
COPY . .
# Run 1_mul through bb.js on chrome/webkit, both single and multi-threaded, to test browser support.
# TODO: Change to double_verify_proof when fixed!
RUN ./run_acir_tests_browser.sh 1_mul