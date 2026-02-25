---
name: vm2-audit-t0-opcode-edge-cases
description: Audit VM2/AVM opcode edge cases for cross-layer consistency. Verifies that documented edge cases (overflow wrapping, division by zero, shift amounts exceeding bit-width, truncation behavior) are handled correctly in simulation and constrained in PIL.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Edge Cases Audit

Audit for edge case handling issues across documentation, simulation, and PIL.

## When to Use
- Auditing boundary condition handling
- Checking overflow/underflow behavior
- Reviewing division by zero handling
- Verifying shift amount edge cases
- Checking truncation/cast behavior

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

- **Critical**: Edge case produces wrong result → computation corruption
- **High**: Edge case not detected → missing error
- **Medium**: Edge case differs from documentation
- **Low**: Documentation doesn't specify, implementation reasonable

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report bugs.

**RULE 1 — Report first, dismiss later.** Every discrepancy between spec/docs and implementation is a PRELIMINARY FINDING. Report ALL of them first, then only remove in a final filtering pass using the strict criteria below.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss a finding if:
  - (a) **Spec explicitly documents the behavior**: The spec/docs explicitly state this behavior is intentional (quote the exact spec text).
  - (b) **Equivalent by algebraic identity**: The PIL and tracegen compute the same value via different but provably equivalent formulas (show the algebraic equivalence concretely).
  - (c) **Dead code**: The code path is provably unreachable because a prior constraint makes the condition impossible (quote the blocking constraint with file:line).
  You MUST NOT construct novel "it's probably fine because..." arguments.

**RULE 3 — Quote or report.** For ANY dismissal, quote the EXACT evidence (spec text, constraint file:line, or algebraic proof). If you cannot quote specific evidence, REPORT.

**RULE 4 — Severity floor.** When in doubt, report as **High**. Only downgrade with quoted evidence proving limited impact.

## Background: Edge Cases in AVM

The AVM has several edge case categories:

1. **Arithmetic Overflow/Underflow**: What happens at type boundaries
2. **Division by Zero**: Must error, never produce result
3. **Shift Amounts**: Behavior when shift >= bit_width
4. **Truncation**: How values are narrowed during CAST
5. **Field Boundaries**: Behavior near field prime p

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Details section
yarn-project/simulator/docs/avm/memory.md       # Type system
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/alu.cpp
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/execution.cpp
```

### PIL
```
barretenberg/cpp/pil/vm2/alu.pil
barretenberg/cpp/pil/vm2/cast.pil
barretenberg/cpp/pil/vm2/bitwise.pil
```

## Edge Case Categories

### 1. Arithmetic Overflow/Underflow

**Documentation** (typical):
```markdown
For integer types (UINT8, ..., UINT128), the operation is performed modulo 2^k.
```

**Test cases**:
- `UINT8: 255 + 1 = 0` (overflow wraps)
- `UINT8: 0 - 1 = 255` (underflow wraps)
- `UINT64: MAX + MAX` (wraps correctly)

### 2. Division by Zero

**Documentation**:
```markdown
## Error Conditions
- **DIVISION_BY_ZERO**: Divisor is zero
```

**Test cases**:
- `x / 0` must error, not return garbage
- `x / 0` for FIELD (FDIV) must error

### 3. Shift Edge Cases

**Documentation** (varies):
```markdown
Shift amount taken modulo k where k is bit-width
```
OR
```markdown
Result is 0 if shift amount >= bit-width
```

**Test cases**:
- `SHL(x, 0) = x`
- `SHL(UINT8, 8) = 0` or `SHL(UINT8, 8) = SHL(UINT8, 0)`?
- `SHL(UINT8, 255) = ?`

### 4. Truncation (CAST)

**Documentation**:
```markdown
Truncated by keeping only the least significant bits
```

**Test cases**:
- `CAST(0x1234, UINT8) = 0x34` (keeps LSB)
- `CAST(FIELD_MAX, UINT128) = ?` (field > uint128)

### 5. NOT Edge Case

**Documentation**:
```markdown
Bitwise NOT of the operand
```

**Test cases**:
- `NOT(0) = MAX` for each type
- `NOT(MAX) = 0`
- `NOT(FIELD) = ?` (should error - NOT only for integers)

### 6. Comparison Edge Cases

**Test cases**:
- `EQ(0, 0) = 1`
- `LT(0, MAX) = 1`
- `LT(MAX, MAX) = 0`
- `LTE(MAX, MAX) = 1`

## Workflow

### Step 0: Enumerate ALL Opcodes With Edge Cases (MANDATORY)

> **CRITICAL**: Before deep-diving any single opcode, enumerate ALL opcodes and identify which have edge case risks.

```bash
ls yarn-project/simulator/docs/avm/opcodes/
grep -rn "sel_op_\|sel_execute_" pil/vm2/alu.pil pil/vm2/execution.pil | head -40
```

Build a master checklist:

| Opcode | Edge case categories | Checked? | Finding? |
|--------|---------------------|----------|----------|

Priority order: arithmetic (ADD, SUB, MUL, DIV, SHL, SHR), bitwise (AND, OR, XOR, NOT), cast/truncation (CAST, SET), comparisons (EQ, LT, LTE), then memory/control flow opcodes.

### Step 1: Identify Edge Cases from Documentation
```bash
cat yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Look for phrases in Details section:
- "modulo 2^k"
- "modulo p"
- "truncated"
- "if ... is zero"
- "exceeds"

### Step 2: Check Simulation Implementation
```bash
grep -A 30 "Alu::<operation>" src/barretenberg/vm2/simulation/gadgets/alu.cpp
```

Verify edge case handling:
```cpp
// Division by zero
if (b.is_zero()) {
    throw DivisionByZeroException();
}

// Overflow wrapping
uint256_t result = a + b;
result %= (uint256_t(1) << bit_width);  // Modulo 2^k
```

### Step 3: Check PIL Constraints
```bash
grep -n "<operation>\|overflow\|zero" pil/vm2/alu.pil
```

Verify:
- Division by zero check: `sel_div_0_err` or inverse exists
- Overflow handling: Range checks, carry bits

### Step 4: Test Edge Cases (Mental or Actual)

For each edge case:
1. What should happen (from docs)?
2. What does simulation do?
3. What does PIL constrain?

### Step 5: Cross-Reference Findings

| Edge Case | Documentation | Simulation | PIL | Match? |
|-----------|---------------|------------|-----|--------|
| UINT8 255+1 | Wraps to 0 | ??? | ??? | ? |
| DIV by 0 | Error | ??? | ??? | ? |
| SHL by 8 on UINT8 | ??? | ??? | ??? | ? |

## Common Mismatch Patterns

### 1. No Overflow Wrap
```markdown
Doc: "modulo 2^k for integer types"
Sim: return a + b;  // No modulo, can exceed type range
```
**Severity**: Critical - produces invalid values

### 2. Division by Zero Returns Value
```cpp
// Missing zero check
return a / b;  // Undefined behavior on b=0
```
**Severity**: Critical - should error

### 3. Wrong Shift Behavior
```markdown
Doc: "shift amount modulo k"
Sim: if (shift >= bit_width) return 0;  // Different!
```
**Severity**: High - different edge case behavior

### 4. Truncation Keeps MSB
```cpp
// WRONG: Keeps most significant bits
result = value >> (source_bits - dest_bits);

// CORRECT: Keeps least significant bits
result = value & ((1 << dest_bits) - 1);
```
**Severity**: Critical - wrong truncation

### 5. NOT on FIELD Allowed
```cpp
// Missing tag check
return ~a.as_uint();  // Works on FIELD, should error
```
**Severity**: High - NOT undefined for FIELD

### 6. PIL Missing Zero Check
```pil
// Division constraint
sel_op_div * (ib * ic - ia) = 0;
// But missing: what if ib = 0?
```
**Severity**: Critical - malicious prover divides by zero

## Edge Cases by Opcode

### ADD/SUB
- Overflow/underflow wraps for integers
- No wrap for FIELD (always < p)

### MUL
- Overflow truncates to type width
- Full precision for FIELD

### DIV
- Division by zero must error
- Integer division truncates toward zero

### FDIV
- Division by zero must error
- Result is multiplicative inverse

### SHL/SHR
- Shift by 0 returns input unchanged
- Shift by >= bit_width: implementation-defined (check doc!)
- Only valid for integer types

### CAST
- Narrowing truncates LSBs
- Widening zero-extends
- FIELD to int: may need special handling (FIELD can exceed UINT128)

### NOT
- Only valid for integer types
- `NOT(x) = MAX - x` where MAX = 2^k - 1

### EQ/LT/LTE
- Always return UINT1 (0 or 1)
- Works on any matching type

## FALSE POSITIVE FILTERING

### 1. Implementation-Defined Edge Cases
If documentation doesn't specify (e.g., SHL by >= width), implementation choice is acceptable. Note as "documentation gap", not bug.

### 2. Equivalent Formulations
`MAX - x` and bitwise NOT may be equivalent. Don't report if result is same.

### 3. Range Checks Implicit
PIL may handle overflow via range checks on result rather than explicit modulo. Both are valid.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-edge-cases` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-edge-cases-{opcode}-{edge-case}`
- **Severity**: Critical / High / Medium / Low
- **Opcode**: `{opcode name}`
- **Edge Case**: `{description of edge case}`
- **Expected**: `{documented behavior}`
- **Actual**: `{implementation behavior}`
- **Layer**: `Simulation / PIL`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-edge-cases.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-edge-cases",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["ADD", "DIV", "SHL", "CAST"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-edge-cases-div-zero-sim",
    "severity": "critical",
    "opcode": "DIV",
    "edge_case": "Division by zero",
    "expected": "Throws DIVISION_BY_ZERO error",
    "actual": "No zero check, undefined behavior",
    "layer": "Simulation",
    "file": "src/barretenberg/vm2/simulation/gadgets/alu.cpp",
    "line": 123,
    "description": "Missing divisor zero check before division",
    "fix": "Add: if (b.is_zero()) throw DivisionByZeroException();"
  }]
}
```
