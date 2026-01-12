# SHA-256 Circuit Implementation

## Overview

Circuit-friendly implementation of the SHA-256 compression function using lookup tables and sparse form arithmetic.

## Contents

1. [API](#api)
2. [Algorithm](#algorithm) - Standard SHA-256 compression function
3. [Implementation](#implementation) - Circuit-specific techniques
4. [Testing](#testing) - Verification approach
5. [Security Considerations](#security-considerations)

## API

### `sha256_block`

```cpp
static std::array<field_ct, 8> sha256_block(
    const std::array<field_ct, 8>& h_init,
    const std::array<field_ct, 16>& input
);
```

Applies the SHA-256 compression function to a single 512-bit message block.

**Parameters:**
- `h_init`: The 8-word (256-bit) hash state. For the first block, the standard SHA-256 IV. For subsequent blocks, the output of the previous compression.
- `input`: The 16-word (512-bit) message block to compress.

**Output:** The updated 8-word hash state.

**Note:** Only the compression function is implemented since this is all that is needed to support `Sha256Compression` constraints in DSL.

## Algorithm

Standard SHA-256 compression function (FIPS 180-4):

### Message Schedule Extension

Extends the 16 input words to 64 words:

```
W[i] = σ₁(W[i-2]) + W[i-7] + σ₀(W[i-15]) + W[i-16]  (mod 2³²)  for i = 16..63

σ₀(x) = ROTR⁷(x) ⊕ ROTR¹⁸(x) ⊕ SHR³(x)
σ₁(x) = ROTR¹⁷(x) ⊕ ROTR¹⁹(x) ⊕ SHR¹⁰(x)
```

### Compression Rounds

64 rounds updating 8 working variables (a, b, c, d, e, f, g, h) initialized from h_init:

```
T1 = h + Σ₁(e) + Ch(e,f,g) + K[i] + W[i]
T2 = Σ₀(a) + Maj(a,b,c)
(a,b,c,d,e,f,g,h) = (T1+T2, a, b, c, d+T1, e, f, g)

Σ₀(a) = ROTR²(a) ⊕ ROTR¹³(a) ⊕ ROTR²²(a)
Σ₁(e) = ROTR⁶(e) ⊕ ROTR¹¹(e) ⊕ ROTR²⁵(e)
Ch(e,f,g) = (e ∧ f) ⊕ (¬e ∧ g)
Maj(a,b,c) = (a ∧ b) ⊕ (a ∧ c) ⊕ (b ∧ c)

K[i] are the 64 SHA-256 round constants (FIPS 180-4)
```

### Final Addition

```
H[i] = H[i] + (a,b,c,d,e,f,g,h)[i]  (mod 2³²)
```

## Implementation

### Sparse Form Encoding

XOR and bitwise operations are expensive in circuits. We use "sparse form" to convert them to additions:

- Each bit is stored in its own digit (base B, one digit per bit position)
- XOR of bits becomes addition of digits (mod B)

Two sparse bases are used across three contexts:

- **Base-28** for Choose + Σ₁: encodes `7*rotation_sum + (e + 2f + 3g)` per digit
- **Base-16** for Majority + Σ₀: encodes `4*rotation_sum + (a + b + c)` per digit
- **Base-16** for Message Extension (σ₀ + σ₁): encodes `4*σ₀_digit + σ₁_digit` per digit

The multipliers (4 and 7) separate the two XOR results or the rotation result from the Boolean function encoding within each digit.

### Handling Rotations

In sparse form, rotating a value by `r` bits is equivalent to multiplying by `B^r` (where B is the base). However, 32-bit values are decomposed into 3-4 limbs by the input lookup tables, and this creates complications:

**Simple case (contiguous after rotation):** When a limb's bits remain contiguous and don't land at bit position 0, the rotation is handled by multiplying that limb by the appropriate power of B. These are called "rotation multipliers" or "rotation coefficients" (e.g., `get_choose_rotation_multipliers()`).

**Complex cases (handled by lookup tables):**
- **Bits split across limb boundary:** When rotation causes a limb's bits to wrap around (some bits go to high positions, others to low), a lookup table is used to compute this contribution.
- **Bits land at position 0:** Handled by existing lookup tables containing the raw limb values.

The input lookup tables (C3 column) return the combined contribution from all complex cases, while the code applies rotation multipliers to handle the simple cases. Correction factors reconcile any coefficient mismatches between limbs.

See the appendix "Detailed Example: Choose + Σ₁" for a worked example showing how Σ₁'s three rotations (6, 11, 25) are split between multipliers and lookup tables.

### Lookup Tables

Six lookup tables handle the sparse form conversions:

| Operation | Input Table | Output Table |
|-----------|-------------|--------------|
| Message extension (σ₀ + σ₁) | `SHA256_WITNESS_INPUT` | `SHA256_WITNESS_OUTPUT` |
| Choose + Σ₁ | `SHA256_CH_INPUT` | `SHA256_CH_OUTPUT` |
| Majority + Σ₀ | `SHA256_MAJ_INPUT` | `SHA256_MAJ_OUTPUT` |

Input tables decompose 32-bit values into sparse limbs. Output tables normalize the sparse sum back to a 32-bit result.

See `plookup_tables/sha256.hpp` for detailed table documentation.

### Function Mapping

| Algorithm | Implementation |
|-----------|----------------|
| σ₀ + σ₁ | `extend_witness()` |
| Σ₁ + Ch | `choose_with_sigma1()` |
| Σ₀ + Maj | `majority_with_sigma0()` |
| mod 2³² addition | `add_normalize()` |

## Testing

Correctness is verified through a layered approach:

### Native Implementation (`crypto/sha256/`)

The native (non-circuit) SHA-256 implementation (full hash algorithm with padding) is tested against official NIST test vectors, verifying the core algorithm is correct.

### Circuit Implementation (`stdlib/hash/sha256/`)

The circuit tests use NIST vectors with manual padding - `sha256.test.cpp` tests `sha256_block` directly against NIST vectors ("abc" and 56-byte messages), manually constructing padded blocks to verify the compression function produces correct output.

### Differential Fuzzing (`sha256.fuzzer.cpp`)

The fuzzer generates random inputs and compares circuit output against native output for the compression function. This provides broad coverage without requiring exhaustive test vectors.

---

## Appendix: Detailed Example: Choose + Σ₁

This section walks through how `choose_with_sigma1()` (in `sha256.cpp`) computes `Σ₁(e) + Ch(e,f,g)` using sparse form.

### What We're Computing

Per bit position `i`:
- `Σ₁(e)_i = e[i-6] ⊕ e[i-11] ⊕ e[i-25]` (3-way XOR of rotated bits)
- `Ch(e,f,g)_i = (e_i ∧ f_i) ⊕ (¬e_i ∧ g_i)` (if e=1, take f; else take g)

### Sparse Encoding for Choose

The Choose function can be computed from the weighted sum `e + 2f + 3g`:

| e | f | g | e + 2f + 3g | Ch(e,f,g) |
|---|---|---|-------------|-----------|
| 0 | 0 | 0 | 0 | 0 |
| 1 | 0 | 0 | 1 | 0 |
| 0 | 1 | 0 | 2 | 0 |
| 0 | 0 | 1 | 3 | 1 |
| 1 | 1 | 0 | 3 | 1 |
| 1 | 0 | 1 | 4 | 0 |
| 0 | 1 | 1 | 5 | 1 |
| 1 | 1 | 1 | 6 | 1 |

The weighted sum uniquely determines Ch(e,f,g) (note: 3 maps to 1 in both cases where it occurs).

This encoding is implemented in `get_choose_output_table()` (`plookup_tables/sha256.hpp`).

### Combined Encoding

We encode both Σ₁ and Ch in a single base-28 digit:

```
digit = 7 * rotation_sum + (e + 2f + 3g)
```

Where:
- `rotation_sum` ∈ {0,1,2,3} (sum of 3 rotated bits)
- `e + 2f + 3g` ∈ {0,1,2,3,4,5,6}
- Max digit = 7*3 + 6 = 27, hence base-28

The constant 7 is `SPARSE_MULT` in `choose_with_sigma1()`.

### Handling Rotations

Computing Σ₁(e) requires rotating e by 6, 11, and 25 bits. In sparse form, rotation by `r` bits is multiplication by `B^r` (where B=28). But there's a complication: the 32-bit value is split into three limbs by the input table:

- L0: bits 0-10 (11 bits)
- L1: bits 11-21 (11 bits)
- L2: bits 22-31 (10 bits)

See `get_choose_input_table()` in `plookup_tables/sha256.hpp` for limb structure.

When a rotation is applied, each limb's bits either:
- **Stay contiguous (not at bit 0)**: Handled by multiplying by `B^(new_position)`.
- **Split across boundary OR land at bit 0**: Handled by the lookup table (C3).

For Σ₁'s three rotations (6, 11, 25), each limb behaves differently:

| Limb | Bits | Rot 6 | Rot 11 | Rot 25 |
|------|------|-------|--------|--------|
| L0 | 0-10 | splits | contiguous | contiguous |
| L1 | 11-21 | contiguous | lands at 0 | contiguous |
| L2 | 22-31 | contiguous | contiguous | splits |

The **rotation coefficients** `c0, c1, c2` (from `get_choose_rotation_multipliers()`) combine the contiguous contributions for each limb. The **lookup table (C3)** handles the splits and lands-at-0 cases.

### Correction Factors

For efficiency, we want to compute `e_sparse + SPARSE_MULT * Σ₁(e_sparse)` in one operation via multiplication of the full value by a single coefficient. Recall `e_sparse = L0 + B^11*L1 + B^22*L2`. The coefficient `c0` is designed for L0, so we compute `e_sparse * c0`. But this gives incorrect coefficients for L1 and L2:

- L0 gets coefficient `c0` (correct)
- L1 gets coefficient `B^11 * c0` (incorrect - should be `c1`)
- L2 gets coefficient `B^22 * c0` (incorrect - should be `c2`)

Two correction factors fix this:
- **L1 correction**: `δ1 = c1 - B^11 * c0`, baked into C3 via `limb1_table_correction` in `get_choose_input_table()`
- **L2 correction**: `δ2 = c2 - B^22 * c0`, returned by `get_choose_rotation_multipliers()` and applied explicitly in `choose_with_sigma1()`

### Computation Flow

1. **Input table lookup** (`SHA256_CH_INPUT` via `get_choose_input_table()`):
   - C1: Reconstructs normal form (for constraint)
   - C2[0]: Full sparse form `e_sparse`
   - C2[2]: Individual limb `S2` (for L2 correction)
   - C3[0]: Split-boundary rotation contributions with L1 correction baked in

2. **Build sparse sum** (in `choose_with_sigma1()`):
   ```
   result = SPARSE_MULT * C3[0]                        // split-boundary rotations (with L1 correction)
          + e_sparse * (c0 * SPARSE_MULT + 1)          // contiguous rotations + e itself
          + S2 * (δ2 * SPARSE_MULT)                    // L2 coefficient correction
          + 2 * f_sparse + 3 * g_sparse                // Choose encoding
   ```
   The `c0 * SPARSE_MULT + 1` term computes both `SPARSE_MULT * Σ₁(e)` and `e` from the same multiplication.

3. **Output table lookup** (`SHA256_CH_OUTPUT` via `get_choose_output_table()`): Each base-28 digit maps to `Σ₁_bit + Ch_bit`

The lookup tables encode all the bit-level logic, so the circuit only performs field additions and table lookups.
