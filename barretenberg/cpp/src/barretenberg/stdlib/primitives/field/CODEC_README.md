# Codecs

This document describes the codec classes used for serializing/deserializing field elements and curve points in proof transcripts.

## Overview

| Codec | Location | Context | Data Type |
|-------|----------|---------|-----------|
| `FrCodec` | `ecc/fields/field_conversion.hpp` | Native (prover/verifier) | `bb::fr` |
| `StdlibCodec` | `stdlib/primitives/field/field_conversion.hpp` | In-circuit (recursive verification) | `field_t<Builder>` |
| `U256Codec` | `ecc/fields/field_conversion.hpp` | Native (simple) | `uint256_t` |

## Field Element Encoding

Non-native field elements (`fq` = Grumpkin scalar = BN254 base field) are encoded as 2 limbs:

```
value = low_limb + (high_limb << 136)

low_limb:  136 bits (2 × 68-bit bigfield limbs combined)
high_limb: 118 bits (remaining 2 × 68-bit limbs, but only 118 bits used)
```

This matches the internal representation of `stdlib::bigfield`; see [bigfield](../bigfield/README.md) for the limb layout.

## Canonical Representation

All three codecs reject non-canonical values (values ≥ the field modulus):

| Codec | Enforcement | Method |
|-------|-------------|--------|
| `FrCodec` | Native assertion | `BB_ASSERT_LT(value, fq::modulus)` |
| `StdlibCodec` | In-circuit constraint | `bigfield::assert_is_in_field()` |
| `U256Codec` | Native assertion | `BB_ASSERT_LT(value, fr::modulus)` or `BB_ASSERT_LT(value, fq::modulus)` |

This ensures consistent behavior whether verification happens natively or in-circuit.

### Limb Bounds

Before the modulus check, limb bounds are verified:
- `low_limb < 2^136`
- `high_limb < 2^118`

Values passing limb bounds but ≥ modulus (aliases) are rejected by the modulus check.

## Point at Infinity

The point at infinity is represented as `(0, 0)` with **all limbs zero**.

### Infinity Check Methods

| Context | Curve | Method | Why it's Sound |
|---------|-------|--------|----------------|
| Native | All | `for each limb: if (limb != 0) return false` | Direct limb-by-limb zero check. |
| Circuit (Ultra `element`) | BN254 | `sum(limbs) == 0` | Sums the 8 binary-basis limbs of x and y (68 bits each). The sum is below 2^72, so it cannot wrap to 0 mod Fr (254 bits). Only all-zero limbs satisfy this. |
| Circuit (`cycle_group`) | Grumpkin | `x² + 5y² == 0` | A non-zero solution requires −5 to be a quadratic residue in `bb::fr`. It is not, because `fr`'s modulus is 2 mod 5 and 1 mod 4. |

**Mega (`goblin_element`)**: there is no in-circuit infinity flag or check. `(0,0)` is the canonical infinity, and the ECCVM enforces it.

## Ultra vs Mega Arithmetization

| Aspect | Ultra | Mega (Goblin) |
|--------|-------|---------------|
| Base field type | `bigfield` | `goblin_field` |
| Range constraints | In-circuit | Deferred to Translator |
| On-curve check | In-circuit | Deferred to ECCVM |
| Point type | `element_default` | `goblin_element` |


## Supported Types

Both codecs handle:
- `fr` / `field_t` — single field element
- `fq` / `bigfield` — 2-limb encoding
- `goblin_field` — 2-limb encoding (Mega only)
- `bn254_commitment` — 4 limbs (x_lo, x_hi, y_lo, y_hi)
- `grumpkin_commitment` — 2 limbs (x, y in fr)
- `std::array<T, N>` — concatenated encoding
- `Univariate<T, N>` — concatenated encoding

## Challenge Splitting

Challenges are split into two 127-bit limbs:

```cpp
static std::array<fr, 2> split_challenge(const fr& challenge) {
    // lo = challenge[0:127], hi = challenge[127:254]
    // Both halves provide >100-bit security
}
```


## Threat Model: Verification Consistency

### Why Aliased Values Aren't Inherently Dangerous

Values we deserialize come from **proof transcripts**. If someone uses non-canonical (aliased)
representations in a proof:
- The Fiat-Shamir hash changes (different bytes = different challenges)
- The proof is simply invalid for the original statement
- This doesn't allow "cheating" the proof system

See test `StdlibPoseidon2::PointCoordinatesVsAliasProduceDifferentHashes` in
`stdlib/hash/poseidon2/poseidon2.test.cpp` which demonstrates that aliased coordinates
produce different hashes than canonical ones.

### The Real Concern: Native vs Recursive Consistency

The critical security property is that **native and recursive verification must accept/reject
the same set of proofs**. In practice, native verification runs first (it's ~1000x cheaper),
so the main threat is:

| Scenario | Risk | Impact |
|----------|------|--------|
| Native OK, Recursive FAILS | High (DoS) | Attacker crafts proof passing cheap native check, then expensive recursive verification fails. Wastes resources, can block IVC chains. |
| Recursive OK, Native FAILS | Low | Unlikely in practice since native verification precedes recursive. Would be caught at native step. |

### Ensuring Consistency

Both `FrCodec` (native) and `StdlibCodec` (circuit) must:
1. Accept the same valid inputs
2. Reject the same invalid inputs (including aliases)
3. Handle edge cases identically (point at infinity, modulus-1, etc.)

## Security Properties

These properties hold for **Native and Ultra** verification paths:

1. **No alias acceptance**: Values ≥ modulus are rejected
2. **Unique infinity**: Only canonical `(0,0)` with zero limbs represents infinity
3. **Consistent native/Ultra circuit**: Both paths reject the same malformed inputs

**Known issue**: Goblin (Mega) accepts aliased non-infinity coordinates in range [q, 2^254) due to
Translator only enforcing <254-bit checks, not $<q$. See below

## Mega/Goblin Specifics

### Mega/Goblin Validation Flow

For `goblin_field` and `goblin_element`:
1. Limbs stored as-is during deserialization (no in-circuit range check)
2. Values flow to op queue as ECC operations
3. **Translator** enforces limb range constraints (<254 bits)
4. **ECCVM** enforces on-curve property via `ECCVMTranscriptRelationImpl`

### Deferred Validation and Known Inconsistency

In Mega circuits, `StdlibCodec` deserializes points into `goblin_field`/`goblin_element` without
immediate in-circuit range or modulus checks. This is intentional for efficiency - expensive
checks are deferred to specialized Translator/ECCVM circuits.

TODO(https://github.com/AztecProtocol/barretenberg/issues/1607): Translator enforces <254-bit
range constraints on coordinates from the `EccOpQueue`, but does NOT enforce strict <q (modulus)
checks. This creates a verification inconsistency:

| Verification Path | Check | Result on Aliased Coords |
|-------------------|-------|--------------------------|
| Native | Strict <q | rejects |
| Ultra Recursive | Strict <q (via `assert_is_in_field()`) | rejects |
| Goblin (Mega+Merge+ECCVM+Translator) | Only <254 bits | ACCEPTS (bug) |

**Impact**: A prover could craft a proof using aliased $\mathbb{F}_q$ representations that:
- **Passes** Goblin verification (Mega recursive → Merge → ECCVM → Translator)
- **Fails** native or Ultra recursive verification

This violates the consistency requirement that all verification paths accept/reject the same proofs.

#### Partial Mitigation: `assert_equal` Constraints

The `assert_equal` constraints in `biggroup_goblin.hpp` provide partial protection:

```cpp
// biggroup_goblin.hpp, goblin_element::operator-
op_tuple = builder->queue_ecc_add_accum(other.get_value());
x_lo.assert_equal(other._x.limbs[0]);
x_hi.assert_equal(other._x.limbs[1]);
```

For an honest prover, `get_value()` auto-reduces field values, so aliased inputs would cause
these constraints to fail. However, **these constraints can be avoided**: only `operator-` (and
one other site in `biggroup_goblin.hpp`) adds them. `operator+` and `batch_mul` queue the op
without comparing the limbs.


### Relevant Code Locations

- Translation data flow: `goblin_verifier.cpp`, `GoblinVerifier_::reduce_to_pairing_check_and_triple_ipa_opening`
- ECCVM accumulated_result: `eccvm_verifier.cpp`, `ECCVMVerifier_::compute_accumulated_result`
- Translator receives accumulated_result: `translator_verifier.cpp`, `put_translation_data_in_relation_parameters`
- TranslatorAccumulatorTransferRelation: `translator_extra_relations.hpp`, `translator_extra_relations_impl.hpp`
- Op queue dual representation: `ecc_op_queue.hpp`, `ECCOpQueue` class comment (ECCVM and Ultra formats)
