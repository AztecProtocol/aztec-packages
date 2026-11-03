# External Audit Scope: IPA

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: set when the audit starts. File list checked against `a18e6e7` (branch `v6`).

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `commitment_schemes/ipa/ipa.hpp`: the IPA prover, native verifier and recursive verifier

## Summary of Module
The primary object of the audit is the IPA recursive verifier.

The ECCVM opens through TripleIPA (`commitment_schemes/triple_ipa/`), which reduces three opening claims to one IPA claim. TripleIPA is in `sumcheck_pcs_chonk_verifier_audit_scope.md`.

## Test Files
1. `commitment_schemes/ipa/ipa.test.cpp` (native)
2. `commitment_schemes_recursion/ipa_recursive.test.cpp` (recursive)

## Security Mechanisms
1. `commitment_schemes/ipa/ipa.fuzzer.cpp`: fuzzer
2. `boomerang_value_detection/graph_description_ipa_recursive.test.cpp`: boomerang detector
