---
name: vm2-audit-t0-opcode-semantics
description: Audit VM2/AVM opcode semantics for cross-layer consistency. Verifies that the actual computation (modular arithmetic, overflow handling, truncation) matches the documented pseudocode and details across simulation, tracegen, and PIL.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Semantics Audit

Audit for computation mismatches between documented behavior and implementation across simulation and PIL layers.

## When to Use
- Auditing arithmetic correctness for ALU operations
- Checking overflow/underflow handling
- Reviewing modular arithmetic implementation
- Verifying FIELD vs integer semantics
- Investigating incorrect computation results

## Severity Assessment

- **Critical**: Computation produces wrong result → arbitrary state corruption
- **High**: Overflow/underflow handling incorrect → value manipulation
- **Medium**: Edge case differs from documentation
- **Low**: Documentation unclear but implementation reasonable

## Background: AVM Arithmetic

The AVM supports two arithmetic domains:
1. **Integer types** (UINT8/16/32/64/128): Operations modulo 2^k
2. **Field type** (FIELD): Operations modulo p (BN254 prime)

Key behaviors:
- Integer overflow wraps: `255 + 1 = 0` for UINT8
- Field arithmetic: All ops modulo p, no overflow in traditional sense
- Division: Integer division truncates toward zero
- Field division: Multiplicative inverse

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Pseudocode + Details section
yarn-project/simulator/docs/avm/memory.md       # Type system
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/alu.cpp
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/execution.cpp
barretenberg/cpp/src/barretenberg/vm2/common/memory_types.hpp
```

### PIL
```
barretenberg/cpp/pil/vm2/alu.pil
barretenberg/cpp/pil/vm2/bitwise.pil
barretenberg/cpp/pil/vm2/cast.pil
```

## Semantic Patterns by Operation Type

### Addition/Subtraction
```markdown
Doc: M[dst] = M[a] + M[b]
Details: "modulo 2^k for integer types, modulo p for FIELD"
```

**Simulation**: Must handle overflow wrapping
**PIL**: Range checks ensure result fits in type width

### Multiplication
```markdown
Doc: M[dst] = M[a] * M[b]
Details: "result truncated to k bits for integer types"
```

**Simulation**: Full multiplication then modulo 2^k
**PIL**: Decomposition into high/low limbs, range checks

### Division
```markdown
Doc: M[dst] = M[a] / M[b] (integer division for integers)
Doc: M[dst] = M[a] * M[b]^(-1) (field division for FIELD)
```

**Simulation**: Different code paths for int vs field
**PIL**: Different constraints for DIV vs FDIV

### Bitwise Operations
```markdown
Doc: M[dst] = M[a] AND M[b] (bitwise AND)
Details: "only valid for integer types"
```

**Simulation**: Should reject FIELD inputs
**PIL**: Tag check constraints

### Shifts
```markdown
Doc: M[dst] = M[a] << M[b] (left shift)
Details: "shift amount taken modulo k" or "result 0 if shift >= k"
```

Two possible interpretations - verify which is implemented!

### Cast
```markdown
Doc: M[dst] = truncate(M[src], dstType)
Details: "keeps only least significant bits for narrowing"
```

**Simulation**: Masking for narrowing, zero-extension for widening
**PIL**: Decomposition and range checks

## Workflow

### Step 1: Select Target Opcode
```bash
cat yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Extract:
1. Pseudocode (the operation formula)
2. Details section (edge cases, modular behavior)

### Step 2: Analyze Simulation Implementation

Find ALU implementation:
```bash
grep -A 30 "Alu::<operation>" src/barretenberg/vm2/simulation/gadgets/alu.cpp
```

Check:
1. Integer vs field code path separation
2. Overflow handling
3. Division by zero check
4. Shift amount handling

Example checks:
```cpp
// ADD - should handle overflow
MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b) {
    if (a.is_field()) {
        return MemoryValue(a.as<FF>() + b.as<FF>(), ValueTag::FF);
    }
    // Integer: must wrap on overflow
    uint256_t result = a.as_uint() + b.as_uint();
    result %= (uint256_t(1) << a.bit_size());  // Modulo 2^k
    return MemoryValue(result, a.get_tag());
}
```

### Step 3: Analyze PIL Constraints

Find ALU PIL:
```bash
cat pil/vm2/alu.pil
```

Check constraint structure:
1. Decomposition into limbs (for overflow detection)
2. Range checks (ensure result fits)
3. Type-specific paths

Example constraint analysis:
```pil
// ADD constraint
#[ALU_ADD]
sel_op_add * (ia + ib - ic - carry_hi * 2**128 - carry_mid * 2**64 - carry_lo * 2**32) = 0;

// Range checks ensure ic fits in type width
```

### Step 4: Test Edge Cases

For each operation, verify edge cases:

**Addition**:
- Max + 1 wraps to 0
- Max + Max wraps correctly

**Subtraction**:
- 0 - 1 wraps to Max
- Underflow handling

**Multiplication**:
- Max * Max truncated correctly

**Division**:
- Division by zero (should error, not return garbage)
- Integer truncation toward zero

**Shifts**:
- Shift by 0 returns input
- Shift by >= bit_width (implementation-defined)

### Step 5: Cross-Reference Findings

| Operation | Doc Behavior | Sim Behavior | PIL Constraint | Match? |
|-----------|--------------|--------------|----------------|--------|
| ADD overflow | wrap mod 2^k | ??? | ??? | ? |
| DIV by zero | error | ??? | ??? | ? |
| SHL by >= k | ??? | ??? | ??? | ? |

## Common Mismatch Patterns

### 1. Missing Overflow Wrap
```markdown
Doc: "modulo 2^k for integer types"
Sim: return a + b;  // No modulo! Can exceed type range
```
**Severity**: Critical - produces values outside type range

### 2. Wrong Division Type
```markdown
Doc: DIV for integers is truncating division
Sim: Uses field inverse for all types
```
**Severity**: Critical - wrong computation

### 3. Shift Edge Case
```markdown
Doc: "shift by amount >= k yields 0"
Sim: shift by k yields non-zero (wrapping behavior)
```
**Severity**: High - different edge case handling

### 4. PIL Missing Range Check
```markdown
Sim: Correctly wraps on overflow
PIL: No range check, allows arbitrary ic value
```
**Severity**: Critical - malicious prover sets wrong result

### 5. Cast Truncation Direction
```markdown
Doc: "keeps least significant bits"
Sim: Keeps most significant bits
```
**Severity**: Critical - wrong value produced

### 6. Field Arithmetic on Integers
```markdown
Doc: Operation only valid for FIELD type
Sim: Allows integer inputs, computes field inverse
```
**Severity**: High - type confusion

## Operation-Specific Checks

### ADD/SUB
- [ ] Overflow wraps for integers
- [ ] No wrap concept for FIELD
- [ ] PIL has carry/borrow decomposition
- [ ] Range checks for result

### MUL
- [ ] Full product then truncate for integers
- [ ] Standard field multiplication for FIELD
- [ ] PIL decomposes into limbs
- [ ] High limbs checked as zero or used for truncation

### DIV
- [ ] Truncating toward zero for integers
- [ ] Field inverse for FDIV
- [ ] Division by zero throws error
- [ ] PIL has quotient * divisor + remainder = dividend

### FDIV
- [ ] Only valid for FIELD type
- [ ] Division by zero throws error
- [ ] PIL constrains b * result = a (mod p)

### AND/OR/XOR/NOT
- [ ] Only valid for integer types
- [ ] Bitwise operation correct
- [ ] PIL uses bitwise gadget

### SHL/SHR
- [ ] Shift amount handling (mod k or clamp?)
- [ ] Zero-fill vs sign-extend (should be zero-fill)
- [ ] PIL has shift decomposition

### CAST
- [ ] Narrowing truncates LSBs
- [ ] Widening zero-extends
- [ ] Tag updated correctly

## FALSE POSITIVE FILTERING

### 1. Implementation-Defined Edge Cases
Some edge cases (like shift by >= bit_width) may be implementation-defined. If documentation doesn't specify, implementation choice is acceptable.

### 2. Equivalent Formulations
PIL may use different but equivalent mathematical formulations. Verify equivalence before reporting.

### 3. Optimization Differences
Simulation may use optimized paths that produce same results. Focus on output correctness, not code structure.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-semantics` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-semantics-{opcode}-{issue}-{layer}`
- **Severity**: Critical / High / Medium / Low
- **Opcode**: `{opcode name}`
- **Documented Behavior**: `{what doc says}`
- **Actual Behavior**: `{what implementation does}`
- **Layer**: `Simulation / PIL`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-semantics.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-semantics",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["ADD", "DIV", "SHL"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-semantics-add-overflow-sim",
    "severity": "critical",
    "opcode": "ADD",
    "documented_behavior": "modulo 2^k for integer types",
    "actual_behavior": "No modulo wrap, returns full sum",
    "layer": "Simulation",
    "file": "src/barretenberg/vm2/simulation/gadgets/alu.cpp",
    "line": 45,
    "description": "Integer addition does not wrap on overflow",
    "fix": "Add `result %= (1ULL << bit_width)` after addition"
  }]
}
```
