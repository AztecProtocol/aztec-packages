---
name: vm2-audit-t0-opcode-wire-format
description: Audit VM2/AVM opcode wire formats for cross-layer consistency. Verifies that bytecode encoding (opcode values, instruction sizes, operand bit positions) matches documentation across WireOpCode enum, instruction_spec, and bytecode parsing.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Wire Format Audit

Audit for bytecode encoding mismatches between documentation and implementation.

## When to Use
- Auditing opcode byte values
- Checking instruction size definitions
- Reviewing operand bit positions
- Investigating bytecode parsing issues
- Verifying new opcode wire format variants

## Severity Assessment

- **Soundness** (malicious prover exploits): High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

- **High**: Wrong opcode value → executes wrong instruction
- **High**: Wrong instruction size → parser reads wrong bytes
- **Medium**: Operand bit position mismatch → wrong operand values
- **Low**: Documentation unclear but parsing correct

## Background: Wire Formats

Each opcode has one or more wire format variants:
- `ADD_8` (0x00): 8-bit operand offsets, 5 bytes total
- `ADD_16` (0x01): 16-bit operand offsets, 7 bytes total

Wire format determines:
1. **Opcode byte**: First byte identifying the instruction
2. **Instruction size**: Total bytes to read
3. **Operand positions**: Where each operand is in the byte stream
4. **Addressing mode byte**: Position 1, encodes indirect/relative flags

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Wire Formats section
yarn-project/simulator/docs/avm/wire-format.md  # Wire format explanation
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/common/opcodes.hpp          # WireOpCode enum
barretenberg/cpp/src/barretenberg/vm2/common/instruction_spec.cpp # Wire specs
barretenberg/cpp/src/barretenberg/vm2/simulation/bytecode_manager.cpp # Parsing
```

## Wire Format Structure

### Documentation Format (Mermaid Diagram)
```markdown
**ADD_8** (Opcode 0x00):
packet-beta
0-7: "Opcode (0x0)"
8-15: "Addressing modes"
16-23: "Operand: aOffset"
24-31: "Operand: bOffset"
32-39: "Operand: dstOffset"
```

### Implementation Mapping
| Doc Element | Implementation |
|-------------|----------------|
| Opcode (0x0) | `WireOpCode::ADD_8 = 0x00` |
| Addressing modes (bits 8-15) | Always byte 1 |
| Operand positions | Parsed based on `size_in_bytes` |
| Total size | 40 bits = 5 bytes |

## Workflow

### Step 1: Select Target Opcode
```bash
cat yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Extract from Wire Formats section:
1. Opcode hex value (e.g., `0x00`)
2. Total bit count (e.g., 40 bits = 5 bytes)
3. Operand positions

### Step 2: Verify WireOpCode Enum
```bash
grep -n "WireOpCode" src/barretenberg/vm2/common/opcodes.hpp | head -100
```

Check:
- Enum value matches documented hex
- Variant naming matches (ADD_8, ADD_16)

### Step 3: Verify Wire Instruction Spec
```bash
grep -A 5 "WireOpCode::<OPCODE>" src/barretenberg/vm2/common/instruction_spec.cpp
```

Check `WireInstructionSpec`:
```cpp
{ .wire_opcode = WireOpCode::ADD_8,
  .exec_opcode = ExecutionOpCode::ADD,
  .size_in_bytes = 5,  // Must match doc (40 bits / 8)
  .num_operands = 3 },
```

### Step 4: Verify Operand Parsing
```bash
grep -n "parse_operand\|read_bytes" src/barretenberg/vm2/simulation/bytecode_manager.cpp
```

Check that operand positions match documentation bit ranges.

### Step 5: Cross-Reference Findings

| Opcode | Doc Value | Enum Value | Doc Size | Spec Size | Match? |
|--------|-----------|------------|----------|-----------|--------|
| ADD_8 | 0x00 | 0x00 | 5 bytes | 5 | Y |
| ADD_16 | 0x01 | 0x01 | 7 bytes | 7 | Y |

## Common Mismatch Patterns

### 1. Wrong Opcode Value
```markdown
Doc: Opcode `0x32`
Enum: WireOpCode::EMITNOTEHASH = 0x33  // WRONG!
```
**Severity**: High - executes wrong instruction

### 2. Wrong Instruction Size
```markdown
Doc: 40 bits (5 bytes)
Spec: .size_in_bytes = 4  // WRONG!
```
**Severity**: High - parser reads wrong number of bytes

### 3. Missing Wire Format Variant
```markdown
Doc: ADD_8 and ADD_16 variants
Enum: Only WireOpCode::ADD_8 defined
```
**Severity**: High - cannot encode larger operand offsets

### 4. Operand Count Mismatch
```markdown
Doc: 3 operands (aOffset, bOffset, dstOffset)
Spec: .num_operands = 2  // WRONG!
```
**Severity**: High - missing operand

### 5. Addressing Mode Byte Position
```markdown
Doc: Addressing modes at bits 8-15 (byte 1)
Parser: Reads addressing mode from byte 2
```
**Severity**: High - wrong indirect/relative flags

## Opcode Categories by Wire Format

### Single Variant (no _8/_16 suffix)
- EMITNOTEHASH, EMITNULLIFIER, JUMP, RETURN, REVERT
- Typically have 16-bit operands by default

### Dual Variants (_8 and _16)
- ADD, SUB, MUL, DIV, AND, OR, XOR, etc.
- _8: 8-bit operand offsets, smaller instruction
- _16: 16-bit operand offsets, larger instruction

### Special Formats
- SET: Has immediate value + tag operand
- CALL/STATICCALL: Complex operand structure

## Wire Format Size Calculation

```
size_in_bytes = 1 (opcode) + 1 (addressing) + sum(operand_sizes)

For ADD_8:  1 + 1 + 3*1 = 5 bytes
For ADD_16: 1 + 1 + 3*2 = 7 bytes (wait, doc says 64 bits = 8 bytes)
```

Check the mermaid diagram bit ranges carefully!

## FALSE POSITIVE FILTERING

### 1. Addressing Mode Always Byte 1
Don't report addressing mode position as wrong if implementation consistently uses byte 1.

### 2. Operand Order vs Position
Operand order in documentation may differ from bit position order. Focus on bit ranges.

### 3. Variant Selection at Runtime
Which variant (_8 vs _16) is used depends on operand values. Both must be correct.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-wire-format` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-wire-format-{opcode}-{issue}`
- **Severity**: High / Medium / Low
- **Opcode**: `{opcode name}`
- **Expected**: `{documented value}`
- **Actual**: `{implementation value}`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-wire-format.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-wire-format",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["ADD_8", "ADD_16"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-wire-format-add16-size",
    "severity": "high",
    "opcode": "ADD_16",
    "expected": "8 bytes (64 bits)",
    "actual": "7 bytes in instruction_spec",
    "file": "src/barretenberg/vm2/common/instruction_spec.cpp",
    "line": 125,
    "description": "Instruction size does not match documentation",
    "fix": "Change size_in_bytes to 8"
  }]
}
```
