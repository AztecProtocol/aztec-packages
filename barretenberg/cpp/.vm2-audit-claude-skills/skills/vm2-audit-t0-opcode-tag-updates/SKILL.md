---
name: vm2-audit-t0-opcode-tag-updates
description: Audit VM2/AVM opcode tag updates for cross-layer consistency. Verifies that output operand tag assignments (T[dst] = T[src], T[dst] = UINT32, etc.) are correctly propagated from simulation through tracegen to PIL constraints.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Tag Updates Audit

Audit for missing or incorrect output operand tag assignments across documentation, simulation, tracegen, and PIL layers.

## When to Use
- Auditing tag propagation for opcodes with outputs
- Checking CAST operation tag updates
- Reviewing opcodes that read from external sources (SLOAD, GETENVVAR)
- Investigating downstream type confusion from wrong output tags

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

- **Critical**: Output tag wrong or missing → downstream type confusion
- **High**: Tag inheritance broken → operations on mistyped values
- **Medium**: Tracegen/PIL doesn't match documented tag update
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

## Background: Tag Updates

Output tags determine how subsequent operations treat values:
- **Inherited**: `T[dst] = T[src]` - output gets input's tag (ALU ops)
- **Fixed**: `T[dst] = FIELD` - output always has specific tag (SLOAD, tree reads)
- **Cast**: `T[dst] = dstTag` - output gets explicit new tag (CAST)

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Tag Updates section
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/execution.cpp
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/alu.cpp
barretenberg/cpp/src/barretenberg/vm2/common/memory_types.hpp   # MemoryValue
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp   # Output register handling
barretenberg/cpp/src/barretenberg/vm2/tracegen/memory_trace.cpp      # Memory write tags
```

### PIL
```
barretenberg/cpp/pil/vm2/execution/registers.pil    # Output tag columns
barretenberg/cpp/pil/vm2/alu.pil                    # ic_tag constraints
barretenberg/cpp/pil/vm2/opcodes/sload.pil          # Fixed FIELD tag
barretenberg/cpp/pil/vm2/cast.pil                   # Cast tag update
```

## Tag Update Patterns

### Pattern 1: Inherited Tag (ALU Operations)
```markdown
Doc: T[dstOffset] = T[aOffset]
```
Output inherits input tag - important for polymorphic operations.

**Simulation**: ALU returns `MemoryValue` with same tag as inputs
**Tracegen**: `mem_tag_reg[output_idx] = mem_tag_reg[input_idx]`
**PIL**: `alu.ic_tag = alu.ia_tag` (when both inputs match)

### Pattern 2: Fixed Tag (External Reads)
```markdown
Doc: T[dstOffset] = FIELD
```
Operations reading from trees always return FIELD.

**Simulation**: Returns `MemoryValue(value, ValueTag::FF)`
**Tracegen**: `mem_tag_reg[output_idx] = MEM_TAG_FF`
**PIL**: `sel_execute_sload * (constants.MEM_TAG_FF - mem_tag_reg[1]) = 0`

### Pattern 3: Explicit Cast
```markdown
Doc: T[dstOffset] = dstTag
```
CAST operations change the tag to an immediate operand.

**Simulation**: `MemoryValue::cast_to(dst_tag)`
**Tracegen**: `mem_tag_reg[output_idx] = dst_tag_immediate`
**PIL**: Cast subtrace constraints

### Pattern 4: Range Tag Update
```markdown
Doc: T[dstOffset:dstOffset+size] = FIELD
```
Copy operations may update tags for a range.

**Simulation**: Loop writes values with specified tag
**Tracegen**: Multiple memory writes with tag
**PIL**: Memory permutation with tag column

## Workflow

### Step 0: Enumerate ALL Opcodes With Outputs

Before diving into specific opcodes, build a complete inventory to ensure nothing is skipped:

```bash
# All opcodes that have Tag Updates documentation
grep -l "## Tag Updates" yarn-project/simulator/docs/avm/opcodes/*.md

# All opcode selectors in PIL that write to output registers
grep -rn "mem_tag_reg\[.*\]" pil/vm2/ --include="*.pil"

# All ALU operation selectors (each needs tag verification)
grep -rn "sel_op_\|sel_alu_\|sel_execute_" pil/vm2/alu.pil
```

Build a checklist of every opcode that produces an output. Audit each one — do not stop after a few.

### Step 1: Select Target Opcode(s)
```bash
# Find opcodes with Tag Updates section
grep -l "## Tag Updates" yarn-project/simulator/docs/avm/opcodes/*.md

# View specific opcode
cat yarn-project/simulator/docs/avm/opcodes/sload.md
```

### Step 2: Extract Documented Tag Updates
```bash
grep -A 3 "## Tag Updates" yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Parse the pattern:
- `T[dstOffset] = T[aOffset]` → Inherit from input
- `T[dstOffset] = FIELD` → Fixed FIELD
- `T[dstOffset] = dstTag` → From immediate operand

### Step 3: Verify Simulation Layer

Find opcode implementation:
```bash
grep -A 30 "void Execution::<opcode>" src/barretenberg/vm2/simulation/gadgets/execution.cpp
```

Check output construction:
```cpp
// Inherited tag (ALU)
MemoryValue result = alu.add(a, b);  // ALU preserves tag
memory.set(dst_addr, result);

// Fixed tag
MemoryValue result(value, ValueTag::FF);  // Explicit FF
memory.set(dst_addr, result);

// Cast
MemoryValue result = input.cast_to(dst_tag);
memory.set(dst_addr, result);
```

### Step 4: Verify Tracegen Layer

Check output register handling:
```bash
grep -n "mem_tag_reg\|output" src/barretenberg/vm2/tracegen/execution_trace.cpp
```

For fixed tags, look for explicit assignment:
```cpp
// SLOAD always outputs FIELD
row.set(C::execution_mem_tag_reg_1_, static_cast<uint8_t>(ValueTag::FF));
```

### Step 5: Verify PIL Layer

For inherited tags, check ALU:
```bash
grep -n "ic_tag" pil/vm2/alu.pil
```

For fixed tags, check opcode PIL:
```bash
grep -n "mem_tag_reg\|MEM_TAG" pil/vm2/opcodes/sload.pil
```

Example constraint:
```pil
// SLOAD output is always FIELD
sel_execute_sload * (constants.MEM_TAG_FF - mem_tag_reg[1]) = 0;
```

### Step 5b: Verify Tag Constraint Universality

For each output tag constraint found in Step 5, check whether it fires for ALL operation variants that use that output, or only some:

```bash
# Find the selector that gates the tag constraint
# Then find ALL operations that share the same output column
grep -n "ic_tag\|oc_tag\|mem_tag" pil/vm2/alu.pil pil/vm2/cast.pil pil/vm2/opcodes/*.pil
```

**Critical check**: If a tag constraint is gated by a specific operation selector (e.g., `sel_op_X * (tag - expected) = 0`), verify that ALL other operations using the same output also have tag constraints. A constraint that only fires for some operations leaves the output tag unconstrained for others.

**Pattern to detect**:
```pil
// VULNERABLE: Tag only constrained for some operations
sel_op_A * (output_tag - input_tag) = 0;
// sel_op_B also writes output but has NO tag constraint
// → malicious prover sets arbitrary tag on op_B outputs
```

```pil
// SECURE: Tag constrained unconditionally for all operations
sel_all_ops * (output_tag - input_tag) = 0;
// OR: each operation has its own constraint
sel_op_A * (output_tag - input_tag) = 0;
sel_op_B * (output_tag - input_tag) = 0;
```

For ALU specifically: verify that the tag inheritance constraint covers EVERY operation selector in the ALU dispatch, not just a subset. Cross-reference the list of ALU selectors from Step 0 against selectors that participate in tag constraints.

### Step 6: Cross-Reference Findings

| Opcode | Doc Tag Update | Simulation | Tracegen | PIL | Match? |
|--------|----------------|------------|----------|-----|--------|
| ADD | T[dst] = T[a] | ALU preserves | Inherited | alu.ic_tag | Y |
| SLOAD | T[dst] = FIELD | FF explicit | FF set | Constrained | Y |
| CAST | T[dst] = dstTag | cast_to() | immediate | cast.pil | Y |

## Common Mismatch Patterns

### 1. Missing Fixed Tag in Simulation
```markdown
Doc: T[dstOffset] = FIELD
Sim: MemoryValue result(value);  // Uses default tag, not FF!
```
**Severity**: Critical - wrong output tag

### 2. Tag Not Inherited
```markdown
Doc: T[dstOffset] = T[aOffset]
Sim: MemoryValue result(computed_value, ValueTag::FF);  // Hardcoded FF!
```
**Severity**: High - breaks polymorphic behavior

### 3. PIL Missing Tag Constraint
```markdown
Doc: T[dstOffset] = FIELD
Sim: Correct
PIL: No constraint on output tag
```
**Severity**: High - malicious prover sets arbitrary tag

### 4. Tracegen Wrong Tag
```markdown
Doc: T[dst] = UINT32
Tracegen: mem_tag_reg[out] = MEM_TAG_UINT64  // Wrong!
```
**Severity**: High - verification will fail

### 5. ALU Tag Preservation Bug
```markdown
Doc: T[dst] = T[a] (inputs have matching tags)
ALU: Returns value with fixed FF tag
```
**Severity**: High - breaks integer arithmetic

### 6. Conditional Tag Constraint (Should Be Universal)
```markdown
Doc: T[dst] = T[a] for ALL variants of an operation
PIL: Tag constraint gated by variant-specific selector
     → other variants leave output tag unconstrained
```
**Severity**: High - malicious prover sets arbitrary output tag for ungated variants

This pattern applies to any component (ALU, gadgets, opcodes) where a shared output column has a tag constraint that only fires under certain selectors. Check that every operation writing to the output has a corresponding tag constraint.

## Opcodes by Tag Update Type

### Inherited Tag (T[dst] = T[input])
- ADD, SUB, MUL, DIV (inherit from operands)
- AND, OR, XOR, NOT, SHL, SHR (inherit from operands)
- EQ, LT, LTE (output is always UINT1, special case)
- MOV (T[dst] = T[src])

### Fixed FIELD Tag
- SLOAD (reads from public data tree)
- GETENVVAR (for field-valued variables)
- Tree read operations

### Explicit Tag (from operand)
- CAST (T[dst] = dstTag immediate)
- SET (T[dst] = dstTag immediate)

### Boolean/UINT1 Output
- EQ, LT, LTE (comparison results are UINT1)

## FALSE POSITIVE FILTERING

### 1. Trace Transitive Constraint Implications
Before reporting a "missing constraint", verify it isn't enforced indirectly. A constraint forcing `X=0` may transitively force `Y=Z` if another constraint links them. Always follow the full chain of dependencies within the same PIL file.

### 2. Comparison Operations Output UINT1
EQ, LT, LTE always output UINT1 regardless of input tags. This is intentional, not a bug.

### 3. ALU Handles Tag Inheritance (Verify, Don't Assume)
For ALU operations, tag inheritance is typically handled in `alu.pil` via `ic_tag = ia_tag` when `ia_tag == ib_tag`. Don't report missing constraint in opcode-specific PIL **IF** you have verified the ALU constraint covers the specific operation. However, you MUST verify that the ALU tag constraint's gating selector actually includes the operation in question — some ALU operations may not participate in the shared tag inheritance constraint.

### 4. Memory Trace Handles Write Tag
The memory permutation includes the tag column. If memory trace is correct, PIL implicitly constrains the tag.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-tag-updates` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-tag-updates-{opcode}-{output}-{layer}`
- **Severity**: Critical / High / Medium / Low
- **Opcode**: `{opcode name}`
- **Output**: `{output operand}`
- **Expected**: `{documented tag update}`
- **Actual**: `{what implementation does}`
- **Layer**: `Simulation / Tracegen / PIL`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-tag-updates.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-tag-updates",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["SLOAD", "ADD", "CAST"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-tag-updates-sload-dst-pil",
    "severity": "high",
    "opcode": "SLOAD",
    "output": "dstOffset",
    "expected": "T[dstOffset] = FIELD",
    "actual": "No PIL constraint on output tag",
    "layer": "PIL",
    "file": "pil/vm2/opcodes/sload.pil",
    "line": 38,
    "description": "Missing constraint forcing output tag to FIELD",
    "fix": "Add sel_execute_sload * (MEM_TAG_FF - mem_tag_reg[1]) = 0"
  }]
}
```
