#!/usr/bin/env bash
# This script runs all test suites that have not been broken out into their own jobs for parallelisation.
# Might be better to list exclusions here rather than inclusions as risky to maintain.
set -eu

cd $(dirname $0)

TESTS=(
  flavor_tests
  relations_tests
  transcript_tests
  commitment_schemes_tests
  sumcheck_tests
  eccvm_tests
  translator_vm_tests
  protogalaxy_tests
  ultra_honk_tests
  goblin_tests
  client_ivc_tests
  dsl_tests
  crypto_aes128_tests
  crypto_blake2s_tests
  crypto_blake3s_tests
  crypto_ecdsa_tests
  crypto_pedersen_commitment_tests
  crypto_pedersen_hash_tests
  crypto_poseidon2_tests
  crypto_schnorr_tests
  crypto_sha256_tests
  ecc_tests
  join_split_example_proofs_inner_proof_data_tests
  join_split_example_proofs_notes_tests
  numeric_tests
  plonk_tests
  polynomials_tests
  srs_tests
  vm_tests
)
TESTS_STR="${TESTS[@]}"

cd /usr/src/barretenberg/cpp
srs_db/download_ignition.sh 1
srs_db/download_grumpkin.sh
cd build
for BIN in $TESTS_STR; do ./bin/$BIN; done
