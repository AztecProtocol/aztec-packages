# VM2/AVM Codebase Guide

This document provides a comprehensive guide to the VM2/AVM codebase structure for auditing purposes.

## Directory Structure

```
barretenberg/cpp/
├── pil/vm2/                    # PIL constraint definitions
│   ├── alu.pil                 # ALU operations
│   ├── execution.pil           # Main execution trace
│   ├── memory.pil              # Memory operations
│   ├── execution/              # Execution sub-components
│   │   ├── addressing.pil
│   │   ├── discard.pil
│   │   ├── gas.pil
│   │   └── registers.pil
│   ├── bytecode/               # Bytecode handling
│   ├── opcodes/                # Opcode-specific constraints
│   └── trees/                  # Merkle tree operations
│
└── src/barretenberg/vm2/
    ├── simulation/             # Event collection
    │   ├── gadgets/            # Operation implementations
    │   ├── events/             # Event type definitions
    │   └── lib/                # Simulation utilities
    │
    ├── tracegen/               # Trace generation
    │   ├── lib/                # Builders (lookup, permutation)
    │   └── *_trace.hpp/cpp     # Per-component trace generators
    │
    ├── constraining/           # Proof generation
    │   ├── relations/          # Relation tests
    │   └── testing/            # Test utilities
    │
    └── generated/              # Auto-generated from PIL
        ├── columns.hpp
        ├── relations/
        └── flavor_variables.hpp
```

## Execution Flow

```
TX Input → [SIMULATION] → Events → [TRACEGEN] → Traces → [CONSTRAINING] → Proof
```

### 1. Simulation Layer

**Purpose**: Execute transactions and collect hints/events for proving.

**Key Components**:
- `simulation/gadgets/` - Instruction implementations (ALU, memory, crypto)
- `simulation/events/` - Event type definitions (~15 event types)
- `simulation/lib/` - Database interfaces, utilities

**Event Types**:
- ExecutionEvent - Main instruction events
- AluEvent - ALU operation results
- MemoryEvent - Memory read/write
- MerkleCheckEvent - Tree operations
- RangeCheckEvent - Range check requests
- And more...

### 2. Tracegen Layer

**Purpose**: Convert simulation events into constraint traces.

**Key Components**:
- `*_trace.hpp/cpp` - Per-component trace builders
- `lib/lookup_builder.hpp` - Lookup interaction builder
- `lib/interaction_builder.hpp` - General interaction builder
- `lib/multi_permutation_builder.hpp` - Permutation builder

**Pattern**: Each trace builder:
1. Receives events from simulation
2. Populates columns according to PIL constraints
3. Registers interactions (lookups/permutations)

### 3. Constraining Layer

**Purpose**: Generate and verify zero-knowledge proofs.

**Key Components**:
- `prover.hpp/cpp` - Proof generation
- `verifier.hpp/cpp` - Proof verification
- `flavor.hpp/cpp` - Circuit flavor definition
- `relations/*.test.cpp` - Relation tests

## PIL File Structure

Each PIL file follows this structure:

```pil
include "other_file.pil";

/**
 * Documentation block:
 * - PRECONDITIONS
 * - USAGE (lookup/permutation specifications)
 * - TRACE SHAPE
 * - ERROR HANDLING
 * - INTERACTIONS
 */
namespace component_name;

// Column declarations
pol commit sel;  // @boolean
sel * (1 - sel) = 0;

// Skippable condition
#[skippable_if]
sel = 0;

// Relations with labels
#[RELATION_NAME]
constraint_expression = 0;

// Interactions
source_sel { col1, col2 } in dest_sel { dest_col1, dest_col2 };
```

## Key PIL Files for Audit

### Core Execution
| File | Lines | Priority | Description |
|------|-------|----------|-------------|
| `execution.pil` | ~48K | HIGH | Main execution trace |
| `execution/addressing.pil` | ~27K | HIGH | Address resolution |
| `execution/discard.pil` | ~5K | HIGH | Error/revert handling |
| `execution/gas.pil` | ~3K | HIGH | Gas tracking |
| `execution/registers.pil` | ~2K | HIGH | Register operations |

### ALU/Arithmetic
| File | Lines | Priority | Description |
|------|-------|----------|-------------|
| `alu.pil` | ~31K | HIGH | All ALU operations |
| `gt.pil` | ~5K | LOW | Greater-than comparison |
| `ff_gt.pil` | ~3K | MEDIUM | Field element comparison |

### Memory/Data
| File | Lines | Priority | Description |
|------|-------|----------|-------------|
| `memory.pil` | ~15K | LOW | Memory operations |
| `data_copy.pil` | ~8K | HIGH | CALLDATACOPY/RETURNDATACOPY |
| `calldata.pil` | ~4K | MEDIUM | Calldata handling |

### Tree Operations
| File | Lines | Priority | Description |
|------|-------|----------|-------------|
| `trees/merkle_check.pil` | ~8K | HIGH | Merkle verification |
| `trees/nullifier_check.pil` | ~5K | MEDIUM | Nullifier tree |
| `trees/public_data_check.pil` | ~6K | MEDIUM | Storage tree |
| `trees/note_hash_tree_check.pil` | ~4K | MEDIUM | Note hash tree |

### Transaction
| File | Lines | Priority | Description |
|------|-------|----------|-------------|
| `tx.pil` | ~15K | HIGH | Transaction trace |
| `tx_context.pil` | ~8K | HIGH | TX context handling |
| `tx_discard.pil` | ~3K | HIGH | TX-level discard |

### Cryptographic
| File | Lines | Priority | Description |
|------|-------|----------|-------------|
| `poseidon2_*.pil` | ~65K | HIGH | Poseidon2 hash |
| `keccakf1600.pil` | ~72K | LOW | Keccak hash |
| `sha256.pil` | ~24K | LOW | SHA256 hash |
| `ecc.pil` | ~10K | MEDIUM | Elliptic curve ops |

## Test Infrastructure

### Relation Tests

Located in `constraining/relations/*.test.cpp`

**Test Patterns**:

1. **Empty Row Test** - Verify empty trace satisfies constraints
```cpp
TEST_F(ComponentTest, EmptyRow)
{
    check_relation<component>(testing::empty_trace());
}
```

2. **Negative Test** - Verify violations are detected
```cpp
TEST_F(ComponentTest, NegativeWrongValue)
{
    auto trace = TestTraceContainer({
        {{ C::column, wrong_value }},
    });
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<component>(trace, component::SR_RELATION_NAME),
        "RELATION_NAME"
    );
}
```

3. **Positive Test** - Verify valid computation passes
```cpp
TEST_F(ComponentTest, PositiveValidComputation)
{
    // Create valid trace via builders
    precomputed_builder.process(trace);
    component_builder.process(event, trace);

    check_relation<component>(trace);
    check_all_interactions<ComponentTraceBuilder>(trace);
}
```

### Test Utilities

```cpp
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

// Check specific relation
check_relation<Relation>(trace);

// Check specific subrelation
check_relation<Relation>(trace, Relation::SR_SUBRELATION_NAME);

// Check all interactions for a trace builder
check_all_interactions<TraceBuilder>(trace);

// Check specific interaction
check_interaction<TraceBuilder, InteractionSetting>(trace);
```

## Building and Running Tests

### Build Commands
```bash
# Build all VM2 tests
vmb  # alias for cmake build

# Run all VM2 tests
vmt  # alias for running all vm2 tests

# Run specific test pattern
vmtg "AluConstraining*"  # alias with gtest filter

# Regenerate C++ from PIL
vmp  # alias for bb-pilcom regeneration
```

### Standard Build
```bash
cd barretenberg/cpp
cmake --preset build
cd build
ninja vm2_tests
./bin/vm2_tests --gtest_filter="*ALU*"
```

## Common Audit Tasks

### 1. Check Boolean Constraints
```bash
# Find @boolean annotations
grep -r "@boolean" pil/vm2/

# Verify each has corresponding constraint
# x * (1 - x) = 0;
```

### 2. Check Selector Gating
```bash
# Find selectors that might be under-constrained
grep -r "pol commit sel" pil/vm2/
```

### 3. Check Interaction Declarations
```bash
# Find all lookups
grep -r "} in " pil/vm2/

# Find all permutation builders
grep -r "PermutationBuilder" src/barretenberg/vm2/tracegen/
```

### 4. Check Error Handling
```bash
# Find error selectors
grep -r "sel_err\|sel_error" pil/vm2/

# Verify they gate interactions appropriately
```

### 5. Verify Tracegen Matches PIL
```bash
# For each column in PIL, verify tracegen sets it
# Compare *.pil column names with *_trace.cpp assignments
```

## Key Patterns to Verify

### Initialization Pattern
```pil
// Values must be initialized on first row
#[INIT_VALUE]
precomputed.first_row * (value - INIT_VALUE) = 0;
```

### Propagation Pattern
```pil
// Values propagate unless latch condition
pol LATCH = end + precomputed.first_row;
#[PROPAGATE]
(1 - LATCH) * (value' - value) = 0;
```

### Trace Continuity Pattern
```pil
// Cannot terminate before end
#[TRACE_CONTINUITY]
sel * (1 - sel') * (1 - end) = 0;
```

### Zero-Check Pattern
```pil
// e = 1 iff x = 0
pol commit e;  // @boolean
pol commit inv;
x * (e * (1 - inv) + inv) - 1 + e = 0;
```

### Interaction Selector Pattern
```pil
// Lookup with proper error gating
pol SOURCE = base_sel * (1 - sel_err);
SOURCE { input_cols } in dest_sel { output_cols };
```

## File Naming Conventions

| Suffix | Purpose |
|--------|---------|
| `.pil` | PIL constraint definitions |
| `*_trace.hpp/cpp` | Trace generation code |
| `*_event.hpp` | Event type definitions |
| `*.test.cpp` | Relation tests |
| `*_trace.test.cpp` | Tracegen tests |

## Important Constants

Located in `pil/vm2/constants_gen.pil` and `common/aztec_constants.hpp`:

- `MEM_TAG_*` - Memory tag values (U1, U8, U16, U32, U64, U128, FF)
- `AVM_EXEC_OP_ID_*` - Operation IDs for dispatch
- `AVM_HIGHEST_ADDRESS` - Maximum memory address
- `AVM_*` - Various AVM configuration constants
