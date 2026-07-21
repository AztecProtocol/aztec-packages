# External Audit Scope: ECCVM
Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit: 2a49eb6

## What is this document?
This document provides scope for the ECCVM audit. From the perspective of security, we are mostly concerned with the soundness of the ECCVM _verifier_.

What needs to be audited are: the structure of the circuit, witness generation, and the constraints on the execution trace. In particular, the scope of this audit _does not include_ the sumcheck proving of an ECCVM circuit.

Commitment Hash: 2a49eb6

## Files to be audited.
Inside of `barretenberg/eccvm`:
* `eccvm_circuit_builder.*pp`
* `transcript_builder.hpp`
* `precomputed_tables_builder.hpp`
* `msm_builder.hpp`
* `eccvm_flavor.hpp`

Inside of `barretenberg/relations/ecc_vm`:
* `ecc_bools_relation_impl.hpp`
* `ecc_lookup_relation.hpp`
* `ecc_msm_relation_impl.hpp`
* `ecc_point_table_relation_impl.hpp`
* `ecc_set_relation_impl.hpp`
* `ecc_transcript_relation_impl.hpp`
* `ecc_wnaf_relation_impl.hpp`


## Summary of the ECCVM
A helpful guide to the meaning of the columns/structure of the execution trace is contained: `barretenberg/eccvm/README.md`. Skimming this document is probably the best way to start.

## Structure of the circuit.
This is contained in `barretenberg/eccvm/eccvm_flavor.hpp`. This file also has a detailed description of the columns (a.k.a witness vectors).

This file is quite long but much of it is boilerplate repetition of the information of the wires. Special attention should be given to the `ProverPolynomials` class.

There are three `PrecomputedEntities`, which are explicated in this file: `lagrange_first`, `lagrange_second`, and `lagrange_last`.


### Not to be audited

As explained above, anything to do with the final proof or the sumcheck is not in the scope of this current audit. For instance, the formula for
`static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS` need not be audited.

Similarly, the `IPATranscript` is not in the scope of the current audit.

The `skip_entire_row` is a client-side optimization related to sumcheck that is not in the scope of the current audit. (We are not completely sure that it is complete, but it may always just be turned off.)
## Witness generation
The code is contained in the following, in `barretenberg/eccvm`:
* `eccvm_circuit_builder.*pp`
* `transcript_builder.hpp`
* `precomputed_tables_builder.hpp`
* `msm_builder.hpp`

Here, it will probably be helpful to consult the `README`.
## Constraints

The constraints may be found in the folder `barretenberg/relations/ecc_vm`. The content of the relations is contained in those files that end with `_impl.hpp`, except for the lookup relation, where the content may be found in `lookup_relation.hpp`. In sum, the files that need to be audited from the constraint-side are:
* `ecc_bools_relation_impl.hpp`
* `ecc_lookup_relation.hpp`
* `ecc_msm_relation_impl.hpp`
* `ecc_point_table_relation_impl.hpp`
* `ecc_set_relation_impl.hpp`
* `ecc_transcript_relation_impl.hpp`
* `ecc_wnaf_relation_impl.hpp`

## Testing
Testing for the ECCVM that is relevant for this audit may be found
* `barretenberg/eccvm/eccvm_circuit_builder.test.cpp`.

Rather than a full prove/verify, this testing suite uses the _circuit checker_, which may be found:
* `barretenberg/eccvm/eccvm_trace_checker.cpp`

We emphasize: this latter file _need not_ be audited.
