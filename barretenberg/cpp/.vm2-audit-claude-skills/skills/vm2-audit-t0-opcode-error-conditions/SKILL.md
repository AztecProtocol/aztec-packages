---
name: vm2-audit-t0-opcode-error-conditions
description: Audit VM2/AVM opcode error conditions for cross-layer consistency. Verifies that documented error conditions (TAG_MISMATCH, DIVISION_BY_ZERO, STATIC_CALL_VIOLATION, etc.) are properly detected in simulation, recorded in tracegen, and constrained in PIL.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Error Conditions Audit

Audit for missing or inconsistent error condition handling across documentation, simulation, tracegen, and PIL layers.

## When to Use
- Auditing a specific opcode's error handling
- Reviewing error condition completeness across layers
- Investigating verification failures related to error states
- Checking new opcodes for proper error handling

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

- **Critical**: Documented error not checked → allows invalid operations to succeed
- **High**: Error checked but wrong selector/exception type → incorrect error propagation
- **Medium**: Error in PIL but not documented → implementation drift
- **Low**: Documentation unclear but implementation correct

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

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Error Conditions section
yarn-project/simulator/docs/avm/errors.md       # Error type reference
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/execution.cpp
barretenberg/cpp/src/barretenberg/vm2/simulation/interfaces/alu.hpp
barretenberg/cpp/src/barretenberg/vm2/common/exceptions.hpp
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp
```

### PIL
```
barretenberg/cpp/pil/vm2/execution.pil           # INFALLIBLE_OPCODES_SUCCESS
barretenberg/cpp/pil/vm2/alu.pil                 # sel_div_0_err, sel_tag_err
barretenberg/cpp/pil/vm2/opcodes/*.pil           # Opcode-specific errors
```

## Error Types Mapping

| Documentation Error | Simulation Exception | Tracegen Selector | PIL Handling |
|---------------------|---------------------|-------------------|--------------|
| TAG_MISMATCH | RegisterValidationException | sel_register_read_error | registers.pil batched tag check |
| INVALID_TAG | RegisterValidationException | sel_register_read_error | registers.pil expected_tag |
| DIVISION_BY_ZERO | AluException → OpcodeExecutionException | sel_opcode_error | alu.pil sel_div_0_err |
| OUT_OF_GAS | OutOfGasException | sel_out_of_gas | gas.pil gas constraints |
| STATIC_CALL_VIOLATION | OpcodeExecutionException | sel_opcode_error | opcode-specific PILs |
| SIDE_EFFECT_LIMIT_REACHED | OpcodeExecutionException | sel_opcode_error | opcode-specific PILs |
| MEMORY_ACCESS_OUT_OF_RANGE | AddressResolutionException | sel_addressing_error | addressing.pil |
| NULLIFIER_COLLISION | NullifierCollisionException → OpcodeExec | sel_opcode_error | emit_nullifier.pil |

## Temporality Groups

Errors must be checked at the correct phase:
1. **Bytecode Retrieval** → `sel_bytecode_retrieval_failure`
2. **Instruction Fetching** → `sel_instruction_fetching_failure`
3. **Addressing** → `sel_addressing_error` (MEMORY_ACCESS_OUT_OF_RANGE)
4. **Register Read** → `sel_register_read_error` (TAG_MISMATCH, INVALID_TAG)
5. **Gas** → `sel_out_of_gas` (OUT_OF_GAS)
6. **Opcode Execution** → `sel_opcode_error` (DIVISION_BY_ZERO, STATIC_CALL_VIOLATION, etc.)

## ERROR PATH AWARENESS

When analyzing any component, do not limit your analysis to the happy path. For every opcode or gadget you examine, also consider:

1. **Error-path side effects**: When an error fires, are memory address computations still valid? Can `addr - 1` or `addr + size - 1` underflow when size=0 or the operation is skipped?
2. **Spurious error activation**: Can a malicious prover set error selectors to 1 when the actual condition doesn't warrant it? Check that error selectors are tightly constrained.
3. **Constraint behavior during errors**: Do other constraints in the same file fire incorrectly when an error flag is set? Shifted-column constraints (`col' = expr`) gated only by `sel_op` (not by `(1 - error)`) will enforce wrong next-row values during errors.
4. **Tracegen on error paths**: Does the C++ tracegen produce valid traces when errors occur? Watch for silent truncation, underflow, or unset columns on error paths.

If you verify a pattern only on the happy path, note it as "(happy path only — error path not verified)" rather than marking it as fully safe.

## Workflow

### Step 0: Enumerate ALL Fallible Opcodes (MANDATORY)

> **CRITICAL**: Before analyzing any individual opcode, identify ALL opcodes that can produce errors.

```bash
# List all documented opcodes with error conditions
for f in yarn-project/simulator/docs/avm/opcodes/*.md; do
  if grep -q "Error Conditions" "$f"; then echo "$f"; fi
done

# List all opcode-specific PIL files (these handle fallible opcodes)
ls pil/vm2/opcodes/*.pil

# Find infallible opcodes for exclusion
grep "INFALLIBLE_OPCODES_SUCCESS" pil/vm2/execution.pil
```

Build a master checklist:

| Opcode | Documented errors | Sim checked? | PIL checked? | Finding? |
|--------|------------------|-------------|-------------|----------|

**You MUST check every fallible opcode**, not just the first few. Breadth across all opcodes is more important than depth on any single one.

### Step 1: Select Target Opcode(s)
```bash
# List all opcodes
ls yarn-project/simulator/docs/avm/opcodes/

# Or focus on a category (e.g., side effects)
cat yarn-project/simulator/docs/avm/opcodes/emitnotehash.md
cat yarn-project/simulator/docs/avm/opcodes/emitnullifier.md
```

### Step 2: Extract Documented Error Conditions
```bash
# Find Error Conditions section
grep -A 10 "## Error Conditions" yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Expected format:
```markdown
## Error Conditions
- **TAG_MISMATCH**: Operands have different type tags
- **STATIC_CALL_VIOLATION**: Attempted state modification in static call context
```

### Step 3: Verify Simulation Layer

Find the opcode handler:
```bash
grep -n "void Execution::<opcode_name>" src/barretenberg/vm2/simulation/gadgets/execution.cpp
```

Check for each documented error:
1. **Tag errors**: Should throw before `get_gas_tracker().consume_gas()`
2. **Execution errors**: Should throw after gas consumption
3. **Exception type**: Must match error category

Example patterns:
```cpp
// TAG check (Group 3)
set_and_validate_inputs(ExecutionOpCode::EMITNOTEHASH, { note_hash });

// STATIC_CALL check (Group 5)
if (context.get_is_static()) {
    throw OpcodeExecutionException("...: Static call cannot update state");
}

// LIMIT check (Group 5)
if (counter == MAX_VALUE) {
    throw OpcodeExecutionException("...: Maximum reached");
}
```

### Step 4: Verify Tracegen Layer

Find trace handling:
```bash
grep -n "ExecutionOpCode::<OPCODE>" src/barretenberg/vm2/tracegen/execution_trace.cpp
```

Check:
1. Error selectors set correctly for each error path
2. Error exclusivity maintained
3. Discard flag set for failing contexts

### Step 5: Verify PIL Layer

Check if opcode is infallible or fallible:
```bash
grep -n "INFALLIBLE_OPCODES_SUCCESS" pil/vm2/execution.pil
```

For fallible opcodes, find dedicated PIL:
```bash
ls pil/vm2/opcodes/
grep -l "<opcode>" pil/vm2/opcodes/*.pil
```

Verify:
1. `sel_opcode_error` gating for side effects
2. Error conditions constrained
3. State rollback on error

### Step 6: Cross-Reference Findings

For each documented error condition:

| Error | Doc | Sim | Tracegen | PIL | Match? |
|-------|-----|-----|----------|-----|--------|
| TAG_MISMATCH | Y | ? | ? | ? | ? |
| STATIC_CALL_VIOLATION | Y | ? | ? | ? | ? |

### Step 7: Error Path Trace-Through (MANDATORY)

For each fallible opcode (not just checking that error conditions exist):

1. **Trace the error path**: When this error fires, what happens to all other constraints in the file? Are memory address computations still valid? Does `addr + size - 1` underflow when size could be 0?
2. **Check for missing error conditions**: Are there semantic constraints on operand values that SHOULD be error conditions but are NOT documented? Examples:
   - Address-type fields should be range-constrained (e.g., Ethereum addresses to 160 bits)
   - Enum fields should be range-constrained to valid values
   - Size fields should handle zero correctly
3. **Check spurious activation**: Can a malicious prover set the error selector to 1 when the genuine condition does not warrant it? The constraint `sel_error * (condition) = 0` only prevents `sel_error=1 AND condition≠0` — it does NOT prevent `sel_error=1 AND condition=0` if `sel_error` is a free committed column.
4. **Check cascading effects**: When a prior error stage fires (e.g., bytecode retrieval), are later error selectors constrained to 0? Or can a malicious prover set `sel_opcode_error=1` even when `sel_bytecode_retrieval_failure=1` already fired?

**DEPTH MANDATE**: For each opcode you check, you MUST read the full PIL file and trace through at least one error path. If this limits you to 10 opcodes instead of 47, that is acceptable — depth over breadth. A superficial "OK" mark that only confirms the error selector exists is NOT acceptable.

## Common Mismatch Patterns

### 1. Missing Error Check in Simulation
```markdown
Doc: **DIVISION_BY_ZERO**: Divisor is zero
Sim: No zero check before division
```
**Severity**: Critical

### 2. Wrong Exception Type
```markdown
Doc: **TAG_MISMATCH** (should be RegisterValidationException)
Sim: throws OpcodeExecutionException
```
**Severity**: High (wrong temporality group)

### 3. Infallible Marking for Fallible Opcode
```pil
// PIL marks as infallible
sel_execute_sstore * sel_opcode_error = 0;  // WRONG!
// But SSTORE can fail with STATIC_CALL_VIOLATION
```
**Severity**: Critical

### 4. Missing PIL Error Constraint
```markdown
Doc: **SIDE_EFFECT_LIMIT_REACHED**
Sim: throws OpcodeExecutionException
PIL: No constraint checking counter limit
```
**Severity**: High (malicious prover can exceed limit)

### 5. Undocumented Error
```markdown
Doc: (no NULLIFIER_COLLISION listed)
Sim: catches NullifierCollisionException
```
**Severity**: Low (documentation drift)

## FALSE POSITIVE FILTERING

### 1. Errors Handled by Shared Infrastructure
TAG_MISMATCH is handled by `registers.pil` for ALL opcodes - don't report as missing from opcode-specific PIL.

### 2. MEMORY_ACCESS_OUT_OF_RANGE
Handled by `addressing.pil` for ALL opcodes - don't report as missing from opcode-specific PIL.

### 3. OUT_OF_GAS
Handled by `gas.pil` for ALL opcodes - don't report as missing from opcode-specific PIL.

### 4. Infallible by Design
Some opcodes genuinely cannot fail (MOV, JUMP). Verify against documented behavior before reporting.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-error-conditions` |
| Target Opcodes | `{opcode list or "All"}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-error-conditions-{opcode}-{error}-{layer}`
- **Severity**: Critical / High / Medium / Low
- **Opcode**: `{opcode name}`
- **Error**: `{error type from doc}`
- **Layer**: `Documentation / Simulation / Tracegen / PIL`
- **Issue**: `{brief description}`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-error-conditions.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-error-conditions",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["EMITNOTEHASH", "EMITNULLIFIER"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-error-conditions-emitnotehash-staticcall-pil",
    "severity": "high",
    "opcode": "EMITNOTEHASH",
    "error": "STATIC_CALL_VIOLATION",
    "layer": "PIL",
    "file": "pil/vm2/opcodes/emit_notehash.pil",
    "line": 42,
    "description": "Missing is_static check in PIL constraint",
    "fix": "Add sel_execute_emit_notehash * is_static * (1 - sel_opcode_error) = 0"
  }]
}
```
