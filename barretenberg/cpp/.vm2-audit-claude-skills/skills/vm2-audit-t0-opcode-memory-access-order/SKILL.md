---
name: vm2-audit-t0-opcode-memory-access-order
description: Audit VM2/AVM opcode memory access ordering for cross-layer consistency. Verifies that memory reads occur before writes, rw flags are correct, and temporality group selectors properly sequence memory operations for permutation soundness.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Memory Access Order Audit

Audit for memory access ordering issues that can cause permutation soundness problems or incorrect execution.

## When to Use
- Auditing read/write ordering for opcodes
- Checking rw_reg flags in tracegen
- Reviewing temporality group selectors
- Investigating memory permutation failures
- Verifying memory trace consistency

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

- **Critical**: Write before read → wrong value used in computation
- **High**: Wrong rw flag → memory permutation unsound
- **Medium**: Temporality group selector mismatch
- **Low**: Ordering correct but documentation unclear

## Background: Memory Access Ordering

The AVM enforces strict ordering of memory operations:

1. **Temporality Groups**: Operations occur in phases
   - Group 3: Register read (inputs from memory)
   - Group 6: Register write (outputs to memory)

2. **Read-Before-Write**: For each instruction, ALL reads must complete before ANY writes

3. **Memory Permutation**: The memory trace uses timestamps to verify ordering
   - Timestamp = (clock << 1) + mode (0=read, 1=write)
   - Ensures reads at clock N happen before writes at clock N

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Operands (input vs output)
yarn-project/simulator/docs/avm/memory.md       # Memory model
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/execution.cpp
barretenberg/cpp/src/barretenberg/vm2/simulation/memory.cpp
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp  # rw_reg flags
barretenberg/cpp/src/barretenberg/vm2/tracegen/memory_trace.cpp     # Memory events
```

### PIL
```
barretenberg/cpp/pil/vm2/execution/registers.pil    # sel_should_read/write_registers
barretenberg/cpp/pil/vm2/memory.pil                 # Memory permutation
```

## Memory Access Patterns

### Standard ALU Pattern
```
1. Read input A (rw=0)
2. Read input B (rw=0)
3. Compute result
4. Write output C (rw=1)
```

### In-Place Operation (e.g., MOV where src=dst)
```
1. Read src (rw=0)
2. Write dst (rw=1)
// If src == dst, still recorded as read then write
```

### Multiple Outputs (rare)
```
1. Read all inputs
2. Write output 1
3. Write output 2
```

## Workflow

### Step 1: Identify Input vs Output Operands
```bash
cat yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

From Operands table and description:
- Inputs: Read from memory before computation
- Outputs: Written to memory after computation

### Step 2: Verify Simulation Ordering
```bash
grep -A 40 "void Execution::<opcode>" src/barretenberg/vm2/simulation/gadgets/execution.cpp
```

Check code order:
```cpp
void Execution::add(...) {
    // READS FIRST
    const MemoryValue a = memory.get(a_addr);  // Read
    const MemoryValue b = memory.get(b_addr);  // Read

    // COMPUTATION
    MemoryValue c = alu.add(a, b);

    // WRITES LAST
    memory.set(dst_addr, c);  // Write
}
```

### Step 3: Verify Tracegen rw Flags
```bash
grep -n "rw_reg\|MemoryMode" src/barretenberg/vm2/tracegen/execution_trace.cpp
```

Check `rw_reg_*` column assignments:
```cpp
// Inputs should be rw=0 (read)
row.set(C::execution_rw_reg_0_, 0);  // Input A
row.set(C::execution_rw_reg_1_, 0);  // Input B

// Outputs should be rw=1 (write)
row.set(C::execution_rw_reg_2_, 1);  // Output C
```

### Step 4: Verify Temporality Selectors
```bash
grep -n "sel_should_read_registers\|sel_should_write_registers" src/barretenberg/vm2/tracegen/execution_trace.cpp
```

Check selectors are set correctly:
- `sel_should_read_registers = 1` when reading inputs
- `sel_should_write_registers = 1` when writing outputs

### Step 5: Verify Memory Trace Events
```bash
grep -n "MemoryEvent\|memory_trace" src/barretenberg/vm2/tracegen/
```

Check events have correct mode:
```cpp
MemoryEvent{
    .mode = MemoryMode::READ,  // or WRITE
    .address = addr,
    .value = value,
    .clk = current_clock
}
```

### Step 6: Verify PIL Constraints
```bash
grep -n "rw\|memory_rw" pil/vm2/memory.pil pil/vm2/execution/registers.pil
```

Check memory permutation includes rw flag:
```pil
// Memory permutation tuple should include rw
sel_mem_op { address, value, rw, clk, ... } permute memory.sel { ... }
```

### Step 7: Cross-Reference Findings

| Opcode | Doc Inputs | Doc Outputs | Sim Order | Tracegen rw | Match? |
|--------|------------|-------------|-----------|-------------|--------|
| ADD | a, b | dst | read,read,write | 0,0,1 | Y |
| MOV | src | dst | read,write | 0,1 | Y |

## Common Mismatch Patterns

### 1. Write Before Read
```cpp
void Execution::bad_op(...) {
    memory.set(dst_addr, initial);  // WRONG: Write first
    const auto a = memory.get(a_addr);  // Read after write
}
```
**Severity**: Critical - uses stale value

### 2. Wrong rw Flag
```cpp
// Output marked as read
row.set(C::execution_rw_reg_2_, 0);  // Should be 1 for output!
```
**Severity**: High - memory permutation unsound

### 3. Missing Temporality Selector
```cpp
// Read selector not set
// row.set(C::execution_sel_should_read_registers, 1);  // MISSING!
```
**Severity**: High - reads not validated

### 4. Read-Modify-Write Incorrect
```cpp
// In-place increment
auto val = memory.get(addr);      // Read
memory.set(addr, val + 1);        // Write
// But tracegen records as single write, missing read!
```
**Severity**: High - read not recorded

### 5. Clock Ordering Wrong
```cpp
// Memory events generated with wrong clock
MemoryEvent{ .clk = wrong_clock, ... }
```
**Severity**: High - timestamp ordering violated

## Opcodes Requiring Special Attention

### In-Place Operations
- Operations where src and dst can be same address
- Must still record read then write

### Multiple Outputs
- Rare, but must order multiple writes correctly
- Each write at incrementing sub-clock or all at same clock

### Conditional Writes
- JUMPI: May or may not modify state based on condition
- Must not record write if condition false

### Range Operations
- CALLDATACOPY, RETURNDATACOPY: Multiple reads/writes
- Order within range must be consistent

## FALSE POSITIVE FILTERING

### 1. Optimization: Single-Clock Read/Write
Some implementations record read and write at same clock but different sub-timestamp. This is correct.

### 2. No-Op Cases
If operation results in no memory change (e.g., MOV to same value), write may be optimized away. Verify this is intentional.

### 3. Error Path
On error, writes may not occur. Don't report missing write if error path is taken.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-memory-access-order` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-memory-access-order-{opcode}-{issue}`
- **Severity**: Critical / High / Medium / Low
- **Opcode**: `{opcode name}`
- **Expected Order**: `{documented/required order}`
- **Actual Order**: `{implementation order}`
- **Layer**: `Simulation / Tracegen / PIL`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-memory-access-order.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-memory-access-order",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["ADD", "MOV", "CALLDATACOPY"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-memory-access-order-mov-rw",
    "severity": "high",
    "opcode": "MOV",
    "expected_order": "Read src (rw=0), Write dst (rw=1)",
    "actual_order": "Both marked as rw=0",
    "layer": "Tracegen",
    "file": "src/barretenberg/vm2/tracegen/execution_trace.cpp",
    "line": 892,
    "description": "Output operand incorrectly marked as read",
    "fix": "Set rw_reg for output to 1"
  }]
}
```
