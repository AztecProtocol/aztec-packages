# Boomerang Value Detection

A static analysis tool that detects under-constrained variables in circuits by analyzing the constraint graph structure. The name "boomerang" refers to a common circuit bug: taking a value out of the circuit and then returning it without creating an appropriate constraint.

## Overview

The `StaticAnalyzer` class constructs an undirected graph representation of a circuit where:
- **Vertices** are circuit variables
- **Edges** connect variables that appear together in the same gate

The analyzer then identifies two categories of potential soundness issues:

1. **Variables in one gate**: Variables appearing in only a single gate are likely under-constrained
2. **Disconnected components**: Multiple connected components indicate missing constraints between variable groups

## Key Concepts

### Variable Constraints

In a properly constrained circuit, most variables should:
- Appear in **multiple gates** (constrained from multiple angles)
- Be **connected** to other variables through shared gates

A variable in only one gate may be:
- Unconstrained (prover can set it arbitrarily)
- Missing a constraint that ties it to other variables
- A legitimate auxiliary variable (false positive—see filtering below)

### Connected Components

The analyzer uses depth-first search to partition the circuit variables into **connected components**—maximal sets of variables that constrain each other through gate connections.

**Ideal**: A fully constrained circuit typically has a single large connected component (all variables are transitively related through constraints).

**Warning sign**: Multiple disconnected components suggest missing constraints between variable groups.

## StaticAnalyzer API

### Construction

```cpp
StaticAnalyzer analyzer(circuit_builder, /*connect_variables=*/true);
```

- `circuit_builder`: UltraCircuitBuilder or MegaCircuitBuilder to analyze
- `connect_variables`: If true (default), builds the adjacency graph. Set to false for gate counting only.

### Analysis

```cpp
auto [connected_components, variables_in_one_gate] = analyzer.analyze_circuit();
```

Returns:
- `connected_components`: Vector of `ConnectedComponent` objects
- `variables_in_one_gate`: Set of variable indices appearing in only one gate (after filtering)

### Connected Component Structure

```cpp
struct ConnectedComponent {
    std::vector<uint32_t> variable_indices;  // Variables in this component
    bool is_range_list_cc;                   // Component from range check internals
    bool is_finalize_cc;                     // Component from finalization logic
    bool is_process_rom_cc;                  // Component from ROM processing

    size_t size() const;                     // Number of variables
    const std::vector<uint32_t>& vars() const;
};
```

## False Positive Filtering

The analyzer implements filtering to avoid false positives from legitimate auxiliary variables:

### 1. Range Check Variables
Range constraints create auxiliary variables that may only appear in one gate. Marked via `is_range_list_cc`.

### 2. Plookup Table Internals
Lookup gates create internal variables for table lookups. Filtered by analyzing `plookup::BasicTableId`:
- AES lookup internals
- SHA256 lookup internals
- Generic plookup bookkeeping variables

### 3. ROM/RAM Table Processing
Memory operations create auxiliary variables for index validation and value tracking. Marked via `is_process_rom_cc`.

### 4. Decomposition Chains
Multi-limb decompositions create intermediate variables. Tracked and filtered during analysis.

### 5. Constant Variables
Pure constants (not circuit variables) are excluded from analysis.

### 6. Witness Record Variables
Internal bookkeeping variables used by the circuit builder are filtered.

## Usage in Tests

The analyzer is used in test suites to verify circuit constructions:

```cpp
// Construct a circuit
UltraCircuitBuilder builder;
// ... add gates ...

// Analyze the circuit
StaticAnalyzer analyzer(builder);
auto [connected_components, vars_in_one_gate] = analyzer.analyze_circuit();

// Verify soundness properties
EXPECT_EQ(connected_components.size(), 1);  // Should have one connected component
EXPECT_TRUE(vars_in_one_gate.empty());      // No variables in only one gate
```

## Test Coverage

The `boomerang_value_detection/` directory contains extensive test coverage:

### Cryptographic Primitives
- `graph_description_sha256.test.cpp` - SHA256 circuits
- `graph_description_aes128.test.cpp` - AES128 circuits
- `graph_description_blake2s.test.cpp` - Blake2s circuits
- `graph_description_blake3s.test.cpp` - Blake3s circuits
- `graph_description_poseidon2s_permutation.test.cpp` - Poseidon2 permutation

### Field Arithmetic
- `graph_description_bigfield.test.cpp` - Non-native field arithmetic

### Memory Operations
- `graph_description_ram_rom.test.cpp` - RAM and ROM table operations

### Recursive Verifiers
- `graph_description_ultra_recursive_verifier.test.cpp` - Ultra recursive verifier
- `graph_description_merge_recursive_verifier.test.cpp` - Merge protocol recursive verifier
- `graph_description_goblin.test.cpp` - Goblin recursive verifier
- `graph_description_ipa_recursive.test.cpp` - IPA recursive verification

### Circuit Builders
- `graph_description_megacircuitbuilder.test.cpp` - MegaCircuitBuilder validation
- `graph_description.test.cpp` - Core analyzer functionality

### Variable Tracking
- `variable_gates_count.test.cpp` - Variable gate count tracking

## Implementation Details

### Graph Construction

The analyzer processes the circuit execution trace, extracting variables from different gate types:

- **Arithmetic gates**: Standard addition/multiplication gates
- **Elliptic curve gates**: EC point addition/doubling
- **Plookup gates**: Table lookup operations
- **Sort constraints**: Sorting/range check constraints
- **Poseidon2 gates**: Poseidon2 permutation gates
- **Non-native field gates**: BigField arithmetic gates
- **Memory gates**: RAM/ROM access gates
- **Databus gates** (Mega only): Public data bus operations
- **ECCOP gates** (Mega only): ECC operation table entries

For each gate, variables are extracted and edges are added between co-occurring variables.

### Data Structures

- **variable_adjacency_lists**: Maps each variable to its neighbors in the constraint graph
- **variables_gate_counts**: Counts how many gates each variable appears in
- **variable_gates**: Maps (variable, block) pairs to gate indices where that variable appears
- **variables_in_one_gate**: Set of variables appearing in exactly one gate
- **constant_variable_indices_set**: Set of constant variables to exclude

### Analysis Algorithm

1. **Process execution trace**: Build adjacency lists and count gates per variable
2. **Save constant indices**: Identify and exclude constants
3. **Filter false positives**: Remove legitimate auxiliary variables from various subsystems
4. **Find connected components**: DFS to partition variables into connected components
5. **Mark special components**: Label components from range checks, finalization, ROM processing
6. **Report results**: Return components and variables in one gate (after filtering)

## Limitations

- **Static analysis only**: Doesn't simulate circuit execution or check constraint satisfiability
- **Heuristic filtering**: False positive filtering is based on gate patterns and may miss new patterns
- **No severity ranking**: Doesn't distinguish between critical vs minor issues
- **Large circuits**: Analysis time grows with circuit size (DFS is O(V+E))
