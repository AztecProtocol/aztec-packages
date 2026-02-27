---
name: vm2-audit-t0-opcode-tag-checks
description: Audit VM2/AVM opcode tag checks for cross-layer consistency. Verifies that documented type tag requirements (T[a] == T[b], T[x] == FIELD, etc.) are properly enforced in simulation instruction specs, recorded in tracegen expected_tag columns, and constrained in PIL.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Tag Checks Audit

Audit for missing or inconsistent input operand type tag validation across documentation, simulation, tracegen, and PIL layers.

## When to Use
- Auditing tag validation for specific opcodes
- Checking for type confusion vulnerabilities
- Reviewing new opcodes for proper tag enforcement
- Investigating unexpected tag mismatch errors

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

- **Critical**: Missing tag check allows type confusion (field vs integer mixing)
- **High**: Tag check exists but enforces wrong tag
- **Medium**: Tracegen/PIL tag check without documentation
- **Low**: Documentation unclear, implementation correct

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

## Background: Tag System

The AVM uses type tags to distinguish value types:
- `UINT8` (1), `UINT16` (2), `UINT32` (3), `UINT64` (4), `UINT128` (5)
- `FIELD` (6) - BN254 field element

Tag checks ensure operands have correct types before operations.

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Tag Checks section
yarn-project/simulator/docs/avm/memory.md       # Tag system overview
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/common/instruction_spec.cpp   # RegisterInfo
barretenberg/cpp/src/barretenberg/vm2/common/instruction_spec.hpp   # RegisterInfo class
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/execution.cpp  # set_and_validate_inputs
barretenberg/cpp/src/barretenberg/vm2/common/memory_types.hpp       # ValueTag enum
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp  # process_execution_spec, process_registers
```

### PIL
```
barretenberg/cpp/pil/vm2/execution/registers.pil   # BATCHED_TAGS_DIFF_REG
barretenberg/cpp/pil/vm2/alu.pil                   # sel_ab_tag_mismatch
```

## Tag Check Types

### 1. Matching Tags (T[a] == T[b])
Most ALU operations require both inputs to have the same tag.

**Doc**: `T[aOffset] == T[bOffset]`
**Simulation**: Both `add_input()` without explicit tag, tag comparison in ALU
**Tracegen**: `sel_tag_check_reg` set, `expected_tag_reg` matches `mem_tag_reg`
**PIL**: `BATCHED_TAGS_DIFF_REG` zero-check, `alu.sel_ab_tag_mismatch`

### 2. Specific Tag (T[x] == FIELD)
Some operations require specific tag types.

**Doc**: `T[noteHashOffset] == FIELD`
**Simulation**: `RegisterInfo().add_input(ValueTag::FF)`
**Tracegen**: `expected_tag_reg[i] = MEM_TAG_FF`
**PIL**: Tag check via batched difference

### 3. Integral Tag (T[x] is integral)
Some operations require non-FIELD integer types.

**Doc**: `T[shiftAmount] is integral`
**Simulation**: Tag check for != ValueTag::FF
**Tracegen**: `expected_tag_reg` range check
**PIL**: Tag constraint excluding FF

## ERROR PATH AWARENESS

When analyzing any component, do not limit your analysis to the happy path. For every opcode or gadget you examine, also consider:

1. **Error-path side effects**: When an error fires, are memory address computations still valid? Can `addr - 1` or `addr + size - 1` underflow when size=0 or the operation is skipped?
2. **Spurious error activation**: Can a malicious prover set error selectors to 1 when the actual condition doesn't warrant it? Check that error selectors are tightly constrained.
3. **Constraint behavior during errors**: Do other constraints in the same file fire incorrectly when an error flag is set? Shifted-column constraints (`col' = expr`) gated only by `sel_op` (not by `(1 - error)`) will enforce wrong next-row values during errors.
4. **Tracegen on error paths**: Does the C++ tracegen produce valid traces when errors occur? Watch for silent truncation, underflow, or unset columns on error paths.

If you verify a pattern only on the happy path, note it as "(happy path only — error path not verified)" rather than marking it as fully safe.

## Workflow

### Step 0: Enumerate ALL Opcodes With Tag Checks (MANDATORY)

> **CRITICAL**: Before analyzing any individual opcode, identify ALL opcodes that have tag requirements.

```bash
# Find all documented opcodes with Tag Checks sections
for f in yarn-project/simulator/docs/avm/opcodes/*.md; do
  if grep -q "Tag Checks\|Tag Check" "$f"; then echo "$f"; fi
done

# Find all opcodes with expected tags in instruction spec
grep -n "add_input(ValueTag\|add_input()" src/barretenberg/vm2/common/instruction_spec.cpp | head -40

# Find all tag-related PIL constraints
grep -n "expected_tag\|sel_tag_check\|tag_mismatch" pil/vm2/execution/registers.pil pil/vm2/alu.pil
```

Build a master checklist:

| Opcode | Doc tag requirement | Sim tag check? | PIL checked? | Finding? |
|--------|-------------------|---------------|-------------|----------|

**You MUST check every opcode with tag requirements.** Breadth across all opcodes is more important than depth on any single one.

### Step 1: Select Target Opcode(s)
```bash
# List opcodes with tag checks
grep -l "## Tag Checks" yarn-project/simulator/docs/avm/opcodes/*.md

# View specific opcode
cat yarn-project/simulator/docs/avm/opcodes/add.md
```

### Step 2: Extract Documented Tag Checks
```bash
grep -A 5 "## Tag Checks" yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Parse the requirements:
- `T[aOffset] == T[bOffset]` → Matching tags
- `T[noteHashOffset] == FIELD` → Must be FIELD
- `T[shiftAmount] is integral` → Must NOT be FIELD

### Step 3: Verify Simulation Layer

Find the instruction spec:
```bash
grep -A 20 "ExecutionOpCode::<OPCODE>," src/barretenberg/vm2/common/instruction_spec.cpp | head -30
```

Check `RegisterInfo`:
```cpp
// Matching tags - both inputs without explicit tag
.register_info = RegisterInfo().add_input().add_input().add_output(),

// Specific tag - explicit ValueTag
.register_info = RegisterInfo().add_input(ValueTag::FF).add_output(),
```

Find tag validation:
```bash
grep -n "set_and_validate_inputs.*<OPCODE>" src/barretenberg/vm2/simulation/gadgets/execution.cpp
```

### Step 4: Verify Tracegen Layer

Check execution spec processing:
```bash
grep -n "expected_tag\|sel_tag_check" src/barretenberg/vm2/tracegen/execution_trace.cpp
```

Verify:
1. `expected_tag_reg_*` populated from spec
2. `sel_tag_check_reg_*` set when check needed
3. `mem_tag_reg_*` captures actual tag

### Step 5: Verify PIL Layer

Check register tag constraints:
```bash
cat pil/vm2/execution/registers.pil
```

Key constraints:
```pil
// Batched tag difference (zero if all match)
pol BATCHED_TAGS_DIFF_REG = sel_tag_check_reg[0] * 2**0 * (mem_tag_reg[0] - expected_tag_reg[0])
                          + sel_tag_check_reg[1] * 2**3 * (mem_tag_reg[1] - expected_tag_reg[1])
                          ...
```

For ALU, also check `alu.pil`:
```bash
grep -n "sel_ab_tag_mismatch\|sel_tag_err" pil/vm2/alu.pil
```

### Step 6: Cross-Reference Findings

Create comparison table:

| Opcode | Doc Tag Check | Simulation | Tracegen | PIL | Presence? | Correctness verified? |
|--------|---------------|------------|----------|-----|-----------|----------------------|
| ADD | T[a] == T[b] | add_input() x2 | sel_tag_check[0,1] | alu.sel_ab_tag_mismatch | Y | Y (quote constraint) |
| EMITNOTEHASH | T[x] == FIELD | add_input(FF) | expected_tag=FF | batched check | Y | ? |
| SHL | T[shift] integral | ??? | ??? | ??? | ? | ? |

### Verification Depth Requirement

A "Y" in the Presence column requires quoting the file:line of the constraint. A "Y" in the Correctness column requires that you have READ the constraint body and verified the logic is correct. If you can only confirm presence without reading the constraint body, mark Correctness as **"Unverified"** and flag for deeper analysis.

Specifically for subtrace-level tag checks (bitwise, poseidon2, sha256, keccak, ecc):
- Do NOT mark these as correct based on knowing a constraint exists
- READ the actual dispatch/selector constraints and verify:
  - Tag values are correctly connected to dispatch selectors
  - Error flag logic (`sel_tag_ff_err`, `sel_tag_mismatch_err`) is correct
  - Error paths in tracegen produce valid traces (check the C++ `*_trace.cpp` file)

Also check `execution/addressing.pil` for `BATCHED_TAGS_DIFF` — this is a separate tag check layer from `registers.pil` that validates resolved operand tags for indirect addressing. It must be verified independently.

## Common Mismatch Patterns

### 1. Missing Specific Tag in Simulation
```markdown
Doc: T[noteHashOffset] == FIELD
Sim: RegisterInfo().add_input()  // No tag specified!
```
**Severity**: Critical - allows non-FIELD values

### 2. Wrong Expected Tag
```markdown
Doc: T[amount] == UINT32
Sim: add_input(ValueTag::UINT64)  // Wrong tag!
```
**Severity**: High - enforces wrong type

### 3. Missing Matching Check
```markdown
Doc: T[aOffset] == T[bOffset]
Sim: add_input(FF).add_input(FF)  // Both FF, but allows mixed!
```
**Severity**: High - if doc says matching, should allow any matching type

### 4. PIL Tag Check Missing
```markdown
Doc: T[x] == FIELD
Sim: Correctly validates
PIL: No constraint on expected_tag
```
**Severity**: High - malicious prover can bypass

### 5. Tracegen Not Setting sel_tag_check
```markdown
Doc: Has tag check
Sim: Has tag check
Tracegen: sel_tag_check_reg[i] not set
```
**Severity**: High - trace won't validate

## FALSE POSITIVE FILTERING

### 1. Implicit Matching via ALU Constraints
ALU operations with matching tags are constrained via `alu.sel_ab_tag_mismatch`. Don't report missing constraints if ALU handles it.

### 2. Tag Inherited from Input
Some operations inherit tag without explicit check. Verify doc actually requires check.

### 3. No Tag Checks Section in Doc
If documentation has no "Tag Checks" section, the opcode may not require tag validation. Verify this is intentional.

### 4. Cast Operations
CAST intentionally changes tags - don't report tag "mismatches" for CAST.

## Opcodes with Tag Checks (Reference)

### Matching Tags (T[a] == T[b])
- ADD, SUB, MUL, DIV, EQ, LT, LTE, AND, OR, XOR

### Specific FIELD Tag
- EMITNOTEHASH, EMITNULLIFIER, SSTORE, SLOAD (some operands)
- POSEIDON2, SHA256, KECCAKF1600 (inputs/outputs)

### Integral Tags (not FIELD)
- SHL, SHR (shift amount)
- DIV (divisor in some variants)

### No Tag Checks
- MOV, SET, JUMP, JUMPI, CALL, RETURN

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-tag-checks` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-tag-checks-{opcode}-{operand}-{layer}`
- **Severity**: Critical / High / Medium / Low
- **Opcode**: `{opcode name}`
- **Operand**: `{operand name}`
- **Expected**: `{documented tag requirement}`
- **Actual**: `{what implementation does}`
- **Layer**: `Simulation / Tracegen / PIL`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-tag-checks.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-tag-checks",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["ADD", "SUB", "EMITNOTEHASH"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-tag-checks-emitnotehash-notehash-sim",
    "severity": "critical",
    "opcode": "EMITNOTEHASH",
    "operand": "noteHashOffset",
    "expected": "T[noteHashOffset] == FIELD",
    "actual": "RegisterInfo().add_input() without tag",
    "layer": "Simulation",
    "file": "src/barretenberg/vm2/common/instruction_spec.cpp",
    "line": 657,
    "description": "Missing FIELD tag requirement in instruction spec",
    "fix": "Change to RegisterInfo().add_input(ValueTag::FF)"
  }]
}
```
