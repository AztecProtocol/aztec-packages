# External Audit Scope: Hash Gadgets and Memory-Aware Opcode Wrappers

Commit hash: _TBD_

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Gadgets" audit scope (`audit_scope_avm_core.md`)
2. The "Poseidon2, Merkle Trees, and Note Hash Tree" audit scope (`audit_scope_avm_poseidon_merkle_note_hash.md`)
3. The "Derivations, ECC, and Radix Decomposition" audit scope (`audit_scope_avm_derivations_and_ecc.md`)
4. The "Execution, Memory, and Calls" audit scope (`audit_scope_avm_execution_and_calls.md`)
5. The "ALU and Bitwise" audit scope (`audit_scope_avm_alu_and_bitwise.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Gadgets" audit (`audit_scope_avm_core.md`):**
- `precomputed.pil` -- Shared precomputed columns. Used by `sha256.pil` (round constants), `keccakf1600.pil` (round constants, range checks), `poseidon2_mem.pil` (range selectors), `ecc_mem.pil` (range checks), and `to_radix_mem.pil` (range checks).
- `constants_gen.pil` -- Auto-generated protocol constants. Used by `keccakf1600.pil`, `sha256.pil`, `poseidon2_mem.pil`, `ecc_mem.pil`, `keccak_memory.pil`, `sha256_mem.pil`, and `to_radix_mem.pil` (memory limits, tag constants).
- `gt.pil` -- Integer greater-than gadget. Used by `sha256.pil` (bounds checks), `keccakf1600.pil` (bounds checks), `poseidon2_mem.pil` (out-of-bounds check), `ecc_mem.pil` (out-of-bounds check), `sha256_mem.pil` (out-of-bounds check), and `to_radix_mem.pil` (bounds checks).
- `range_check.pil` -- Range check gadget. Used by `keccakf1600.pil` (rotation limb range checks).

**From "ALU and Bitwise" audit (`audit_scope_avm_alu_and_bitwise.md`):**
- `bitwise.pil` -- Bitwise AND/OR/XOR. Used by `keccakf1600.pil` (XOR operations via `start_keccak` selector) and `sha256.pil` (bitwise operations via `start_sha256` selector).

**From "Poseidon2, Merkle Trees, and Note Hash Tree" audit (`audit_scope_avm_poseidon_merkle_note_hash.md`):**
- `poseidon2_perm.pil` -- Poseidon2 permutation. Used by `poseidon2_mem.pil` (permutation lookup).

**From "Derivations, ECC, and Radix Decomposition" audit (`audit_scope_avm_derivations_and_ecc.md`):**
- `ecc.pil` -- Grumpkin point addition gadget. Used by `ecc_mem.pil` (ECC add lookup).
- `to_radix.pil` -- Radix decomposition gadget. Used by `to_radix_mem.pil` (decomposition lookup).

**From "Execution, Memory, and Calls" audit (`audit_scope_avm_execution_and_calls.md`):**
- `memory.pil` -- Memory trace. Used by `poseidon2_mem.pil`, `keccak_memory.pil`, `sha256_mem.pil`, `ecc_mem.pil`, and `to_radix_mem.pil` (memory read/write permutations).

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `sha256.pil`
    - SHA256 compression function gadget. Implements 64 rounds of SHA256 compression plus 1 output row (65 rows per invocation). Uses 32-bit arithmetic with modular addition decomposed into high/low limbs. Implements rotations via limb decomposition with range checks. All input values are assumed 32-bit (from sha256_mem); outputs are guaranteed 32-bit. Uses bitwise lookups via `start_sha256` selector. Depends on `precomputed.pil`, `gt.pil`, `constants_gen.pil`, and `sha256_mem.pil`.
2. `sha256_mem.pil`
    - SHA256 memory-aware wrapper. Virtual to the sha256 trace. Handles memory reads for state (8 U32 values), input (16 U32 values read one per round), and memory writes for output (8 U32 values). Performs out-of-bounds checks for all three address ranges. Handles tag mismatch errors on reads. Depends on `gt.pil`, `constants_gen.pil`, and `sha256.pil`.
3. `keccakf1600.pil`
    - Keccak-f1600 permutation gadget. Implements 24 rounds of the Keccak-f1600 permutation over a 5x5 state of 64-bit words. Each round is one row. Implements theta, rho, pi, chi, and iota steps using rotation decompositions (range-checked limbs) and bitwise XOR (via `start_keccak` selector into bitwise). Memory-aware: uses keccak_memory for reading input slices and writing output slices. Handles out-of-bounds and tag errors. Depends on `bitwise.pil`, `constants_gen.pil`, `range_check.pil`, `precomputed.pil`, and `keccak_memory.pil`.
4. `keccak_memory.pil`
    - Keccak memory slice gadget. Reads and writes 25-element U64 slices to/from memory for the keccak permutation. Multi-row: one row per slice element (25 rows for read, 25 for write). Handles tag error detection during reads. Depends on `memory.pil` and `constants_gen.pil`.
5. `poseidon2_mem.pil`
    - POSEIDON2PERM opcode memory wrapper. Reads 4 FF values from memory at `{src, src+1, src+2, src+3}`, performs a Poseidon2 permutation lookup, and writes 4 FF values to `{dst, dst+1, dst+2, dst+3}`. Handles out-of-bounds and tag mismatch errors. Depends on `poseidon2_perm.pil`, `constants_gen.pil`, `precomputed.pil`, `gt.pil`, and `memory.pil`.
6. `ecc_mem.pil`
    - ECADD opcode memory wrapper. Receives two Grumpkin points (P, Q) from execution registers, performs point addition via ECC lookup, and writes the result (x, y, is_inf) to memory at `{dst, dst+1, dst+2}`. Handles out-of-bounds errors. Input point coordinates are tag-checked by execution. Depends on `constants_gen.pil`, `ecc.pil`, `gt.pil`, `memory.pil`, and `precomputed.pil`.
7. `to_radix_mem.pil`
    - TORADIXBE opcode memory wrapper. Receives a value, radix, num_limbs, and is_output_bits from execution registers, performs radix decomposition via to_radix lookup, reverses the output to big-endian, and writes each limb to memory. Multi-row: one row per limb (vertical memory writes). Handles out-of-bounds and radix validation errors. Depends on `constants_gen.pil`, `gt.pil`, `memory.pil`, `precomputed.pil`, and `to_radix.pil`.

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `sha256_impl.hpp`
- `sha256_mem_impl.hpp`
- `keccakf1600_impl.hpp`
- `keccak_memory_impl.hpp`
- `poseidon2_mem_impl.hpp`
- `ecc_mem_impl.hpp`
- `to_radix_mem_impl.hpp`

## Summary of Module

This audit covers the **hash gadgets** (SHA256 and Keccak-f1600) and the **memory-aware opcode wrappers** that bridge between the execution dispatch and the core cryptographic gadgets.

The **SHA256** gadget (`sha256.pil`) implements the SHA256 compression function as a 65-row computation (64 rounds + 1 output). It uses 32-bit modular arithmetic with high/low limb decomposition for addition, and rotation via limb splitting. It relies on the bitwise subtrace (via `start_sha256`) for AND/XOR operations and on the precomputed table for round constants. The **sha256_mem** wrapper (`sha256_mem.pil`) is virtual to the sha256 trace and handles all memory I/O: reading 8 state words and 16 input words (one per round), and writing 8 output words, with out-of-bounds and tag error handling.

The **Keccak-f1600** gadget (`keccakf1600.pil`) implements the full Keccak-f1600 permutation as a 24-row computation (one row per round) over a 5x5 state of 64-bit words. Each round implements theta, rho, pi, chi, and iota. Rotations use the same limb-splitting technique as SHA256 but for 64-bit values. XOR operations go through the bitwise subtrace (via `start_keccak`). The **keccak_memory** gadget (`keccak_memory.pil`) handles reading and writing 25-element U64 slices from/to memory, with tag error detection.

The **poseidon2_mem** wrapper (`poseidon2_mem.pil`) handles the POSEIDON2PERM opcode by reading 4 FF values from memory, performing a Poseidon2 permutation lookup, and writing 4 FF results back.

The **ecc_mem** wrapper (`ecc_mem.pil`) handles the ECADD opcode by receiving two points from registers, performing point addition via ECC lookup, and writing the result to memory.

The **to_radix_mem** wrapper (`to_radix_mem.pil`) handles the TORADIXBE opcode by decomposing a value into limbs via to_radix lookup, reversing to big-endian, and writing each limb to memory.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/sha256.test.cpp`
- `vm2/constraining/relations/keccakf1600.test.cpp`
- `vm2/tracegen/keccakf1600_trace.test.cpp`
- `vm2/simulation/gadgets/sha256.test.cpp`
- `vm2/simulation/gadgets/keccakf1600.test.cpp`
- `vm2/simulation/testing/mock_sha256.test.cpp`
- `vm2/simulation/testing/mock_keccakf1600.test.cpp`

