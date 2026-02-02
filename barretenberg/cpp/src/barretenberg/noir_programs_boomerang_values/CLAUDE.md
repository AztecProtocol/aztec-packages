# noir_programs_boomerang_values

This directory contains tests for the boomerang value detection system applied to ACIR constraint system that is created by Noir programming language.

## Purpose

Tests in this directory validate the `StaticAnalyzerAcir` class which processes ACIR (Abstract Circuit Intermediate Representation) constraints to detect boomerang values - values that need special handling in the circuit optimization process.

## Key Components

- **boomerang_constraints.test.cpp** - Tests for processing various ACIR constraint types including:
  - Range constraints
  - Logic constraints (XOR/AND) with valid `num_bits` values: 1, 8, 32, 64, 128
  - AES128 constraints
  - Corruption detection tests (validates analyzer detects tampered circuits)

## Building and Running Tests

From the `barretenberg/cpp/build-debug` directory:

```bash
cmake --build . --target noir_programs_boomerang_values_tests
./bin/noir_programs_boomerang_values_tests
```

Run specific test:
```bash
./bin/noir_programs_boomerang_values_tests --gtest_filter=BoomerangConstraintsTests.TestName
```

## Related Files

- `../boomerang_value_detection/graph_description_acir.cpp` - Main implementation of `StaticAnalyzerAcir`
- `../boomerang_value_detection/graph_description_acir.hpp` - Header with class declaration
- `../boomerang_value_detection/graph.cpp` - Core graph analysis including `validate_decompose_chain`
- `../boomerang_value_detection/opcode_constraint_map.cpp` - Builds mapping from opcode index to constraint
- `../dsl/acir_format/` - Directory with all ACIR constraints implementation
- `../stdlib/primitives/logic/logic.cpp` - Logic constraint implementation using plookup tables

## Architecture

### OpcodeConstraintMap

`OpcodeConstraintMap` is a `std::map<size_t, ConstraintInfo>` that maps original ACIR opcode indices to constraint pointers. Built by `build_opcode_type_map()` in `opcode_constraint_map.cpp`.

**Important**: Opcode indices from `original_opcode_indices` may NOT be consecutive (gaps exist for unsupported constraint types). Use iterator-based traversal with `std::next(it)` to find actual next constraint.

### Key Functions in StaticAnalyzerAcir

#### `process_constraint_system()`
Main entry point. Iterates through all constraints in opcode order and validates each one.

#### `process_logic_constraints()`
Validates XOR/AND logic constraints. Algorithm:
1. Trace accumulation chain to collect result_chunks (stored in reverse order - highest to lowest)
2. For each chunk, validate:
   - Lookup table type matches (UINT32_XOR or UINT32_AND)
   - Lookup selector is enabled
   - Operation correctness: `(a_chunk OP b_chunk) == result_chunk`
   - Internal consistency via `recover_chunks_from_lookups`
3. Verify accumulation: `a_accumulated == a_init` and `b_accumulated == b_init`
4. For partial chunks (num_bits % 32 != 0): validate decompose chain

#### `recover_chunks_from_lookups()`
Reconstructs a_chunk and b_chunk from lookup gates 1-5 (excluding gate 0) to detect corruption.

UINT32 lookup gate structure (6 gates per 32-bit chunk):
- Gate 0: w_l = a_chunk, w_r = b_chunk (full values)
- Gate 1-4: SLICE_6 tables (6 bits each)
- Gate 5: SLICE_2 table (top 2 bits)

Accumulator relationship: `acc[i] = slice[i] + 64 * acc[i+1]`

#### `validate_decompose_chain()` (in graph.cpp)
Validates range constraint decomposition for values > 14 bits. Algorithm has 5 phases:
1. Calculate expected structure (num_limbs, num_limb_triples)
2. Find start gate where witness appears in w_4 with power-of-2 selectors
3. Traverse decompose chain collecting sublimb indices
4. Validate sublimb count matches expected
5. Verify each sublimb is in appropriate range list

Big Add Gate structure:
```
┌─────────────────────────────────────────────────────────────────┐
│ w_l (sublimb_0) │ w_r (sublimb_1) │ w_o (sublimb_2) │ w_4 (acc) │
│ q_1 = 2^a       │ q_2 = 2^b       │ q_3 = 2^c       │           │
└─────────────────────────────────────────────────────────────────┘
Constraint: q_1·w_l + q_2·w_r + q_3·w_o = w_4
Selector property: q_2² == q_1 * q_3
```

### Helper Functions

- `witness_from_index(uint32_t idx)` - Creates `WitnessOrConstant<fr>` from witness index
- `constant_from_value(uint8_t val)` - Creates `WitnessOrConstant<fr>` from constant value
- `collect_witnesses_from_constraint(size_t opcode_idx)` - Collects all witness indices from a constraint

## Adding New Test Cases

1. Create `AcirFormat` constraint system with proper constraints and `original_opcode_indices`
2. Create `StaticAnalyzerAcir` for this constraint system
3. Check that all opcodes were saved correctly in opcode constraint map
4. Verify `get_incorrect_opcodes()` returns empty set for valid circuits
5. For corruption tests: modify circuit after building, verify analyzer detects the corruption

## Development Rules

**IMPORTANT: Follow these rules when modifying code in this module:**

1. **No temporary fixes** - Do not implement workarounds, hacks, or temporary solutions. All changes must be proper, permanent fixes that address the root cause of issues.

2. **Run tests after every change** - After ANY modification to the code, rebuild and run the full test suite:
   ```bash
   cd barretenberg/cpp/build-debug
   cmake --build . --target noir_programs_boomerang_values_tests
   ./bin/noir_programs_boomerang_values_tests
   ```
   Do not proceed with further changes until all tests pass.

3. **Verify compilation before testing** - Ensure code compiles without errors or warnings before running tests.

4. **Document significant changes** - Update this CLAUDE.md file when adding new functions, modifying algorithms, or changing architecture.

## Final Goal

**Ensure all ACIR constraints work properly in Barretenberg.** The static analyzer must be able to validate every constraint type that can be generated by Noir programs, detecting any corruption or improper constraint construction.

## ACIR Constraint Types - Implementation Status

| Status | Constraint Type | Process Function | Tests |
|--------|----------------|------------------|-------|
| ✅ Done | LOGIC (XOR/AND) | `process_logic_constraints` | Yes |
| ✅ Done | RANGE | `process_range_constraints` | Yes |
| 🔄 In Progress | AES128 | `process_aes128_constraints` | Yes |
| ⬜ TODO | SHA256_COMPRESSION | `process_sha256compression_constraints` | No |
| ⬜ TODO | BLAKE2S | `process_blake2s_constraints` | No |
| ⬜ TODO | BLAKE3 | `process_blake3s_constraints` | No |
| ⬜ TODO | POSEIDON2 | `process_poseidon2s_constraints` | No |
| ⬜ TODO | ECDSA_K1 | `process_ecdsa_constraints` | No |
| ⬜ TODO | ECDSA_R1 | `process_ecdsa_constraints` | No |
| ⬜ TODO | MULTI_SCALAR_MUL | `process_multi_scalar_mul_constraints` | No |
| ⬜ TODO | EC_ADD | `process_embedded_curve_add_constraints` | No |
| ⬜ TODO | HONK_RECURSION | `process_recursion_constraints` | No |
| ⬜ TODO | AVM_RECURSION | Not implemented | No |
| ⬜ TODO | HN_RECURSION | Not implemented | No |
| ⬜ TODO | CHONK_RECURSION | Not implemented | No |
| ⬜ TODO | KECCAK_PERMUTATION | Not implemented | No |
| ⬜ TODO | QUAD | Not implemented | No |
| ⬜ TODO | BLOCK | Not implemented | No |

### Implementation Checklist for Each Constraint Type

For each constraint type, complete the following:

- [ ] **Understand constraint structure** - Study the constraint definition in `dsl/acir_format/`
- [ ] **Analyze circuit generation** - Understand how `create_*_constraint` builds the circuit
- [ ] **Implement process function** - Create `process_*_constraints()` in `graph_description_acir.cpp`
- [ ] **Add to process_constraint_system** - Add case to switch statement
- [ ] **Write validation tests** - Test valid circuits return no errors
- [ ] **Write corruption tests** - Test analyzer detects tampered circuits
- [ ] **Update collect_witnesses_from_constraint** - Add case for new constraint type
- [ ] **Update CLAUDE.md** - Document the algorithm and mark as done
