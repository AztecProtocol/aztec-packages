# Ultra/Mega Lookup (Plookup) System - Audit Scope

The lookup system uses **log-derivative style arguments** (despite the "plookup" naming). This document scopes the components for audit.

---

## File Index by Category

All paths relative to `barretenberg/cpp/src/barretenberg/`.

### Relations (Prover/Verifier Constraints)

| File | Description |
|------|-------------|
| `relations/logderiv_lookup_relation.hpp` | Primary log-derivative lookup relation with 3 subrelations |
| `relations/databus_lookup_relation.hpp` | Mega-specific DataBus lookup relation (calldata, secondary_calldata, returndata) |

### Circuit Builders

| File | Description |
|------|-------------|
| `stdlib_circuit_builders/ultra_circuit_builder.hpp` | Ultra builder interface - lookup table storage, gate creation methods |
| `stdlib_circuit_builders/ultra_circuit_builder.cpp` | Ultra builder implementation - `create_gates_from_plookup_accumulators()`, finalization |
| `stdlib_circuit_builders/mega_circuit_builder.hpp` | Mega builder interface - extends Ultra with DataBus |
| `stdlib_circuit_builders/mega_circuit_builder.cpp` | Mega builder implementation |

### Lookup Logic (Stdlib)

| File | Description |
|------|-------------|
| `stdlib/primitives/plookup/plookup.hpp` | High-level plookup interface - `read_from_1_to_2_table()`, `read_sequence_from_multi_table()` |
| `stdlib/primitives/plookup/plookup.cpp` | Plookup implementation - accumulator wire assignment, column index mapping |

### Table Infrastructure

| File | Description |
|------|-------------|
| `stdlib_circuit_builders/plookup_tables/types.hpp` | Core types: `BasicTable`, `MultiTable`, `ReadData<T>`, `BasicTableId`, `MultiTableId` enums |
| `stdlib_circuit_builders/plookup_tables/plookup_tables.hpp` | Table factory interface |
| `stdlib_circuit_builders/plookup_tables/plookup_tables.cpp` | Table factory: `get_multitable()`, `create_basic_table()`, `get_lookup_accumulators()` |

### Predefined Tables

| File | Description |
|------|-------------|
| `stdlib_circuit_builders/plookup_tables/uint.hpp` | Bitwise XOR/AND tables for uint8/16/32/64 |
| `stdlib_circuit_builders/plookup_tables/sha256.hpp` | SHA256 round function tables (Ch, Maj, Witness) |
| `stdlib_circuit_builders/plookup_tables/aes128.hpp` | AES S-box and sparse normalization tables |
| `stdlib_circuit_builders/plookup_tables/blake2s.hpp` | Blake2s XOR rotation tables |
| `stdlib_circuit_builders/plookup_tables/sparse.hpp` | Sparse encoding utilities |
| `stdlib_circuit_builders/plookup_tables/dummy.hpp` | Dummy tables for ensuring non-zero polynomials |
| `stdlib_circuit_builders/plookup_tables/non_native_group_generator.hpp` | secp256k1 point coordinate tables |
| `stdlib_circuit_builders/plookup_tables/non_native_group_generator.cpp` | secp256k1 table generation |
| `stdlib_circuit_builders/plookup_tables/keccak/keccak_input.hpp` | Keccak input conversion tables |
| `stdlib_circuit_builders/plookup_tables/keccak/keccak_theta.hpp` | Keccak theta step tables |
| `stdlib_circuit_builders/plookup_tables/keccak/keccak_rho.hpp` | Keccak rho step tables |
| `stdlib_circuit_builders/plookup_tables/keccak/keccak_chi.hpp` | Keccak chi step tables |
| `stdlib_circuit_builders/plookup_tables/keccak/keccak_output.hpp` | Keccak output conversion tables |
| `stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base_params.hpp` | Fixed-base scalar mul parameters |
| `stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp` | Fixed-base scalar mul table interface |
| `stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.cpp` | Fixed-base scalar mul table generation |

### Witness Computation & Proving

| File | Description |
|------|-------------|
| `ultra_honk/witness_computation.hpp` | Witness computation interface |
| `ultra_honk/witness_computation.cpp` | `compute_logderivative_inverses()` implementation |
| `honk/proof_system/logderivative_library.hpp` | Generic log-derivative utilities: batch inversion, subrelation accumulation |
| `honk/composer/composer_lib.hpp` | `compute_lookup_table_columns()` - constructs table polynomials from circuit |

### Flavor Definitions (Polynomial Schemas)

| File | Description |
|------|-------------|
| `flavor/ultra_flavor.hpp` | Ultra polynomial schema: `q_lookup`, `lookup_inverses`, `lookup_read_counts`, `lookup_read_tags` |
| `flavor/mega_flavor.hpp` | Mega polynomial schema: extends Ultra with DataBus lookup polynomials |

### Execution Trace

| File | Description |
|------|-------------|
| `honk/execution_trace/ultra_execution_trace.hpp` | Ultra trace structure with dedicated lookup block |
| `honk/execution_trace/mega_execution_trace.hpp` | Mega trace structure |
| `honk/execution_trace/gate_data.hpp` | Gate data types for trace construction |

### Tests (Reference)

| File | Description |
|------|-------------|
| `stdlib/primitives/plookup/plookup.test.cpp` | Plookup stdlib tests |
| `circuit_checker/ultra_circuit_builder_lookup.test.cpp` | Circuit builder lookup tests |

---

## Core Relations (Constraint Logic)

### Primary Lookup Relation (`logderiv_lookup_relation.hpp`)

Three subrelations:

1. **Inverse construction** (degree 4): Ensures inverse polynomial `I` correctly formed as `I_i = 1/[(read_term_i) * (write_term_i)]`
2. **Lookup argument** (degree 4, linearly dependent): Sum-across-trace constraint establishing log-derivative equivalence
3. **Boolean check** (degree 2): Validates `read_tag` is boolean

### DataBus Lookup Relation (`databus_lookup_relation.hpp`)

**Mega-specific** - Handles three DataBus columns:
- `calldata`
- `secondary_calldata`
- `returndata`

Each column has its own set of 3 subrelations (same structure as primary lookup).

### Relation Parameters

Four challenges used to combine table columns into read/write terms:
- `gamma`
- `eta`
- `eta_two`
- `eta_three`

---

## Circuit Builder Integration

### Key Methods (`ultra_circuit_builder.hpp/cpp`)

- `create_gates_from_plookup_accumulators()` - Creates lookup gates from multi-table reads
- `get_table(BasicTableId)` - Retrieves or creates specific basic table
- `get_multitable(MultiTableId)` - Fetches multi-table metadata
- `create_new_range_constraint()` - Creates range lookup gates
- `decompose_into_default_range()` - Breaks large ranges into plookup-sized chunks (default: 14-bit)

### Lookup Table Storage

```cpp
std::deque<plookup::BasicTable> lookup_tables;
```

---

## Lookup Logic (`stdlib/primitives/plookup/`)

### Core Functions (`plookup.hpp/cpp`)

- `read_from_1_to_2_table()` - Single-input lookup returning two outputs
- `read_sequence_from_multi_table()` - Multi-table lookup with accumulator construction
- `get_lookup_accumulators()` - Constructs accumulator witness values from inputs

### Accumulator Construction

The lookup system uses accumulators to encode multi-limb values. For a value split into slices:

```
accumulator[0] = full_value
accumulator[i] = accumulator[i-1] - slice[i-1] * coefficient[i-1]
                 ─────────────────────────────────────────────────
                              step_size[i-1]
```

Wire assignment maps accumulators to circuit wires with shift constraints enforcing the decomposition.

---

## Table Definitions

### Core Types (`types.hpp`)

```cpp
struct BasicTable {
    struct LookupEntry { std::array<FF, 3> columns; };
    std::vector<LookupEntry> entries;
    BasicTableId id;
    size_t size;
    // Column functions for computing table values
};

struct MultiTable {
    std::vector<FF> column_1_coefficients;  // Accumulator coefficients
    std::vector<FF> column_2_coefficients;
    std::vector<FF> column_3_coefficients;
    std::vector<FF> column_1_step_sizes;    // Multiplicative factors between slices
    std::vector<FF> column_2_step_sizes;
    std::vector<FF> column_3_step_sizes;
    std::vector<size_t> slice_sizes;        // Bit widths of slices
    std::vector<BasicTableId> basic_table_ids;
};

template<typename T>
struct ReadData {
    std::array<std::vector<T>, 3> columns;  // Accumulator values per column
    std::vector<BasicTable::LookupEntry> lookup_entries;
};
```

### BasicTableId Categories

1. **Bitwise Operations**: `XOR`, `AND`, `UINT_XOR_SLICE_*`, `UINT_AND_SLICE_*`
2. **SHA256**: `SHA256_WITNESS_*`, `SHA256_BASE28/BASE16*`, `SHA256_CH_*`, `SHA256_MAJ_*`
3. **AES**: `AES_SPARSE_MAP`, `AES_SBOX_MAP`, `AES_SPARSE_NORMALIZE`
4. **Blake2s**: `BLAKE_XOR_ROTATE*`
5. **Keccak**: `KECCAK_*` (Input, Theta, Rho, Chi, Output)
6. **secp256k1**: `SECP256K1_XLO/XHI/YLO/YHI/XYPRIME`, endomorphism variants
7. **Fixed-Base Scalar Mul**: `FIXED_BASE_*` parametric tables
8. **Pedersen**: `PEDERSEN`
9. **Dummy**: `HONK_DUMMY_BASIC1`, `HONK_DUMMY_BASIC2`

### Accumulator Pattern

For a 32-bit XOR with 6-bit slices:
- Row 0: Full 32-bit value accumulated
- Rows 1-5: Partial sums representing prior stages
- Constraint: `w_i[j] - step_size[i][j] * w_i_shift[j] = slice_i[j]`

---

## Witness & Prover Components

### Lookup Polynomials (Ultra Flavor)

- `q_lookup` - Selector indicating lookup gate
- `lookup_inverses` - Inverse polynomial I (prover-computed)
- `lookup_read_counts` - Read count per table entry
- `lookup_read_tags` - Binary indicator of whether entry read in circuit

### Inverse Computation (`logderivative_library.hpp`)

```cpp
template<typename Relation, typename Polynomials>
void compute_logderivative_inverse(Polynomials& polynomials, auto& params, size_t circuit_size);
```

Uses batch inversion for efficiency. Computes `I_i = 1 / (read_term_i * write_term_i)` for all active rows.

### Table Polynomial Construction (`composer_lib.hpp`)

`compute_lookup_table_columns()` - Iterates circuit's `lookup_tables`, populates the four table column polynomials (`table_1`, `table_2`, `table_3`, `table_4`) used in the write terms.

---

## Execution Trace Structure

From `honk/execution_trace/ultra_execution_trace.hpp`:

**UltraTraceLookupBlock**: Dedicated block for lookup gates
- `q_lookup` selector active
- All other gate selectors = 0
- Wires: `w_l`, `w_r`, `w_o`, `w_4`

Block ordering (9 blocks):
1. pub_inputs
2. **lookup**
3. arithmetic
4. delta_range
5. elliptic
6. memory
7. nnf (non-native field)
8. poseidon2_external
9. poseidon2_internal

---

## Audit Focus Areas

### 1. Inverse Polynomial Correctness
- Batch inversion in `compute_logderivative_inverse()`
- Handling of zero entries and edge cases
- Parallel computation safety

### 2. Accumulator Construction
- Slice reconstruction via `get_lookup_accumulators()`
- Coefficient and step size calculations
- Multi-slice assembly correctness
- Wire assignment in `plookup.cpp`

### 3. Subrelation Constraint Logic
- Read term derivation (wire-based with accumulators)
- Write term derivation (table column-based)
- Linear independence properties of lookup subrelation

### 4. Table Integrity
- BasicTable column contents and consistency
- MultiTable configuration (coefficients, step sizes)
- Table lookup entry validation

### 5. Circuit Integration
- Lookup gate selector activation (`q_lookup`)
- Read count and read tag computation
- Finalization dummy gate correctness

### 6. DataBus Integration (Mega-specific)
- Bus column read/write term structure
- Three-column coordination
- `read_tag` boolean enforcement

### 7. Witness Computation
- Prover polynomial generation
- Parameter application (gamma, eta, eta_two, eta_three)
- Table polynomial construction via `compute_lookup_table_columns()`
