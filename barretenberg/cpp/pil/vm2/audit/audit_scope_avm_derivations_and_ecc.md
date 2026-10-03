# External Audit Scope: Derivations, ECC, and Radix Decomposition

Commit hash: _TBD_

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Gadgets" audit scope (`audit_scope_avm_core.md`)
2. The "Poseidon2, Merkle Trees, and Note Hash Tree" audit scope (`audit_scope_avm_poseidon_merkle_note_hash.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Gadgets" audit (`audit_scope_avm_core.md`):**
- `precomputed.pil` -- Shared precomputed columns: lookup tables, range selectors, and static AVM parameters. Used by `to_radix`, `scalar_mul`, `address_derivation`, and `class_id_derivation` for lookup table access.

**From "Poseidon2, Merkle Trees, and Note Hash Tree" audit (`audit_scope_avm_poseidon_merkle_note_hash.md`):**
- `poseidon2_hash.pil` -- Full Poseidon2 hash. Used by `address_derivation` (salted init hash, partial address, public keys hash, preaddress) and `class_id_derivation` (class ID hash).

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `ecc.pil`
    - Grumpkin elliptic curve point addition gadget. Given two points P and Q on the Grumpkin curve (Short Weierstrass form: Y^2 = X^3 - 17), computes R = P + Q. Handles three cases: standard addition (different x-coordinates), point doubling (P == Q), and edge cases (point at infinity, inverse points). One row per computation. No dependencies on other PIL files. Used by `ecc_mem.pil` (ECADD opcode), `scalar_mul.pil` (double-and-add iterations), and `address_derivation.pil` (final address = preaddress_public_key + incoming_viewing_key).
2. `to_radix.pil`
    - Radix decomposition gadget. Decomposes a field element into limbs in a given radix (base 2-256). Multi-row computation: one row per limb, with an accumulator that reconstructs the value. Includes overflow protection by comparing against the field modulus decomposed in the same radix. Supports padding limbs (asserted zero) for callers requesting more limbs than needed. Depends on `precomputed.pil`. Used by `scalar_mul.pil` (bit decomposition of scalar) and `to_radix_mem.pil` (TORADIXBE opcode).
3. `scalar_mul.pil`
    - Grumpkin scalar point multiplication gadget. Given a point P and scalar s, computes sP using the double-and-add algorithm. Multi-row computation: 254 rows per multiplication (one per bit of the scalar). Each row performs a conditional point addition and a point doubling, both verified via lookups into `ecc.pil`. Bit correctness is verified via lookup into `to_radix.pil`. The start row contains the final result (reverse aggregation). Depends on `ecc.pil`, `to_radix.pil`, and `precomputed.pil`. Used by `address_derivation.pil` (preaddress = scalar_mul(preaddress_scalar, G1)).
4. `bytecode/class_id_derivation.pil`
    - Contract class ID derivation. Computes the class ID as `Poseidon2(DOM_SEP__CONTRACT_CLASS_ID, artifact_hash, private_functions_root, public_bytecode_commitment)` using two rounds of Poseidon2 hash lookups. One row per unique contract class. Depends on `poseidon2_hash.pil`, `constants_gen.pil`, and `precomputed.pil`. Used by `bc_retrieval.pil` to verify stored class IDs.
5. `bytecode/address_derivation.pil`
    - Contract address derivation. Derives a contract address from its preimage components through a multi-step process: (1) salted initialization hash via Poseidon2, (2) partial address via Poseidon2, (3) public keys hash via Poseidon2 (4 public key pairs hashed across 5 permutation rounds), (4) preaddress via Poseidon2, (5) preaddress public key via scalar multiplication of preaddress * G1, (6) final address as x-coordinate of preaddress_public_key + incoming_viewing_key via point addition. One row per address derivation. Depends on `ecc.pil`, `scalar_mul.pil`, `poseidon2_hash.pil`, `constants_gen.pil`, and `precomputed.pil`.

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `ecc_impl.hpp`
- `scalar_mul_impl.hpp`
- `to_radix_impl.hpp`
- `class_id_derivation_impl.hpp`
- `address_derivation_impl.hpp`

## Summary of Module

This audit covers the **elliptic curve, radix decomposition, and derivation subtraces** of the AVM circuit. These components implement the cryptographic operations needed to derive contract addresses and class IDs from their constituent parts.

The **ECC point addition** gadget (`ecc.pil`) is the foundational curve operation: it computes P + Q over the Grumpkin curve (a BN254/Grumpkin 2-cycle curve in Short Weierstrass form). It handles standard addition, point doubling, and all edge cases (point at infinity, inverse points) in a single trace row. The gadget does not depend on any other PIL files.

The **radix decomposition** gadget (`to_radix.pil`) decomposes a field element into limbs in a given radix (base 2 through 256). It is a multi-row computation with one row per limb, using an accumulator to reconstruct the original value and comparing against the field modulus for overflow protection.

The **scalar multiplication** gadget (`scalar_mul.pil`) computes sP for a Grumpkin point P and scalar s using the double-and-add algorithm. It generates 254 rows (one per scalar bit), with each row performing a conditional addition and a doubling -- both verified via lookups into `ecc.pil`. Bit correctness is ensured via lookup into `to_radix.pil`. The C++ simulation and trace generation for scalar multiplication are handled within the ECC gadget and trace builder files.

The **class ID derivation** (`class_id_derivation.pil`) computes a contract class ID as a Poseidon2 hash of the class members (domain separator, artifact hash, private functions root, and public bytecode commitment). It uses two Poseidon2 rounds to cover the 4 inputs and produces one row per unique class.

The **address derivation** (`address_derivation.pil`) is the most complex component in this scope. It derives a contract address through six sequential steps: (1) salted initialization hash, (2) partial address, (3) public keys hash (hashing 4 key pairs across 5 Poseidon2 rounds), (4) preaddress, (5) preaddress public key via scalar multiplication against the Grumpkin generator, and (6) final address as the x-coordinate of the sum of the preaddress public key and the incoming viewing key.

The dependency chain for components in this audit is:
- `ecc` (no dependencies)
- `to_radix` -> `precomputed`
- `scalar_mul` -> `ecc` + `to_radix` + `precomputed`
- `class_id_derivation` -> `poseidon2_hash` + `constants_gen` + `precomputed`
- `address_derivation` -> `ecc` + `scalar_mul` + `poseidon2_hash` + `constants_gen` + `precomputed`

Note: The memory-aware opcode wrappers `ecc_mem.pil` (ECADD opcode) and `to_radix_mem.pil` (TORADIXBE opcode) are **not** included in this scope. They bridge between the execution/memory infrastructure and the core gadgets audited here, and depend on `memory.pil` which is part of the execution infrastructure.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/ecc.test.cpp`
- `vm2/constraining/relations/to_radix.test.cpp`
- `vm2/constraining/relations/class_id_derivation.test.cpp`
- `vm2/constraining/relations/address_derivation.test.cpp`
- `vm2/tracegen/ecc_trace.test.cpp`
- `vm2/tracegen/class_id_derivation_trace.test.cpp`
- `vm2/simulation/gadgets/ecc.test.cpp`
- `vm2/simulation/gadgets/to_radix.test.cpp`
- `vm2/simulation/gadgets/class_id_derivation.test.cpp`
- `vm2/simulation/gadgets/address_derivation.test.cpp`
- `vm2/simulation/testing/mock_ecc.test.cpp`
- `vm2/simulation/testing/mock_to_radix.test.cpp`
- `vm2/simulation/testing/mock_class_id_derivation.test.cpp`
- `vm2/common/to_radix.test.cpp`

