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

## ERROR PATH AWARENESS

When analyzing any component, do not limit your analysis to the happy path. For every opcode or gadget you examine, also consider:

1. **Error-path side effects**: When an error fires, are memory address computations still valid? Can `addr - 1` or `addr + size - 1` underflow when size=0 or the operation is skipped?
2. **Spurious error activation**: Can a malicious prover set error selectors to 1 when the actual condition doesn't warrant it? Check that error selectors are tightly constrained.
3. **Constraint behavior during errors**: Do other constraints in the same file fire incorrectly when an error flag is set? Shifted-column constraints (`col' = expr`) gated only by `sel_op` (not by `(1 - error)`) will enforce wrong next-row values during errors.
4. **Tracegen on error paths**: Does the C++ tracegen produce valid traces when errors occur? Watch for silent truncation, underflow, or unset columns on error paths.

If you verify a pattern only on the happy path, note it as "(happy path only — error path not verified)" rather than marking it as fully safe.

## Workflow

### Step 0: Enumerate ALL Opcodes With Edge Cases (MANDATORY)

> **CRITICAL**: This skill covers edge cases for ALL opcodes, not just ALU/arithmetic. You MUST check every opcode group below.

Use this mapping to find the relevant PIL and simulation files:

| Opcode(s) | PIL file(s) | Edge cases to check |
|-----------|-------------|-------------------|
| ADD, SUB, MUL, DIV, FDIV | `alu.pil` | Overflow, underflow, division by zero, field vs integer semantics |
| SHL, SHR | `alu.pil` | Shift >= 128 (C++ uint128_t UB), shift by 0, shift of 0 |
| NOT, EQ, LT, LTE | `alu.pil` | Tag mismatches, field element inputs |
| AND, OR, XOR | `bitwise.pil` | FF-type inputs, tag mismatches |
| CAST | `cast.pil` | Narrowing casts, field-to-integer |
| CALLDATACOPY, RETURNDATACOPY | `data_copy.pil` | size=0, off-by-one bounds, address underflow, src out of range |
| ECADD, MSM | `ecc.pil` | Point at infinity, invalid curve points, predicate completeness |
| POSEIDON2HASH | `poseidon2_hash.pil` | Empty input, single element |
| SHA256COMPRESSION | `sha256.pil` | Edge inputs |
| KECCAKF1600 | `keccakf1600.pil`, `keccak_memory.pil` | Edge inputs |
| TORADIXBE | `to_radix.pil`, `to_radix_mem.pil` | radix=0, radix=1, zero limbs, invalid bit mode |
| EMITUNENCRYPTEDLOG | `opcodes/emit_unencrypted_log.pil` | Zero-length log, memory address underflow |
| EMITNOTEHASH, EMITNULLIFIER | `opcodes/emit_notehash.pil`, `opcodes/emit_nullifier.pil` | Static call context |
| SENDL2TOL1MSG | `opcodes/send_l2_to_l1_msg.pil` | Recipient size validation |
| SLOAD, SSTORE | `opcodes/sload.pil`, `opcodes/sstore.pil` | Storage edge cases |
| GETCONTRACTINSTANCE | `opcodes/get_contract_instance.pil` | Non-existent contracts, member enum bounds |
| INTERNALCALL, INTERNALRETURN | `opcodes/internal_call.pil` | Empty call stack, stack overflow |
| CALL, STATICCALL | `opcodes/external_call.pil` | Nested call edge cases |
| Addressing layer | `execution/addressing.pil` | Relative address overflow, indirect addressing |
| Bytecode decomposition | `bc_decomposition.pil` | Zero extension, truncation |
| Tx-level | `tx.pil` | Gas limit edge cases, padded rows, phase transitions |

**COVERAGE MANDATE**: You MUST produce a coverage table at the end showing every row above and whether you analyzed it. If any opcode group is not analyzed, explain why. Do NOT spend more than 20% of your budget on ALU — it is only 1 of 10+ subsystems.

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
