FROM aztecprotocol/bb.js
FROM aztecprotocol/noir-compile-acir-tests as noir-acir-tests

FROM node:18.19.0
COPY --from=0 /usr/src/barretenberg/ts-build /usr/src/barretenberg/ts
COPY --from=noir-acir-tests /usr/src/noir/noir-repo/test_programs /usr/src/noir/noir-repo/test_programs
RUN apt update && apt install -y lsof jq
WORKDIR /usr/src/barretenberg/acir_tests
# Build/install ts apps.
COPY browser-test-app browser-test-app
COPY headless-test headless-test
RUN cd browser-test-app && yarn && yarn build
RUN cd headless-test && yarn && npx playwright install && npx playwright install-deps
COPY . .
ENV VERBOSE=1
# TODO(https://github.com/noir-lang/noir/issues/5106)
# TODO(https://github.com/AztecProtocol/aztec-packages/issues/6672)

# TODO(AD) Removed content. TODO remove these.
