# External Audit Scope: ECCVM

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: set when the audit starts. File list checked against `a18e6e7` (branch `v6`).

## What is this document?
This document provides scope for the ECCVM audit. From the perspective of security, we are mostly concerned with the soundness of the ECCVM _verifier_.

What needs to be audited are: the structure of the circuit, witness generation, and the constraints on the execution trace. In particular, the scope of this audit _does not include_ the sumcheck proving of an ECCVM circuit.

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Circuit structure and witness generation
1. `eccvm/eccvm_circuit_builder.hpp`
2. `eccvm/transcript_builder.hpp`
3. `eccvm/precomputed_tables_builder.hpp`
4. `eccvm/msm_builder.hpp`
5. `eccvm/eccvm_flavor.hpp`

### Constraints (relations evaluated by the verifier)
The content of each relation is in the file ending `_impl.hpp`, except for the lookup relation, whose content is in `ecc_lookup_relation.hpp`.

6. `relations/ecc_vm/ecc_bools_relation_impl.hpp`
7. `relations/ecc_vm/ecc_lookup_relation.hpp`
8. `relations/ecc_vm/ecc_msm_relation_impl.hpp`
9. `relations/ecc_vm/ecc_point_table_relation_impl.hpp`
10. `relations/ecc_vm/ecc_set_relation_impl.hpp`
11. `relations/ecc_vm/ecc_transcript_relation_impl.hpp`
12. `relations/ecc_vm/ecc_wnaf_relation_impl.hpp`
13. `relations/ecc_vm/ecc_shiftable_init_relation.hpp`, `relations/ecc_vm/ecc_shiftable_init_relation_impl.hpp`

### Prover-only short-monomial relations
The ECCVM prover uses `ECCVMShortMonomialFlavor`. The native and recursive verifiers evaluate only the full relations above. Each short relation must give the same per-subrelation contributions as its full counterpart, in the same subrelation index range. A mismatch breaks completeness, not soundness.

14. `eccvm/eccvm_short_monomial_flavor.hpp`
15. `relations/ecc_vm/ecc_short_monomial_relation_utils.hpp`
16. `relations/ecc_vm/ecc_{bools,lookup,msm,point_table,set,transcript,wnaf}_short_relation.hpp` and the matching `*_short_relation_impl.hpp`
17. `relations/ecc_vm/ecc_transcript_msm_transition_short_relation.hpp`, `relations/ecc_vm/ecc_transcript_msm_transition_short_relation_impl.hpp`

## Summary of the ECCVM
`eccvm/README.md` describes the meaning of the columns and the structure of the execution trace. Skimming it is probably the best way to start. It is also helpful for the witness generation files (items 1-4).

## Structure of the circuit
The structure is in `eccvm/eccvm_flavor.hpp`. This file also has a detailed description of the columns (also called witness vectors).

This file is quite long, but much of it is boilerplate repetition of the information of the wires. Give special attention to the `ProverPolynomials` class.

There are four `PrecomputedEntities`, described in this file: `lagrange_first`, `lagrange_second` (hiding op row), `lagrange_third` (first real op row) and `lagrange_last`.

`ECCVMShiftableInitRelation` pins every shiftable column to 0 at the `lagrange_first` row, where shiftability alone does not force it. Its header comment lists the columns it pins and the columns pinned by other relations.

## Not to be audited

Anything to do with the final proof or the sumcheck is out of scope. This includes:
- the `IPATranscript` in `eccvm_flavor.hpp`;
- the ECCVM opening proof, TripleIPA (`commitment_schemes/triple_ipa/`, documented in `commitment_schemes/triple_ipa/PROTOCOL.md`). TripleIPA is in `sumcheck_pcs_chonk_verifier_audit_scope.md`;
- the trace checker `eccvm/eccvm_trace_checker.cpp` (see Test Files).

## Test Files
1. `eccvm/eccvm_circuit_builder.test.cpp`
2. `eccvm/eccvm_relation_corruption.test.cpp`
3. `eccvm/eccvm.test.cpp`, including `ShortMonomialRelationsMatchFullEdgeRelations`, which checks the short relations against the full ones

The circuit builder tests use the _trace checker_ instead of a full prove/verify. The trace checker is `eccvm/eccvm_trace_checker.cpp`. It _need not_ be audited.

## Security Mechanisms
1. `eccvm/eccvm.fuzzer.cpp` (see `eccvm/README_FUZZERS.md`)
