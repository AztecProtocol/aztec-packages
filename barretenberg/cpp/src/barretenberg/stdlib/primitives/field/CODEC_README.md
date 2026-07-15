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

This matches the internal representation of `stdlib::bigfield` which uses four 68-bit limbs.

## Canonical Representation

**Both codecs reject non-canonical values** (values ≥ `fq::modulus`):

| Codec | Enforcement | Method |
|-------|-------------|--------|
| `FrCodec` | Native assertion | `BB_ASSERT_LT(value, fq::modulus)` |
| `StdlibCodec` | In-circuit constraint | `bigfield::assert_is_in_field()` / `goblin_field::assert_is_in_field()` |

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
| **Native** | All | `for each limb: if (limb != 0) return false` | Direct limb-by-limb zero check. |
| **Circuit** | BN254 | `sum(limbs) == 0` | Sum of 4 valid limbs (2×136-bit + 2×118-bit) ≤ 2^138, cannot wrap to 0 mod Fr (254 bits). Only all-zero limbs satisfy this. |
| **Circuit** | Grumpkin | `x² - 5y² == 0` | Equation `x² = 5y²` requires 5 to be a quadratic residue in `bb::fr`, which is not the case since `fr`'s modulus is == 2 mod 5.

**Note for BN254 Goblin/Mega**: The infinity check operates on raw limbs before range constraints. However,
the full protocol ensures soundness:
- Valid infinity `(0,0)`: all limbs zero → passes infinity check and range constraints ✓
- Invalid attack: limbs summing to Fr → violates Translator range constraints (need out-of-range limbs) ✗

The downstream range constraints in Translator ensure that only canonical `(0,0)` can pass as infinity.

## Ultra vs Mega Arithmetization

| Aspect | Ultra | Mega (Goblin) |
|--------|-------|---------------|
| Base field type | `bigfield` | `goblin_field` |
| Transcript canonicality | In-circuit `< q` | In-circuit `< q` |
| Queued operation range constraints | In-circuit | Deferred to Translator |
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
| **Native OK, Recursive FAILS** | **HIGH (DoS)** | Attacker crafts proof passing cheap native check, then expensive recursive verification fails. Wastes resources, can block IVC chains. |
| **Recursive OK, Native FAILS** | Low | Unlikely in practice since native verification precedes recursive. Would be caught at native step. |

### Ensuring Consistency

Both `FrCodec` (native) and `StdlibCodec` (circuit) must:
1. Accept the same valid inputs
2. Reject the same invalid inputs (including aliases)
3. Handle edge cases identically (point at infinity, modulus-1, etc.)

## Security Properties

These properties hold for **Native, Ultra, and Mega recursive transcript decoding**:

1. **No alias acceptance**: Values ≥ modulus are rejected
2. **Unique infinity**: Only canonical `(0,0)` with zero limbs represents infinity
3. **Consistent native/recursive circuit decoding**: Native, Ultra, and Mega codec paths reject the same malformed
   transcript field encodings

## Mega/Goblin Specifics

### Mega/Goblin Validation Flow

For `goblin_field` and `goblin_element`:
1. `StdlibCodec` reconstructs transcript limbs and enforces strict `< q` canonicality with
   `goblin_field::assert_is_in_field()`
2. Values flow to the op queue as ECC operations
3. **Translator** enforces queued limb range constraints
4. **ECCVM** enforces the on-curve property via `ECCVMTranscriptRelationImpl`

### Transcript Canonicality

| Verification Path | Check | Result on Aliased Coords |
|-------------------|-------|--------------------------|
| Native | Strict <q | **REJECT** |
| Ultra Recursive | Strict <q (via `assert_is_in_field()`) | **REJECT** |
| Goblin (Mega+Merge+ECCVM+Translator) | Strict <q at transcript decoding | **REJECT** |

#### Partial Mitigation: `assert_equal` Constraints

The `assert_equal` constraints in `biggroup_goblin.hpp` also bind queued ECCVM operations to the transcript-decoded
limbs:

```cpp
// biggroup_goblin.hpp:181-190
op_tuple = builder->queue_ecc_add_accum(other.get_value());
x_lo.assert_equal(other._x.limbs[0]);
x_hi.assert_equal(other._x.limbs[1]);
```

### Relevant Code Locations

- Translation data flow: `goblin_verifier.cpp:48-59`
- ECCVM accumulated_result: `eccvm_verifier.cpp:244-256`
- Translator receives accumulated_result: `translator_verifier.cpp:122-126, 159-160`
- TranslatorAccumulatorTransferRelation: `translator_extra_relations_impl.hpp`
- Op queue dual representation: `ecc_op_queue.hpp:198-207`
