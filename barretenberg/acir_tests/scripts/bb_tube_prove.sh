#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ../acir_tests/$1

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

bb=$(../../../cpp/scripts/find-bb)
# TODO(https://github.com/AztecProtocol/barretenberg/issues/1252): deprecate in favor of normal proving flow
$bb OLD_API write_arbitrary_valid_client_ivc_proof_and_vk_to_file ${VERBOSE:+-v} -o output-$$
$bb prove_tube ${VERBOSE:+-v} -k output-$$/vk -o output-$$
# TODO(https://github.com/AztecProtocol/barretenberg/issues/1322): Just call verify.
$bb verify_tube ${VERBOSE:+-v} -o output-$$
