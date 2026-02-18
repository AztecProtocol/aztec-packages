---
name: vm2-audit-t0-opcode-addressing-modes
description: Audit VM2/AVM opcode addressing modes for cross-layer consistency. Verifies that indirect and relative addressing are handled correctly, bitmask positions match documentation, and overflow detection works properly.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Addressing Modes Audit

Audit for addressing mode handling issues across documentation, simulation, and PIL.

## When to Use
- Auditing indirect/relative addressing for opcodes
- Checking addressing mode bitmask positions
- Reviewing address resolution logic
- Investigating address overflow detection
- Verifying new opcode addressing support

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

- **Critical**: Indirect dereference reads wrong address → arbitrary memory access
- **High**: Relative overflow not detected → address wraparound exploit
- **Medium**: Bitmask position mismatch → wrong addressing applied
- **Low**: Documentation unclear but implementation correct

## Background: Addressing Modes

Each memory operand can use two addressing modes:
1. **Direct**: Operand value IS the memory address
2. **Indirect**: Operand value is pointer to memory containing the address
3. **Relative**: Add base pointer to operand value

Combinations:
- Direct: `address = operand`
- Indirect: `address = M[operand]`
- Relative: `address = base_ptr + operand`
- Indirect+Relative: `address = M[base_ptr + operand]`

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Addressing Modes section
yarn-project/simulator/docs/avm/addressing.md   # Addressing explanation
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/simulation/address_resolution.cpp
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/execution.cpp
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/addressing_trace.cpp
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp
```

### PIL
```
barretenberg/cpp/pil/vm2/addressing.pil
barretenberg/cpp/pil/vm2/execution.pil
```

## Addressing Mode Bitmask

Documentation format:
```markdown
8-bit bitmask: 2 bits per memory offset operand (indirect flag + relative flag)

```mermaid
0: "aOffset is indirect"
1: "aOffset is relative"
2: "bOffset is indirect"
3: "bOffset is relative"
4: "dstOffset is indirect"
5: "dstOffset is relative"
6: "Unused"
7: "Unused"
```
```

Bit assignment:
- Bit 2*i: Operand i is indirect
- Bit 2*i+1: Operand i is relative

## Workflow

### Step 1: Select Target Opcode
```bash
cat yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Extract from Addressing Modes section:
1. Bitmask layout
2. Which operands support indirect
3. Which operands support relative

### Step 2: Verify Bitmask Parsing
```bash
grep -n "addressing_mode\|indirect\|relative" src/barretenberg/vm2/simulation/address_resolution.cpp
```

Check bitmask extraction:
```cpp
bool is_indirect(uint8_t mode, size_t operand_idx) {
    return (mode >> (2 * operand_idx)) & 1;
}

bool is_relative(uint8_t mode, size_t operand_idx) {
    return (mode >> (2 * operand_idx + 1)) & 1;
}
```

### Step 3: Verify Address Resolution Logic
```bash
grep -A 20 "resolve_address" src/barretenberg/vm2/simulation/address_resolution.cpp
```

Check resolution order:
```cpp
Address resolve(uint32_t operand, bool indirect, bool relative, Address base_ptr) {
    Address addr = operand;

    // Apply relative FIRST
    if (relative) {
        addr = base_ptr + operand;
        // Check overflow!
    }

    // Apply indirect SECOND
    if (indirect) {
        addr = memory.get(addr).as<Address>();
    }

    return addr;
}
```

### Step 4: Verify Overflow Detection
```bash
grep -n "overflow\|out_of_range\|AddressResolutionException" src/barretenberg/vm2/simulation/
```

Check that relative addition overflow is detected:
```cpp
if (base_ptr + operand > MAX_ADDRESS) {
    throw AddressResolutionException("Relative address overflow");
}
```

### Step 5: Verify Tracegen
```bash
grep -n "indirect\|relative\|sel_addressing" src/barretenberg/vm2/tracegen/addressing_trace.cpp
```

Check columns:
- `indirect_*`: Indirect flag per operand
- `relative_*`: Relative flag per operand
- `sel_addressing_error`: Set on resolution failure
- `base_addr_*`: Base address before resolution
- `resolved_addr_*`: Final address after resolution

### Step 6: Verify PIL Constraints
```bash
cat pil/vm2/addressing.pil
```

Check:
- Indirect resolution constrained via memory lookup
- Relative addition constrained with overflow check
- Error selector set on overflow

### Step 7: Cross-Reference Findings

| Opcode | Op0 Indirect | Op0 Relative | Bit Position | Match? |
|--------|--------------|--------------|--------------|--------|
| ADD | Bit 0 | Bit 1 | Correct | Y |

## Common Mismatch Patterns

### 1. Wrong Bit Position
```markdown
Doc: aOffset indirect at bit 0, relative at bit 1
Impl: Reads indirect from bit 1, relative from bit 0
```
**Severity**: High - indirect/relative swapped

### 2. Missing Indirect Support
```markdown
Doc: Shows indirect flag for operand
Impl: Operand always treated as direct
```
**Severity**: High - indirect addressing doesn't work

### 3. Relative Overflow Not Detected
```cpp
// Missing overflow check
Address addr = base_ptr + operand;  // Can overflow!
```
**Severity**: High - address wraparound exploit

### 4. Wrong Resolution Order
```cpp
// WRONG: Indirect before relative
addr = memory.get(operand);
addr = base_ptr + addr;

// CORRECT: Relative before indirect
addr = base_ptr + operand;
addr = memory.get(addr);
```
**Severity**: Critical - wrong address computed

### 5. Indirect on Immediate Operand
```markdown
Doc: Operand is "Immediate value"
Impl: Still checks indirect flag
```
**Severity**: Medium - immediate shouldn't be indirectable

### 6. Missing PIL Overflow Constraint
```pil
// Missing range check on relative addition
addr = base_ptr + operand;  // No overflow check!
```
**Severity**: High - malicious prover exploits overflow

## Addressing Gas Costs

Each indirect/relative flag costs 3 L2 gas:
```
Addressing gas = 3 * (num_indirect + num_relative)
```

Verify gas computation includes addressing overhead.

## FALSE POSITIVE FILTERING

### 1. Output Operands May Not Support Relative
Some implementations don't support relative for output operands. Check if this matches documentation.

### 2. Immediate Values Have No Addressing
Immediate values embedded in instruction don't use addressing modes. Their bits in the bitmask should be marked "Unused".

### 3. Single-Operand Opcodes
Opcodes with one operand only use bits 0-1. Bits 2-7 are unused.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-addressing-modes` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-addressing-modes-{opcode}-{issue}`
- **Severity**: Critical / High / Medium / Low
- **Opcode**: `{opcode name}`
- **Operand**: `{operand name}`
- **Expected**: `{documented behavior}`
- **Actual**: `{implementation behavior}`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-addressing-modes.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-addressing-modes",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["ADD", "MOV", "SLOAD"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-addressing-modes-add-bitmask",
    "severity": "high",
    "opcode": "ADD",
    "operand": "aOffset",
    "expected": "Indirect at bit 0, relative at bit 1",
    "actual": "Bits swapped in implementation",
    "file": "src/barretenberg/vm2/simulation/address_resolution.cpp",
    "line": 45,
    "description": "Indirect and relative bits read in wrong order",
    "fix": "Swap bit extraction: indirect = bit 2*i, relative = bit 2*i+1"
  }]
}
```
