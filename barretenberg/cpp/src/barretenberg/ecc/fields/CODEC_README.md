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
| `StdlibCodec` | In-circuit constraint | `bigfield::assert_is_in_field()` |

This ensures consistent behavior whether verification happens natively or in-circuit.

### Limb Bounds

Before the modulus check, limb bounds are verified:
- `low_limb < 2^136`
- `high_limb < 2^118`

Values passing limb bounds but ≥ modulus (aliases) are rejected by the modulus check.

## Point at Infinity

The point at infinity is represented as `(0, 0)` with **all limbs zero**.

**Critical**: The infinity check examines raw limbs BEFORE field reduction to prevent alias attacks:

```cpp

for (const auto& limb : fr_vec) {
    if (!limb.is_zero()) return false;
}
return true;  // Only canonical (0,0) accepted
```

### BN254 vs Grumpkin Infinity Check (Circuit)

| Curve | Method | Rationale |
|-------|--------|-----------|
| BN254 | `sum(limbs) == 0` | 4 limbs, sum ≤ 2^138, no overflow |
| Grumpkin | `x² + 5y² == 0` | Uses that 5 is non-square mod p |

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
| **Native OK, Recursive FAILS** | **HIGH (DoS)** | Attacker crafts proof passing cheap native check, then expensive recursive verification fails. Wastes resources, can block IVC chains. |
| **Recursive OK, Native FAILS** | Low | Unlikely in practice since native verification precedes recursive. Would be caught at native step. |

### Ensuring Consistency

Both `FrCodec` (native) and `StdlibCodec` (circuit) must:
1. Accept the same valid inputs
2. Reject the same invalid inputs (including aliases)
3. Handle edge cases identically (point at infinity, modulus-1, etc.)

## Security Properties

1. **No alias acceptance**: Values ≥ modulus are rejected everywhere
2. **Unique infinity**: Only `(0,0)` with zero limbs represents infinity
3. **Consistent native/circuit**: Both paths reject the same malformed inputs

## Mega/Goblin Specifics

### Mega/Goblin Validation Flow

For `goblin_field` and `goblin_element`:
1. Limbs stored as-is during deserialization (no in-circuit range check)
2. Values flow to op queue as ECC operations
3. **Translator** enforces limb range constraints
4. **ECCVM** enforces on-curve property via `ECCVMTranscriptRelationImpl`

### Deferred Validation and Consistency

In Mega circuits, `StdlibCodec` deserializes points into `goblin_field`/`goblin_element` without
immediate in-circuit range or modulus checks. This is intentional for efficiency - expensive
checks are deferred to specialized Translator/ECCVM circuits.

The `assert_equal` constraints in `biggroup_goblin.hpp` ensure that the limbs in the circuit
match what the op_queue uses:

```cpp
// biggroup_goblin.hpp:181-190
op_tuple = builder->queue_ecc_add_accum(other.get_value());
x_lo.assert_equal(other._x.limbs[0]);
x_hi.assert_equal(other._x.limbs[1]);
```

For an honest prover, `get_value()` auto-reduces field values, so aliased inputs would cause
these constraints to fail (circuit uses aliased limbs, op_queue uses reduced limbs).
This ensures recursive verification rejects what native verification would also reject.

However, a malicious prover who modifies native code could make both sides of `assert_equal`
contain aliased limbs, bypassing these constraints. The ultimate security guarantee comes
from the translation check.

### ECCVM ↔ Translator Translation Check

The ECCVM and Translator circuits must agree on the accumulated result of all ECC operations.
This provides security even against a malicious prover because:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Op Queue (shared data)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  eccvm_ops_table          │  ultra_ops_table                            │
│  (native Point coords)    │  (limb-decomposed data)                     │
│  ─────────────────────    │  ─────────────────────                      │
│  base_point.x (bb::fq)    │  x_lo, x_hi (Fr limbs)                      │
│  base_point.y (bb::fq)    │  y_lo, y_hi (Fr limbs)                      │
│  ALWAYS CANONICAL         │  Could be aliased if prover modifies code   │
└─────────────────────────────────────────────────────────────────────────┘
                │                              │
                ▼                              ▼
        ┌───────────────┐              ┌───────────────┐
        │    ECCVM      │              │  Translator   │
        │               │              │               │
        │ transcript_Px │              │ op_queue wire │
        │ transcript_Py │              │ columns       │
        │ (from native  │              │ (from limbs)  │
        │  bb::fq)      │              │               │
        └───────┬───────┘              └───────┬───────┘
                │                              │
                ▼                              ▼
        accumulated_result              Translator's
        = (op + v·Px + v²·Py            computed
          + v³·z1 + v⁴·z2               accumulator
          - masking) / x
                │                              │
                └──────────────┬───────────────┘
                               ▼
                 TranslatorAccumulatorTransferRelation
                 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 accumulators_binary_limbs_i == accumulated_result[i]

                 If aliased limbs in Translator but canonical in ECCVM:
                 → Accumulators DON'T MATCH → Relation FAILS
```

### Why Native Code Modifications Can't Bypass Security

1. **ECCVM uses native `bb::fq` coordinates**:
   - `ECCVMTranscriptBuilder::compute_rows(op_queue->get_eccvm_ops(), ...)`
   - `get_eccvm_ops()` returns `ECCVMOperation` structs with `base_point` (native `Point`)
   - `bb::fq` is **always canonical** - the field class auto-reduces on construction
   - Even a modified binary cannot store non-canonical values in `bb::fq`

2. **Translator uses limb data from op_queue**:
   - `ultra_ops_table` contains `(x_lo, x_hi, y_lo, y_hi)` limbs
   - These limbs come from `construct_and_populate_ultra_ops()` which decomposes from native `Point`
   - A modified prover could potentially alter this decomposition

3. **Translation check catches inconsistency**:
   - ECCVM's `accumulated_result` is computed from canonical `transcript_Px`, `transcript_Py` evaluations
   - Translator computes its accumulator from the limbs in `ultra_ops_table`
   - `TranslatorAccumulatorTransferRelation` enforces equality at the result row
   - If limbs differ (canonical vs aliased), the accumulators differ → **verification fails**

### Key Invariants

1. **`bb::fq` is inherently canonical**: Montgomery representation requires `value < modulus`
2. **ECCVM transcript comes from native Points**
3. **Translation check**
4. **Merge protocol final table commitment is the input to the Translator Verifier**

### Relevant Code Locations

- Translation data flow: `goblin_verifier.cpp:48-59`
- ECCVM accumulated_result: `eccvm_verifier.cpp:244-256`
- Translator receives accumulated_result: `translator_verifier.cpp:122-126, 159-160`
- TranslatorAccumulatorTransferRelation: `translator_extra_relations_impl.hpp`
- Op queue dual representation: `ecc_op_queue.hpp:198-207`
