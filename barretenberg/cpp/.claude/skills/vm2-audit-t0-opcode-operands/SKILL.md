---
name: vm2-audit-t0-opcode-operands
description: Audit VM2/AVM opcode operand definitions for cross-layer consistency. Verifies that operand counts, types (memory offset vs immediate), and input/output designations match across documentation, instruction_spec, tracegen register columns, and PIL.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Operands Audit

Audit for operand definition mismatches between documentation and implementation.

## When to Use
- Auditing operand counts for opcodes
- Checking operand type classifications
- Reviewing input vs output operand designation
- Investigating incorrect operand resolution
- Verifying new opcode operand definitions

## Severity Assessment

- **High**: Wrong operand count → missing or extra memory accesses
- **High**: Memory offset treated as immediate (or vice versa) → wrong value used
- **Medium**: Input/output designation wrong → incorrect read/write sequence
- **Low**: Documentation naming differs but semantics correct

## Background: Operand Types

Operands come in several types:
1. **Memory offset**: Address to read/write in memory (resolved via addressing)
2. **Immediate value**: Literal value embedded in instruction
3. **Type tag**: Tag specifier for operations like CAST, SET

Operands are classified as:
- **Input**: Read before computation
- **Output**: Written after computation

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Operands section
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/common/instruction_spec.cpp   # num_addresses, RegisterInfo
barretenberg/cpp/src/barretenberg/vm2/common/instruction_spec.hpp   # RegisterInfo class
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp  # Register column usage
```

### PIL
```
barretenberg/cpp/pil/vm2/execution.pil           # register[], mem_tag_reg[]
barretenberg/cpp/pil/vm2/execution/registers.pil # Register constraints
```

## Operand Documentation Format

```markdown
## Operands

| Name | Type | Description |
|------|------|-------------|
| `aOffset` | Memory offset | Memory offset of the first operand |
| `bOffset` | Memory offset | Memory offset of the second operand |
| `dstOffset` | Memory offset | Memory offset where result is written |
```

Types:
- "Memory offset" → address, needs resolution
- "Immediate value" → literal in instruction
- "Type tag" → tag enum value

## Workflow

### Step 1: Select Target Opcode
```bash
cat yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Extract from Operands section:
1. Operand count
2. Each operand's name and type
3. Which are inputs vs outputs (from description)

### Step 2: Verify Instruction Spec
```bash
grep -A 15 "ExecutionOpCode::<OPCODE>," src/barretenberg/vm2/common/instruction_spec.cpp
```

Check:
```cpp
{ ExecutionOpCode::ADD,
  ExecInstructionSpec{
    .num_addresses = 3,  // Memory offsets count
    .register_info = RegisterInfo().add_input().add_input().add_output(),
    ...
  }},
```

Match against documentation:
- `num_addresses` = count of "Memory offset" operands
- `add_input()` calls = input operand count
- `add_output()` calls = output operand count

### Step 3: Verify Tracegen Register Usage
```bash
grep -n "register\[.*\]" src/barretenberg/vm2/tracegen/execution_trace.cpp
```

Check that register indices match operand positions:
- `register[0]` = first operand value
- `register[1]` = second operand value
- etc.

### Step 4: Verify PIL Register Columns
```bash
grep -n "register\[" pil/vm2/execution.pil pil/vm2/execution/registers.pil
```

Check register array size and usage matches operand count.

### Step 5: Cross-Reference Findings

| Opcode | Doc Operands | num_addresses | inputs | outputs | Match? |
|--------|--------------|---------------|--------|---------|--------|
| ADD | 3 (a, b, dst) | 3 | 2 | 1 | Y |
| SET | 2 (tag, dst) + imm | 1 | 0 | 1 | ? |

## Common Mismatch Patterns

### 1. Wrong num_addresses
```markdown
Doc: 3 memory offset operands
Spec: .num_addresses = 2  // WRONG!
```
**Severity**: High - operand not resolved

### 2. Immediate Treated as Memory Offset
```markdown
Doc: `value` is "Immediate value"
Spec: num_addresses includes it  // WRONG!
```
**Severity**: High - tries to resolve literal as address

### 3. Input/Output Mismatch
```markdown
Doc: `dstOffset` is output (written to)
Spec: RegisterInfo().add_input().add_input().add_input()  // All inputs!
```
**Severity**: Medium - may affect memory access order

### 4. Missing Operand in RegisterInfo
```markdown
Doc: 3 operands
Spec: RegisterInfo().add_input().add_output()  // Only 2!
```
**Severity**: High - operand value not tracked

### 5. Wrong Register Index in Tracegen
```cpp
// Doc: operand order is (a, b, dst)
// Tracegen:
registers[0] = b_value;  // Should be a_value
registers[1] = a_value;  // Should be b_value
```
**Severity**: Medium - values swapped

## Operand Categories

### Pure Memory Operations
- ADD, SUB, MUL, DIV: 2 inputs + 1 output, all memory offsets
- AND, OR, XOR, NOT: 1-2 inputs + 1 output

### Mixed (Memory + Immediate)
- SET: immediate value + memory offset output
- CAST: memory input + type tag + memory output

### Variable Operands
- CALLDATACOPY: includes size operand affecting memory range
- EMITUNENCRYPTEDLOG: includes length operand

### No Output
- EMITNOTEHASH, EMITNULLIFIER: input only, no memory output
- JUMP: target only

## RegisterInfo Methods

```cpp
class RegisterInfo {
  // Add input operand (optional expected tag)
  RegisterInfo& add_input(std::optional<ValueTag> tag = std::nullopt);

  // Add output operand
  RegisterInfo& add_output();

  // Query methods
  size_t num_inputs() const;
  size_t num_outputs() const;
  bool need_tag_check(size_t index) const;
  std::optional<ValueTag> expected_tag(size_t index) const;
};
```

## FALSE POSITIVE FILTERING

### 1. Immediate Values Not in num_addresses
Immediates are embedded in instruction, not resolved as addresses. Don't count them in `num_addresses`.

### 2. Type Tags as Separate Operands
Type tags may be handled specially, not as regular operands.

### 3. Addressing Mode Operand
The addressing mode byte is implicit, not listed in operands.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-operands` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-operands-{opcode}-{issue}`
- **Severity**: High / Medium / Low
- **Opcode**: `{opcode name}`
- **Expected**: `{documented operand info}`
- **Actual**: `{implementation operand info}`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-operands.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-operands",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["ADD", "SET", "CAST"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-operands-set-numaddr",
    "severity": "high",
    "opcode": "SET",
    "expected": "1 memory offset (dstOffset only)",
    "actual": "num_addresses = 2",
    "file": "src/barretenberg/vm2/common/instruction_spec.cpp",
    "line": 520,
    "description": "Immediate value incorrectly counted as memory offset",
    "fix": "Change num_addresses to 1"
  }]
}
```
