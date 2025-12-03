# Circuit Builders

The `UltraCircuitBuilder` and `MegaCircuitBuilder` builders provide the interface for constructing Ultra/Mega (Plonkish) arithmetized Barretenberg circuits. They manage witness values, define gates (constraints), and track the relationships between variables that the proving system will later enforce.

## Class Hierarchy

```
CircuitBuilderBase<FF>
    └── UltraCircuitBuilder
            └── MegaCircuitBuilder
```

- **CircuitBuilderBase**: Core variable management, copy constraints, public inputs
- **UltraCircuitBuilder**: Implements the Ultra arithmetization. Includes (custom) gates for
    - Arithmetic operations (width-4)
    - Table lookups
    - RAM/ROM operations
    - Range constraints
    - Grumpkin operations
    - Non-native field operations
- **MegaCircuitBuilder**: Implements the Mega arithmetization as a pure extension of Ultra. Adds functionality for
    - DataBus (efficient mechanism for inter-circuit communication in Aztec)
    - Deferred ECC operations (used to defer expensive EC operations to the ECCVM for Goblin)

The `MegaCircuitBuilder` is purpose built to construct circuits representing transactions on Aztec and is always used in conjunction with Goblin (ECCVM, Translator, Merge protocol). The `UltraCircuitBuilder` is used for everything else, e.g. in the Barretenberg-as-noir-backend for non-Aztec use cases and in Aztec rollup circuits (which don't utilize Goblin).

## Wires, Selectors & Blocks

### Wires, Variables & Witnesses

Both Ultra and Mega utilize four wires, referred to in the code as `w_1`, `w_2`, `w_3`, `w_4`, OR in some contexts as `w_l` (left), `w_r` (right), `w_o` (output), `w_4` (fourth). The actual witnesses (field values) are stored in a `variables` vector and the wires contain `uint32_t` witness indices which index into this vector. An example of common syntax:

```cpp
uint32_t idx = builder.add_variable(fr(42));  // returns index into variables vector
fr value = builder.get_variable(idx);         // retrieves the value
```

It is instructive to note that `get_variable` uses one additional layer of indirection: Instead of simply returning `variables[idx]`, it returns `variables[real_variable_index[idx]]`, where `real_variable_index` is a map on and into the variables vector indices. This mechanism is used to represent copy constraints in the circuit. Two witnesses are considered to be copy-constrained if and only if they have the same "real_variable_index".

Note that two wire entries which share a witness index will automatically have the same "real variable index" and are thus copy constrained, but this is not necessary for a copy constraint since two distinct witness indices can map to the same "real variable index". This latter case would occur for example in the following snippet:

```cpp
uint32_t idx_a = builder.add_variable(fr(42));
uint32_t idx_b = builder.add_variable(fr(42));
// idx_a != idx_b, but after assert_equal:
builder.assert_equal(idx_a, idx_b);
// real_variable_index[idx_a] == real_variable_index[idx_b]
```

### Selectors

**Selectors** are per-row values that configure constraint behavior. They fall into two categories:

**Gate selectors** enable specific relations at a given row. With the exception of `q_arith`, these are boolean (0 or 1):

| Selector | Relation |
|----------|----------|
| `q_arith` | Arithmetic gate (values 1, 2, or 3 enable different modes) |
| `q_delta_range` | Delta range constraint |
| `q_elliptic` | Elliptic curve operations |
| `q_memory` | RAM/ROM memory operations |
| `q_lookup` | Lookup gate |
| `q_poseidon2_external` | Poseidon2 external rounds |
| `q_poseidon2_internal` | Poseidon2 internal rounds |
| `q_busread` | Databus read (Mega only) |

**Non-gate selectors** are general coefficients used within relations. Note that the naming stems from their usage in the Arithmetic constraint but they are reused in other constraints for various purposes:

| Selector | Purpose |
|----------|---------|
| `q_m` | Multiplication coefficient |
| `q_1`, `q_2`, `q_3`, `q_4` | Linear coefficients for each wire |
| `q_c` | Constant term |

### Blocks

The execution trace is constructed in the form of **blocks** (`ExecutionTraceBlock`), one for each gate type. Each block tracks the wires, the non-gate selectors, and a single gate selector corresponding to its gate type (since by definition all other gate selectors are strictly zero in each block). The full execution trace consists of the concatenation of these blocks and is thus "sorted" by gate type. The primary benefit is that the polynomials constructed to represent the execution trace in the proving system inherit this structure which allows for efficient storage in memory and other performance optimizations.

**Ultra blocks**: `pub_inputs`, `lookup`, `arithmetic`, `delta_range`, `elliptic`, `memory`, `nnf`, `poseidon2_external`, `poseidon2_internal`

**Mega blocks** (in addition to the Ultra blocks): `ecc_op`, `busread`

Note: The `pub_inputs` block is the only one which does not correspond to a particular gate type / selector. See the documentation of the permutation argument for more insight into this portion of the trace.

## Arithmetization & Custom Gates

### Core Arithmetic Constraint

The fundamental width-4 arithmetic gate enforces (for `q_arith` = 1):

```
q_m · w_l · w_r  +  q_1 · w_l  +  q_2 · w_r  +  q_3 · w_o  +  q_4 · w_4  +  q_c  =  0
```

By setting selector values appropriately, this supports addition, multiplication, and linear combinations.

### Custom Gates

Beyond basic arithmetic, specialized gates provide efficient constraints for various common operations. Each gate type has an associated **relation** that defines the polynomial constraint:

| Gate Type | Relation | Purpose |
|-----------|----------|---------|
| **Arithmetic** | `ArithmeticRelation` | Extended modes (q_arith = 2, 3) for chained operations |
| **Delta Range** | `DeltaRangeConstraintRelation` | Efficient range constraints |
| **Elliptic** | `EllipticRelation` | EC point addition/doubling on Grumpkin |
| **Poseidon2** | `Poseidon2External/InternalRelation` | Optimized hash function rounds |
| **Lookup** | `LogDerivLookupRelation` | Table-based lookups (plookup) |
| **Memory** | `MemoryRelation` | ROM reads, RAM read/write consistency |
| **Non-native field** | `NonNativeFieldRelation` | Arithmetic over non-native fields via limb decomposition |
| **Databus** (Mega) | `DatabusLookupRelation` | Reads from calldata/returndata vectors |
| **ECC Op Queue** (Mega) | `EccOpQueueRelation` | Deferred ECC operations for Goblin |

## Public Inputs

Public inputs are witness values visible to the verifier. Sample builder syntax:

```cpp
// Create a new public variable
uint32_t pub_idx = builder.add_public_variable(fr(123));

// Or make an existing variable public
builder.set_public_input(existing_idx);
```

The verifier receives these values directly and the proof demonstrates the circuit was satisfied with those public inputs.

## Mega-Specific Features

Mega is used exclusively in the context of client-side proving of Aztec transactions. It extends Ultra with support for efficiently passing large amounts of public data between circuits (Databus) and for tracking deferred elliptic curve operations to be performed efficiently by the purpose built ECCVM later on.

### DataBus

For large amounts of public data shared between multiple circuits (common in Aztec transactions), MegaCircuitBuilder provides the **DataBus**—a more efficient mechanism where prover cost scales with the number of *reads* rather than total data size.

Mega supports lookup-style reads on three bus vectors:
- `calldata`: Primary input data
- `secondary_calldata`: Additional input data
- `returndata`: Output data

See the databus documentation for more details.

### Deferred ("Goblinized") elliptic curve (EC) operations

Performing operations on EC points in circuit is generally expensive since it involves emulating non-native field arithmetic. Mega allows for the deferral of such operations to the purpose built ECCVM, which is defined over Grumpkin (BN254's cycle curve) and can thus perform them much more efficiently. The responsibility of the Mega builder is simply to track and store EC operations in a format that can later be consumed by the ECCVM (and other Goblin components).

Such operations are queued via methods like:

```cpp
// Add a point to the accumulator: acc = acc + P
builder.queue_ecc_add_accum(point);

// Scalar multiply and add to accumulator: acc = acc + (scalar * P)
builder.queue_ecc_mul_accum(point, scalar);

// Assert accumulator equals expected value (and reset)
builder.queue_ecc_eq();
```

The operations are stored in an `ECCOpQueue` shared across circuits in a proving pipeline. The inputs to each operation are recorded in the `ecc_op` block of the execution trace.
