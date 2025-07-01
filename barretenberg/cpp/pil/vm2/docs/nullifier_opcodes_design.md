# Design Document: NullifierExists and EmitNullifier AVM Opcodes Implementation

## Overview

This document outlines the implementation of two missing AVM opcodes: `NullifierExists` and `EmitNullifier`. These opcodes currently exist only in the TypeScript simulator but need to be implemented in both the C++ execution engine and PIL (Polynomial Identity Language) constraints.

## Current State

### What Exists
- ✅ TypeScript implementation in `@yarn-project/simulator/src/public/avm/opcodes/accrued_substate.ts`
- ✅ Core nullifier logic in PIL and simulation (used by other components)
- ✅ Opcode definitions and wire formats

### What's Missing
- ❌ C++ execution implementation in barretenberg
- ❌ PIL trace generation for execution.pil
- ❌ Integration with AVM opcode dispatch

## Opcode Specifications

### NullifierExists
**Purpose**: Check if a nullifier exists for a given address
**Operands**:
- `indirect` (uint8): Addressing mode flags
- `nullifierOffset` (uint16): Memory offset of nullifier value
- `addressOffset` (uint16): Memory offset of contract address
- `existsOffset` (uint16): Memory offset to write result (0 or 1)

**Behavior**:
1. Read nullifier (Field) from memory at `nullifierOffset`
2. Read address (AztecAddress) from memory at `addressOffset`
3. Check if nullifier exists for the given address
4. Write result (Uint1: 0 or 1) to memory at `existsOffset`

### EmitNullifier
**Purpose**: Emit a new nullifier for the current contract
**Operands**:
- `indirect` (uint8): Addressing mode flags
- `nullifierOffset` (uint16): Memory offset of nullifier value

**Behavior**:
1. Check if in static call (throw error if true)
2. Read nullifier (Field) from memory at `nullifierOffset`
3. Attempt to write nullifier for current contract address
4. Handle nullifier collision by throwing InstructionExecutionError

## Implementation Plan

### Phase 1: C++ Execution Implementation

#### 1.1 Add Opcode Definitions
**File**: `barretenberg/cpp/src/barretenberg/vm2/common/opcodes.hpp`
```cpp
enum class ExecutionOpCode : uint8_t {
    // ... existing opcodes ...
    NULLIFIEREXISTS,
    EMITNULLIFIER,
    // ... rest of opcodes ...
};
```

#### 1.2 Implement Execution Methods
**File**: `barretenberg/cpp/src/barretenberg/vm2/simulation/execution.hpp`
```cpp
class Execution {
    // ... existing methods ...
    
    void nullifier_exists(ContextInterface& context,
                          MemoryAddress nullifier_addr,
                          MemoryAddress address_addr,
                          MemoryAddress exists_addr);
    
    void emit_nullifier(ContextInterface& context,
                       MemoryAddress nullifier_addr);
    
    // ... rest of class ...
};
```

**File**: `barretenberg/cpp/src/barretenberg/vm2/simulation/execution.cpp`
```cpp
void Execution::nullifier_exists(ContextInterface& context,
                                MemoryAddress nullifier_addr,
                                MemoryAddress address_addr,
                                MemoryAddress exists_addr)
{
    constexpr auto opcode = ExecutionOpCode::NULLIFIEREXISTS;
    auto& memory = context.get_memory();
    
    // Read operands from memory
    MemoryValue nullifier = memory.get(nullifier_addr);
    MemoryValue address = memory.get(address_addr);
    set_and_validate_inputs(opcode, { nullifier, address });
    
    // Check nullifier existence via MerkleDB
    bool exists = merkle_db.nullifier_exists(AztecAddress(address.as<FF>()), nullifier.as<FF>());
    
    // Write result to memory
    TaggedValue result = TaggedValue::from<uint1_t>(uint1_t{ exists ? 1u : 0u });
    memory.set(exists_addr, result);
    set_output(opcode, result);
}

void Execution::emit_nullifier(ContextInterface& context, MemoryAddress nullifier_addr)
{
    constexpr auto opcode = ExecutionOpCode::EMITNULLIFIER;
    auto& memory = context.get_memory();
    
    // Check static call restriction
    if (context.get_is_static()) {
        throw std::runtime_error("Cannot emit nullifier in static call");
    }
    
    // Read nullifier from memory
    MemoryValue nullifier = memory.get(nullifier_addr);
    set_and_validate_inputs(opcode, { nullifier });
    
    // Emit nullifier via MerkleDB
    bool success = merkle_db.nullifier_write(context.get_address(), nullifier.as<FF>());
    if (!success) {
        // Handle nullifier collision - nullifier_write returns false if already exists
        throw std::runtime_error("Nullifier collision: nullifier already exists");
    }
    
    // No output for emit operations
    set_output(opcode, TaggedValue::from<FF>(0));
}
```

#### 1.3 Integrate with Opcode Dispatch
**File**: `barretenberg/cpp/src/barretenberg/vm2/simulation/execution.cpp`
```cpp
void Execution::dispatch_opcode(ExecutionOpCode opcode,
                                ContextInterface& context,
                                const std::vector<Operand>& resolved_operands)
{
    // ... existing switch cases ...
    switch (opcode) {
        // ... existing cases ...
        case ExecutionOpCode::NULLIFIEREXISTS:
            call_with_operands(&Execution::nullifier_exists, context, resolved_operands);
            break;
        case ExecutionOpCode::EMITNULLIFIER:
            call_with_operands(&Execution::emit_nullifier, context, resolved_operands);
            break;
        // ... rest of cases ...
    }
}
```

### Phase 2: Add MerkleDB Component

#### 2.1 Add Component to Execution Class
**File**: `barretenberg/cpp/src/barretenberg/vm2/simulation/execution.hpp`
```cpp
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

class Execution {
    // ... existing members ...
    ALU alu;
    DataCopy data_copy;
    KeccakF1600 keccakf1600;
    HighLevelMerkleDBInterface& merkle_db;  // Add reference to MerkleDB component
    
    // ... existing methods ...
};
```

#### 2.2 Initialize Component
**File**: `barretenberg/cpp/src/barretenberg/vm2/simulation/execution.cpp`
```cpp
// In constructor or initialization
Execution::Execution(/* ... */, MerkleDB& merkle_db) 
    : alu(...)
    , data_copy(...)
    , keccakf1600(...)
    , merkle_db(merkle_db)  // Initialize component reference
{
    // ...
}
```

### Phase 3: PIL Trace Implementation

#### 3.1 Register Info Database
**File**: `barretenberg/cpp/src/barretenberg/vm2/simulation/instruction_info_db.cpp`
```cpp
// Add register information for nullifier opcodes
{ExecutionOpCode::NULLIFIEREXISTS, {
    .register_info = RegisterInfo(
        /*num_inputs=*/2,
        /*num_outputs=*/1,
        /*input_tags=*/{ValueTag::FF, ValueTag::FF},
        /*output_tag=*/ValueTag::U1
    ),
    .gas_info = GasInfo(/*base_gas=*/100, /*dynamic_gas_fn=*/nullptr)
}},

{ExecutionOpCode::EMITNULLIFIER, {
    .register_info = RegisterInfo(
        /*num_inputs=*/1,
        /*num_outputs=*/1,
        /*input_tags=*/{ValueTag::FF},
        /*output_tag=*/ValueTag::FF
    ),
    .gas_info = GasInfo(/*base_gas=*/200, /*dynamic_gas_fn=*/nullptr)
}},
```

#### 3.2 Event Emission and Trace Generation

The VM2 system uses an event-driven architecture where execution automatically generates `ExecutionEvent` objects that contain all information needed for PIL trace generation. For nullifier opcodes, the standard event will capture:

- **Input values**: Nullifier, address (for NullifierExists)
- **Output values**: Existence result (for NullifierExists) 
- **Context information**: Contract address, static call flag
- **Gas consumption**: Base gas costs
- **Memory operations**: Register reads/writes

No additional event types are needed - the existing `ExecutionEvent` structure is sufficient.

### Phase 4: PIL Constraint Implementation

#### 4.1 Execution PIL Extensions
**File**: `barretenberg/cpp/pil/vm2/execution.pil`

The nullifier opcodes will require minimal PIL changes since they use standard register operations:

```pil
namespace execution;

// Add opcode selectors for nullifier operations
pol commit sel_op_nullifier_exists;
pol commit sel_op_emit_nullifier;

// Boolean constraints for selectors
#[SEL_NULLIFIER_EXISTS_BINARY]
sel_op_nullifier_exists * (1 - sel_op_nullifier_exists) = 0;

#[SEL_EMIT_NULLIFIER_BINARY] 
sel_op_emit_nullifier * (1 - sel_op_emit_nullifier) = 0;

// Static call constraint for EmitNullifier
// This opcode should not execute in static calls
#[EMIT_NULLIFIER_STATIC_CALL_CHECK]
sel_op_emit_nullifier * is_static_call = 0;

// Execution opcode mutual exclusion (existing pattern)
// Add new selectors to the existing sum constraint
sel_op_add + sel_op_sub + ... + sel_op_nullifier_exists + sel_op_emit_nullifier in {0, 1};
```

#### 4.2 Execution Trace Generation
**File**: `barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp`

The trace builder needs to handle the new opcodes:

```cpp
Column ExecutionTraceBuilder::get_execution_opcode_selector(ExecutionOpCode exec_opcode) const {
    switch (exec_opcode) {
        // ... existing cases ...
        case ExecutionOpCode::NULLIFIEREXISTS:
            return C::execution_sel_op_nullifier_exists;
        case ExecutionOpCode::EMITNULLIFIER:
            return C::execution_sel_op_emit_nullifier;
        // ... rest of cases ...
    }
}

void ExecutionTraceBuilder::process_execution_opcode(const ExecutionEvent& ex_event, TraceContainer& trace, size_t row) {
    // Standard opcode processing (existing pattern)
    auto exec_opcode = ex_event.wire_instruction.get_exec_opcode();
    auto selector_column = get_execution_opcode_selector(exec_opcode);
    trace.set(row, selector_column, 1);
    
    // Nullifier operations use standard register allocation
    // No special trace processing needed beyond standard input/output handling
}
```

#### 4.3 Generated Columns
**File**: `barretenberg/cpp/src/barretenberg/vm2/generated/columns.hpp`

New columns will be auto-generated from the PIL:
```cpp
enum class Column {
    // ... existing columns ...
    execution_sel_op_nullifier_exists,
    execution_sel_op_emit_nullifier,
    // ... rest of columns ...
};
```

### Phase 5: MerkleDB Integration

#### 5.1 Using Existing MerkleDB Component
The `MerkleDB` class provides the perfect interface for nullifier operations:
**File**: `barretenberg/cpp/src/barretenberg/vm2/simulation/concrete_dbs.hpp`

```cpp
class MerkleDB final : public HighLevelMerkleDBInterface {
public:
    // Perfect interface for our needs:
    bool nullifier_exists(const AztecAddress& contract_address, const FF& nullifier) const override;
    
    // Returns false if the nullifier already exists, performing a membership proof instead.
    bool nullifier_write(const AztecAddress& contract_address, const FF& nullifier) override;
    
    // ... other methods ...
};
```

#### 5.2 No Additional Implementation Needed
The `MerkleDB` class already has exactly the interface we need:
- `nullifier_exists()` returns a boolean indicating if the nullifier exists
- `nullifier_write()` returns false if the nullifier already exists (collision detection)
- Both methods handle all the complex tree operations internally
- Both methods automatically generate appropriate PIL events

#### 5.3 Integration with Existing PIL Components
The `MerkleDB` component leverages existing nullifier infrastructure:
- `nullifier_tree.pil` - for tree operations (via `NullifierTreeCheckInterface`)
- `nullifier_non_existence_check.pil` - for existence checking
- Existing nullifier tree data structures and algorithms
- Automatic event generation for PIL trace creation
- Built-in nullifier counter management

#### 5.4 Gas Costing
Gas costs are handled through the instruction info database:
- Base gas cost defined per opcode in instruction_info_db.cpp
- No additional dynamic costs (unlike array operations)
- Gas tracking handled automatically by existing gas tracker

### Phase 6: Testing and Validation

#### 6.1 Unit Tests
Create tests in `barretenberg/cpp/src/barretenberg/vm2/tests/`:
- Basic nullifier existence checking
- Nullifier emission and collision detection
- Static call restrictions for EmitNullifier
- Memory tag validation
- Gas consumption verification

#### 6.2 Integration Tests
- End-to-end VM2 execution tests
- Event emission validation
- Cross-context nullifier operations
- PIL constraint satisfaction tests

#### 6.3 Cross-Implementation Consistency
- Verify C++ implementation matches TypeScript behavior exactly
- Test with same inputs across both implementations
- Validate gas costs match between implementations

#### 6.4 PIL Trace Validation
Create tests to verify PIL trace generation:
```cpp
TEST(NullifierOpcodes, GeneratesCorrectPILTrace) {
    // Execute nullifier operations
    auto events = execute_test_program();
    
    // Generate PIL traces
    TraceContainer trace;
    AvmTraceGenHelper::fill_trace_columns(trace, std::move(events), public_inputs);
    
    // Validate trace contents
    EXPECT_EQ(trace.get(row, C::execution_sel_op_nullifier_exists), 1);
    EXPECT_EQ(trace.get(row, C::execution_ia), expected_nullifier);
    EXPECT_EQ(trace.get(row, C::execution_ib), expected_address);
    EXPECT_EQ(trace.get(row, C::execution_ic), expected_result);
}
```

## Key Design Decisions

### 1. Standard Register Logic
Unlike KeccakF1600 which operates on arrays, these opcodes work with individual memory words, allowing use of standard register-based memory operations without special handling.

### 2. Error Handling
- `NullifierExists`: No special error cases, always succeeds
- `EmitNullifier`: Must handle static call restrictions and nullifier collisions

### 3. Memory Type Checking
Follow TypeScript implementation:
- `NullifierExists`: Check FIELD tags for nullifier and address inputs
- `EmitNullifier`: Check FIELD tag for nullifier input

### 4. Following VM2 Architecture
The implementation follows the established VM2 pattern:
- Clean separation between execution logic and PIL trace generation
- Context interface abstraction for world state operations
- Automatic event emission and trace capture
- Register validation through instruction info database

## Timeline and Dependencies

1. **Phase 1** (C++ Execution): 1-2 weeks
   - Depends on: Existing VM2 execution infrastructure
2. **Phase 2** (MerkleDB Integration): 0.5 weeks  
   - Depends on: Phase 1 completion, existing MerkleDB component
3. **Phase 3** (Instruction Info Database): 0.5 weeks
   - Depends on: Existing event system and instruction info database
4. **Phase 4** (PIL Constraints): 1 week
   - Depends on: Phase 3 completion, existing execution.pil
5. **Phase 5** (Component Integration): 0.5 weeks
   - Depends on: Existing nullifier PIL components
6. **Phase 6** (Testing): 1 week
   - Depends on: All previous phases

**Total Estimated Time**: 3.5-4 weeks

## Risks and Mitigations

1. **Risk**: MerkleDB integration complexity
   **Mitigation**: MerkleDB already has the exact interface needed, minimal integration required

2. **Risk**: Performance impact of nullifier lookups
   **Mitigation**: Reuse existing optimized nullifier tree operations through MerkleDB, proven infrastructure

3. **Risk**: Cross-implementation inconsistency
   **Mitigation**: Comprehensive cross-testing with TypeScript golden standard, especially around error handling and gas costs

4. **Risk**: Event system integration complexity
   **Mitigation**: MerkleDB automatically handles event generation, follows existing patterns

5. **Risk**: Execution class constructor changes
   **Mitigation**: Add MerkleDB reference parameter to existing constructor, minimal disruption
