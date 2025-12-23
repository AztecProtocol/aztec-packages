# Circuit Builders

The `UltraCircuitBuilder` and `MegaCircuitBuilder` builders provide the interface for constructing Ultra/Mega (Plonkish) arithmetized Barretenberg circuits. They manage witness values, define gates (constraints), and track the relationships between variables that the proving system will later enforce.

## Table of Contents

- [Class Hierarchy](#class-hierarchy)
- [Wires, Selectors & Blocks](#wires-selectors--blocks)
  - [Wires, Variables & Witnesses](#wires-variables--witnesses)
  - [Selectors](#selectors)
  - [Blocks](#blocks)
- [Arithmetization & Custom Gates](#arithmetization--custom-gates)
  - [Core Arithmetic Constraint](#core-arithmetic-constraint)
  - [Custom Gates](#custom-gates)
- [Public Inputs](#public-inputs)
- [Circuit Finalization](#circuit-finalization)
- [Mega-Specific Features](#mega-specific-features)
  - [DataBus](#databus)
  - [Deferred ("Goblinized") EC Operations](#deferred-goblinized-elliptic-curve-ec-operations)

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
    - Grumpkin elliptic curve operations
    - Non-native field operations
- **MegaCircuitBuilder**: Implements the Mega arithmetization as a pure extension of Ultra. Adds functionality for
    - DataBus (efficient mechanism for inter-circuit communication in Aztec)
    - Deferred ECC operations (used to defer expensive EC operations to the ECCVM for Goblin)

The `MegaCircuitBuilder` is purpose built to construct circuits representing transactions on Aztec and is always used in conjunction with **Goblin**—a protocol for efficiently proving elliptic curve operations by deferring them to specialized components (see ECCVM, Translator, Merge).

The `UltraCircuitBuilder` is used for everything else, e.g. in the Barretenberg-as-noir-backend for non-Aztec use cases and in Aztec rollup circuits (which don't utilize Goblin).

## Wires, Selectors, Blocks & Tags

### Wires, Variables & Witnesses

Both Ultra and Mega utilize four wires, referred to in the code as `w_1`, `w_2`, `w_3`, `w_4`, OR in some contexts as `w_l` (left), `w_r` (right), `w_o` (output), `w_4` (fourth). The actual witnesses (field values) are stored in a `variables` vector and the wires contain `uint32_t` witness indices which index into this vector. An example of common syntax:

```cpp
uint32_t idx = builder.add_variable(fr(42));  // returns index into variables vector
fr value = builder.get_variable(idx);         // retrieves the value
```

It is instructive to note that `get_variable` uses one additional layer of indirection: Instead of simply returning `variables[idx]`, it returns `variables[real_variable_index[idx]]`, where `real_variable_index` is a map on and into the variables vector indices. This mechanism is used to represent copy constraints in the circuit. Two witnesses are considered to be copy-constrained if and only if they have the same "real_variable_index".

It is sufficient but not necessary for two wire entries to share a witness index to be copy constrained, since two distinct witness indices can map to the same "real variable index". This latter case would occur for example in the following snippet:

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

Note: no selector exists for gates representing deferred ECC operations in the Mega builder. However, there is a selector in the Mega circuit itself for deferred ECC ops: `lagrange_ecc_op`. This is not stored in the builder; the selector is populated later, in `trace_to_polynomials.cpp`, as it can be efficiently derived once the builder phase has completed.

**Non-gate selectors** are general coefficients used within relations. Note that the naming stems from their usage in the Arithmetic constraint but they are reused in other constraints for various purposes:

| Selector | Purpose |
|----------|---------|
| `q_m` | Multiplication coefficient |
| `q_1`, `q_2`, `q_3`, `q_4` | Linear coefficients for each wire |
| `q_c` | Constant term |

### Blocks

The execution trace is constructed in the form of **blocks** (`ExecutionTraceBlock`), one for each gate type. Each block tracks the wires, the non-gate selectors, and a single gate selector corresponding to its gate type (since by definition all other gate selectors are strictly zero in each block). The full execution trace consists of the concatenation of these blocks and is thus "sorted" by gate type. The primary benefit is that the polynomials constructed to represent the execution trace in the proving system inherit this structure which allows for efficient storage in memory and other performance optimizations.

**Ultra blocks:**
- `pub_inputs` — Public inputs (no gate selector)
- `lookup` — Table lookups
- `arithmetic` — Arithmetic operations
- `delta_range` — Delta range constraints
- `elliptic` — Elliptic curve operations
- `memory` — RAM/ROM operations
- `nnf` — Non-native field operations
- `poseidon2_external` — Poseidon2 external rounds
- `poseidon2_internal` — Poseidon2 internal rounds

**Mega blocks** (includes all Ultra blocks, plus):
- `ecc_op` — Deferred ECC operations for Goblin (must be first in trace)
- `busread` — Databus read operations

Within a given block, the corresponding gate selector is not always non-zero (hence why we have to track its values at all). This is because many gates make use of a shift mechanism that allow the constraint at row `i` to incorporate wire values at row `i+1`. In this case, row `i+1` may or may not be otherwise constrained, i.e. the gate selector at row `i+1` may take value 0.

Note: The `pub_inputs` block is the only one which does not correspond to a particular gate type / selector. Public inputs are handled via the permutation argument, which enforces that public input witness values appear in a designated portion of the trace.

### Tags and the multiset-equality check
Tags are a mechanism to enforce multiset-equality checks. Tags are stored in `std::vector<uint32_t> real_variable_tags`; in particular, every `real_variable` has a tag. Real variables that are _not_ used in any non-trivial multiset-equality check are given the `DEFAULT_TAG == 0`. All other tags signify "one side" of a multiset-equality check.

Let $T$ be the set of all real variables (indices) with tag $t$ and $S$ be the set of all real variables with tag $s$. The constraint that $T = S$ as multisets is enforced by adding a transposition $s \leftrightarrow t$ to to `_tau`, the "permutation over tags". (`DEFAULT_TAG` is sent to itself under this permutation.) In other words, `_tau` is a permutation on the set of tags; it has order two, meaning it is the product of disjoint transpositions. Each transposition witnesses a multiset-equality check.

There are two types of tags that occur in Barretenberg.
* For any "regular" (i.e., non-derived) witness, having a non-trivial tag $t$ corresponds to a (small) range constraint.
* In memory operations, we have several derived (a.k.a. post Fiat-Shamir) witnesses that have non-trivial tags.

In both of these examples, tags are used because the underlying arguments, which are similar to plookup, involve duplicating and then sorting witnesses; the multiset-equality check is used to show that the sorted and the unsorted witness multisets agree.

## Arithmetization & Custom Gates

### Core Arithmetic Constraint

The fundamental width-4 arithmetic gate enforces (for `q_arith` = 1):

```
q_m · w_l · w_r  +  q_1 · w_l  +  q_2 · w_r  +  q_3 · w_o  +  q_4 · w_4  +  q_c  =  0
```

By setting selector values appropriately, this supports addition, multiplication, and linear combinations.

**Extended arithmetic modes** (`q_arith` = 2, 3) enable gate chaining for more efficient constraint representation:

| Mode | Behavior |
|------|----------|
| `q_arith = 0` | Gate disabled |
| `q_arith = 1` | Standard arithmetic gate (equation above) |
| `q_arith = 2` | Standard gate + adds `w_4_shift` (fourth wire from next row) as linear term. Enables chaining the output of one gate into the next. |
| `q_arith = 3` | Disables multiplication (`q_m · w_l · w_r` term removed). Enables a secondary "mini addition gate": `w_l + w_4 - w_l_shift + q_m = 0`, where `q_m` is repurposed as an additive constant. Useful for cascading additions. |

### Custom Gates

Beyond basic arithmetic, specialized gates provide efficient constraints for various common operations. Each gate type has an associated **relation** that defines the polynomial constraint:

| Gate Type | Relation | Purpose |
|-----------|----------|---------|
| **Arithmetic** | `ArithmeticRelation` | Width-4 arithmetic with extended modes (see above) |
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

Public witnesses are stored in the `variables` vector like all other witnesses but are tracked independently via the `_public_inputs` vector which stores their indices.

## Circuit Finalization

Before a circuit can be proven, it must be **finalized** via `finalize_circuit()`. Finalization performs necessary preprocessing steps:
- Add a small number of arbitrary valid gates to ensure all polynomials in the proving system will have at least one non-zero coefficient
- Deduplicate and apply non-native field arithmetic constraints
- Setup constraints for RAM/ROM set equality checks
- Apply range constraints
- Move public input data into the corresponding `pub_inputs` block

Note: Finalization is typically called automatically by the proving system, but can be called explicitly for debugging or to check final circuit size.

## Mega-Specific Features

Mega is used exclusively in the context of client-side proving of Aztec transactions. It extends Ultra with support for efficiently passing large amounts of public data between circuits (Databus) and for tracking deferred elliptic curve operations to be performed efficiently by the custom-built ECCVM later on.

### DataBus

For large amounts of public data shared between multiple circuits (common in Aztec transactions), MegaCircuitBuilder provides the **DataBus**—a more efficient mechanism where prover cost scales with the number of *reads* rather than total data size.

Mega supports lookup-style reads on three bus vectors:
- `calldata`: Primary input data
- `secondary_calldata`: Additional input data
- `returndata`: Output data

See `databus.hpp` in this directory for implementation details.

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
