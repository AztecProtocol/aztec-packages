# External Audit Scope: Origin Tag Security Mechanism

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

## Files to Audit

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Core Implementation
1. `transcript/origin_tag.hpp`
2. `transcript/origin_tag.cpp`

### Integration in Transcript
3. `transcript/transcript.hpp` (origin tag assignment and validation)

### Tagged Stdlib Primitives
4. `stdlib/primitives/field/field.hpp`
5. `stdlib/primitives/field/field.cpp`
6. `stdlib/primitives/bool/bool.hpp`
7. `stdlib/primitives/bool/bool.cpp`
8. `stdlib/primitives/bigfield/bigfield.hpp`
9. `stdlib/primitives/bigfield/bigfield_impl.hpp`
10. `stdlib/primitives/biggroup/biggroup.hpp`
11. `stdlib/primitives/biggroup/biggroup_impl.hpp`
12. `stdlib/primitives/byte_array/byte_array.hpp`
13. `stdlib/primitives/byte_array/byte_array.cpp`
14. `stdlib/primitives/safe_uint/safe_uint.hpp`
15. `stdlib/primitives/safe_uint/safe_uint.cpp`

## Summary of Module

The Origin Tag security mechanism tracks the provenance of values in recursive verification circuits to detect Fiat-Shamir protocol violations. Each in-circuit value carries metadata identifying its source transcript (`transcript_index`) and protocol rounds (`round_provenance` bitmask). When values combine through arithmetic operations, their tags merge and security checks enforce: (1) values from different transcripts cannot interact, (2) submitted values from different rounds require intervening challenges, (3) free witnesses cannot mix with transcript-derived values, and (4) poisoned values abort immediately. The mechanism is only active in DEBUG builds.

For detailed documentation, see [`transcript/README.md`](https://github.com/AztecProtocol/aztec-packages-private/blob/5824b41fac25d588f13c08578e179d1c4f37f27d/barretenberg/cpp/src/barretenberg/transcript/README.md) (sections "Origin Tag Security Mechanism" and "In-Circuit Transcript Flow").

## Test Files

1. `stdlib/primitives/field/field.test.cpp`
2. `stdlib/primitives/bool/bool.test.cpp`
3. `stdlib/primitives/bigfield/bigfield.test.cpp`
4. `stdlib/primitives/bigfield/bigfield_edge_cases.test.cpp`
5. `stdlib/primitives/biggroup/biggroup.test.cpp`
6. `stdlib/primitives/byte_array/byte_array.test.cpp`
7. `stdlib/primitives/safe_uint/safe_uint.test.cpp`
8. `stdlib/primitives/memory/ram_table.test.cpp`
9. `stdlib/primitives/memory/rom_table.test.cpp`
10. `stdlib/primitives/memory/twin_rom_table.test.cpp`
11. `stdlib/translator_vm_verifier/translator_recursive_verifier.test.cpp`
