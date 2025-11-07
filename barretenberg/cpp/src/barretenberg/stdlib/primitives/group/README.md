# cycle_group

## Purpose

`cycle_group` represents group elements of the proving system's embedded curve, Grumpkin, a curve with cofactor 1 defined over the scalar field of BN254, which is the native field for Barretenberg circuits.

## Class Members

- **`_x`, `_y`** (`field_t`) - Point coordinates in the base field
- **`_is_infinity`** (`bool_t`) - Flag indicating whether the point is at infinity
- **`_is_standard`** (`bool`) - Indicates if the point is in standard form:
  - For finite points: coordinates are on the curve
  - For infinity: coordinates are `(0, 0)`
  - Used to optimize `standardize()`, `assert_equal()`, and equality checks
- **`context`** (`Builder*`) - Circuit builder context

## Core Methods

### Construction
- **`one()`** - Generator point
- **`constant_infinity()`** - Point at infinity as a constant
- **`from_witness()`** - Create from witness values (includes on-curve check)
- **`from_constant_witness()`** - Create fixed witness (useful for mixed constant/witness operations)

### Arithmetic Operations
- **`operator+` / `operator-`** - Point addition/subtraction with infinity handling
- **`dbl()`** - Point doubling
- **`unconditional_add()` / `unconditional_subtract()`** - Unchecked arithmetic (assumes distinct x-coordinates)
- **`checked_unconditional_add()` / `checked_unconditional_subtract()`** - Checked versions with explicit validation

### Multi-Scalar Multiplication
- **`batch_mul(base_points, scalars)`** - Multi-scalar multiplication (MSM) using automatic strategy selection
- **`operator*(scalar)`** - Single point multiplication (delegates to `batch_mul`)

### Utilities
- **`standardize()`** - Normalize representation (infinity points to `(0, 0)`)
- **`validate_on_curve()`** - Constrain point to be on curve
- **`assert_equal()` / `operator==`** - Equality checks
- **`conditional_assign()`** - Conditional point selection

## batch_mul Strategies

The `batch_mul` method uses the Straus MSM algorithm and automatically selects the most efficient table mechanism based on input characteristics:

### Fixed-Base MSM (Plookup Tables)
**When**: Constant base point that is one of two specific generator points, with witness scalar

**Strategy**: Precomputed tables with power-of-2 scaling
- Each scalar is split into two limbs (128-bit lo, 126-bit hi)
- Each limb uses 14-15 basic tables with 9-bit or 2-bit slices
- Table `i` stores: `[offset_i] + k · 2^(table_bits·i) · [base_point]` for all k
- The power-of-2 scaling factor is baked into the precomputed table entries - avoids in-circuit doubling
- Algorithm: decompose scalar into slices, look up one point per slice, sum all points
- Result: ~29 lookups + ~29 additions per scalar mul
- Most efficient option when applicable

### Variable-Base MSM (ROM Arrays)
**When**: Everything else
- Witness base points (any point)
- Constant base points that are not the two special generators

**Strategy**: Windowed Straus with in-circuit table construction
- Uses 4-bit windows (via `ROM_TABLE_BITS = 4`)
- For each base point `P`, builds ROM table `{G, G+P, G+2P, ..., G+15P}` at circuit runtime
- Processes scalar slices from MSB to LSB:
  1. Double the accumulator 4 times (except in first round)
  2. Look up the appropriate table entry for the current scalar slice
  3. Add the looked-up point using `unconditional_add`
- ROM arrays cost one gate per lookup
- Handles arbitrary base points determined at runtime

### Common Elements

Both strategies share:
- **Offset generators**: Added to table entries to prevent point-at-infinity edge cases
- **Hints**: All intermediate points are precomputed natively and provided as hints to reduce witness generation cost
- **Offset accumulation**: Total offset is tracked and subtracted from the final result

## Use Cases in Barretenberg

- **DSL/ACIR EC operations:** Backend for elliptic curve operations (`EcAdd`, `MultiScalarMul`) from Noir programs
- **ECCVM Recursive Verifier:** ECCVM circuit is defined over BN254 base field / Grumpkin scalar field; commitments are points on Grumpkin

