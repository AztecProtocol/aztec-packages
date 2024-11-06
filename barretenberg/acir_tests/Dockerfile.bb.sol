FROM aztecprotocol/barretenberg-x86_64-linux-clang-assert
FROM aztecprotocol/barretenberg-x86_64-linux-clang-sol
FROM aztecprotocol/noir-compile-acir-tests as noir-acir-tests

FROM node:18.19.0
RUN apt update && apt install git bash curl jq -y
COPY --from=0 /usr/src/barretenberg/cpp/build /usr/src/barretenberg/cpp/build
COPY --from=1 /usr/src/barretenberg/sol/src/ultra/BaseUltraVerifier.sol /usr/src/barretenberg/sol/src/ultra/BaseUltraVerifier.sol
COPY --from=noir-acir-tests /usr/src/noir/noir-repo/test_programs /usr/src/noir/noir-repo/test_programs

RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="${PATH}:/root/.foundry/bin"
RUN foundryup -v nightly-25f24e677a6a32a62512ad4f561995589ac2c7dc

WORKDIR /usr/src/barretenberg/acir_tests
COPY . .
# Run the relevant acir tests through a solidity verifier.
# This includes the basic `assert_statement` test that contains a single public input
# and the recursive aggregation circuits which use the Keccak based prover.
#
# NOTE: The solidity verifier expects proofs whose transcript uses Keccak hashing,
# for which we have to invoke the backend prover without the `--recursive` flag.
RUN (cd sol-test && yarn)
RUN PARALLEL=1 FLOW=sol ./run_acir_tests.sh assert_statement double_verify_proof double_verify_nested_proof
