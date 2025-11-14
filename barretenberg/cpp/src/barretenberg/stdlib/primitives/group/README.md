# cycle_group

## Purpose

`cycle_group` represents group elements of the proving system's embedded curve, Grumpkin, a curve with cofactor 1 defined over the scalar field of BN254, which is the native field for Barretenberg circuits.

## Use Cases in Barretenberg

- **DSL/ACIR EC operations:** Backend for elliptic curve operations (`EcAdd`, `MultiScalarMul`) from Noir programs
- **ECCVM Recursive Verifier:** ECCVM circuit is defined over BN254 base field / Grumpkin scalar field; commitments are points on Grumpkin

## Class Members

- **`_x`, `_y`** (`field_t`) - Point coordinates in the base field
- **`_is_infinity`** (`bool_t`) - Flag indicating whether the point is at infinity
- **`context`** (`Builder*`) - Circuit builder context

## Core Methods

### Arithmetic Operations
- **`operator+` / `operator-`** - Point addition/subtraction with infinity handling
- **`dbl()`** - Point doubling
- **`unconditional_add()` / `unconditional_subtract()`** - Unchecked arithmetic (assumes distinct x-coordinates)
- **`checked_unconditional_add()` / `checked_unconditional_subtract()`** - Versions with explicit validation that no x-coordinate collisions occur

### Multi-Scalar Multiplication
- **`batch_mul(base_points, scalars)`** - Multi-scalar multiplication (MSM) using automatic strategy selection (see below)
- **`operator*(scalar)`** - Single point multiplication (delegates to `batch_mul`)

## `batch_mul` Strategies

The `batch_mul` method uses the Straus MSM algorithm and automatically selects the most efficient table mechanism based on input characteristics:

### Fixed-Base MSM (Plookup Tables)
**When**: Constant base point that is one of two specific generator points, with witness scalar

**Note**: The two generator points are the first two defined in `barretenberg/cpp/src/barretenberg/ecc/groups/precomputed_generators_grumpkin_impl.hpp` based on "DEFAULT_DOMAIN_SEPARATOR".

**Strategy**: Precomputed tables with power-of-2 scaling
- **Scalar decomposition**: Each scalar is split into two limbs (128-bit lo, 126-bit hi)
- **Table structure**: Each limb uses 14-15 basic plookup tables with 9-bit or 2-bit slices
- **Table contents**: Table `i` stores precomputed points for slice index `k`:
  - `table[i][k] = [offset_i] + k · 2^(table_bits·i) · [P]`
  - Where `[P]` is the base point, `offset_i` is the offset generator for table `i`
  - Power-of-2 scaling is baked into precomputed entries (no in-circuit doubling needed)
- **Algorithm**:
  1. Decompose scalar into slices
  2. Look up one point per slice from the appropriate table
  3. Sum all looked-up points using point addition
  4. Subtract accumulated offset generators
- **Cost**: ~29 plookup operations + ~29 point additions per scalar mul
- **Primary application**: Efficient Pedersen hashing
- See `plookup_tables/README.md` for details about how lookups are performed

### Variable-Base MSM (ROM Arrays)
**When**: Everything else
- Witness base points (any point)
- Constant base points that are not one of the two special generators

**Strategy**: Windowed Straus with in-circuit table construction
- **Scalar decomposition**: Each scalar uses 4-bit windows (via `ROM_TABLE_BITS = 4`)
- **Table structure**: For each base point `[P]`, builds a ROM table at circuit runtime with 16 entries
- **Table contents**: ROM table stores precomputed points for window value `k`:
  - `table[k] = [offset] + k · [P]`
  - Where `[P]` is the base point, `offset` is the offset generator for this table
  - Computed in-circuit during witness generation
- **Algorithm**:
  1. Build ROM tables for all base points
  2. Process scalar slices from MSB to LSB:
     - Double the accumulator 4 times (except in first round)
     - Look up the appropriate table entry for the current scalar slice
     - Add the looked-up point using `unconditional_add`
  3. Subtract accumulated offset generators
- **Cost**: 1 gate per ROM lookup + point additions + point doublings
- **Flexibility**: Handles arbitrary base points determined at runtime
- See `memory/README.md` for details about how ROM tables work

### Common Elements

Both strategies share key design patterns:
- **Offset generators**: Each table includes an offset generator to prevent point-at-infinity edge cases during lookups. The total offset is tracked and subtracted from the final result. The algorithm for computing these offset generators is defined and documented in `ecc/groups/group.hpp`, method `derive_generators()`.
- **Native precomputation**: All intermediate points (table entries and accumulator states) are precomputed natively and provided as hints to reduce witness generation cost
- **Incomplete addition formula**: Uses `unconditional_add` which assumes distinct x-coordinates (guaranteed by offset generators)
