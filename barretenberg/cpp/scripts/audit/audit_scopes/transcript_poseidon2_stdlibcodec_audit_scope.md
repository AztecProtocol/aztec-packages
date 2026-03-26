# External Audit Scope: Transcript + Stdlib Poseidon2 + StdlibCodec

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

## Files to Audit

### Transcript Module
1. `barretenberg/cpp/src/barretenberg/transcript/transcript.hpp`

### Native Poseidon2

2. `barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2.hpp`
3. `barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2.cpp`
4. `barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2_permutation.hpp`
5. `barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2_params.hpp`
6. `barretenberg/cpp/src/barretenberg/crypto/poseidon2/sponge/sponge.hpp`

### Stdlib Poseidon2

7. `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp`
8. `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.cpp`
9. `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/sponge/sponge.hpp`
10. `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/poseidon2.hpp`
11. `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/poseidon2.cpp`

Two last modules are wrappers for `Sponge::hash_internal`.


#### Poseidon2 Custom Gate Relations
12. `barretenberg/cpp/src/barretenberg/relations/poseidon2_external_relation.hpp`
13. `barretenberg/cpp/src/barretenberg/relations/poseidon2_internal_relation.hpp`

#### Poseidon2 DSL constraints (noir ↔ barretenberg glue code)

14. `barretenberg/cpp/src/barretenberg/dsl/acir_format/poseidon2_constraint.hpp`
15. `barretenberg/cpp/src/barretenberg/dsl/acir_format/poseidon2_constraint.cpp`
16. `barretenberg/cpp/src/barretenberg/dsl/acir_format/poseidon2_constraint.test.cpp`

### StdlibCodec (Serde + `field_t` splitting)
17. `barretenberg/cpp/src/barretenberg/stdlib/primitives/field/field_conversion.hpp`
18. `barretenberg/cpp/src/barretenberg/stdlib/primitives/field/field_utils.hpp`
19. `barretenberg/cpp/src/barretenberg/stdlib/primitives/field/field_utils.cpp`

## Brief Summary of Modules

### Transcript

Universal transcript implementation (both native and in-circuit) for Fiat-Shamir challenge generation using `Poseidon2` hash. Uses duplex sponge construction. In-circuit transcript deserialization is performed by `StdlibCodec`.

**Documentation:** `barretenberg/cpp/src/barretenberg/transcript/README.md`

### Native Poseidon2
Poseidon2 is a cryptographic hash function optimized for use in zero-knowledge proof systems. It is an improved version of the Poseidon hash function with better performance characteristics. The implementation uses a sponge construction with a permutation function based on substitution-permutation networks (SPNs). The hash function operates over finite fields and is particularly efficient when used in arithmetic circuits.

Key features:
- Sponge-based construction with configurable rate and capacity
- Optimized permutation function with external and internal rounds
- Supports BN254 scalar field parameters

### Stdlib Poseidon2
Circuit-friendly Poseidon2 hash implementation following the [Poseidon2
paper](https://eprint.iacr.org/2023/323.pdf). Uses custom gates for efficient in-circuit verification with sponge construction ($t=4$, $\text{rate}=3$, $\text{capacity}=1$).

**Documentation:** Poseidon2 paper: https://eprint.iacr.org/2023/323 , `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/README.md`

**Poseidon2 Custom Gate Relations**

- **External Relation**: Enforces external round matrix multiplication and $S$-box application
- **Internal Relation**: Enforces internal round matrix multiplication and partial $S$-box

### StdlibCodec
Serialization/deserialization codec for converting between circuit types (field_t, bigfield, group elements) and  transcript field representations. Handles bn254/grumpkin points and field element conversions with proper range constraints.

## Test Files

### Transcript Tests
1. `barretenberg/cpp/src/barretenberg/transcript/transcript.test.cpp` - Main transcript test suite (covers both
native and in-circuit modes)
2. `barretenberg/cpp/src/barretenberg/transcript/transcript_test_fixture.hpp` - Test fixture providing common
test utilities

### Native Poseidon2 Tests
1. `barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2.test.cpp`
    - Test vectors for native Poseidon2 implementation
2. `barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2_permutation.test.cpp`
    - Test vectors for Poseidon2 permutation

### Stdlib Poseidon2 Tests
3. `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/poseidon2.test.cpp`
4. `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/poseidon2.circuit.failure.test.cpp`

### StdlibCodec Tests
1. `barretenberg/cpp/src/barretenberg/stdlib/primitives/field/field_conversion.test.cpp`

## Security Mechanisms

### Security Features
1. **Origin Tags**: Runtime tracking of value provenance to prevent Fiat-Shamir vulnerabilities (see Transcript README and `Origin Tags Security.md` in the same folder)
2. **Boomerang Value Detector**: static analysis of `Poseidon2` circuit witnesses `barretenberg/cpp/src/barretenberg/boomerang_value_detection/graph_description_poseidon2s_permutation.test.cpp`



### Notes

#### Why These Modules Must Be Audited Together

These modules form a **security-critical system** for Fiat-Shamir challenge generation and in-circuit hashing:

1. **Transcript → Poseidon2 Dependency**: The transcript uses stdlib `Poseidon2` as its hash function for challenge generation. Any soundness issues in Poseidon2 directly compromise the Fiat-Shamir transform.

2. **Poseidon2 → Relations Dependency**: Stdlib `Poseidon2` uses custom gates whose correctness is enforced by the `Poseidon2` relations.

3. **Transcript → StdlibCodec Dependency**: The transcript serializes/deserializes all prover messages and splits challenges into chunks using StdlibCodec. Bugs in field conversion logic could cause:
   - Incorrect challenge derivation
   - Loss of point-at-infinity information
   - Improper range constraints on bigfield limbs
