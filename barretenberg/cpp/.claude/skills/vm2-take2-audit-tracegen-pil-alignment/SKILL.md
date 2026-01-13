---
name: vm2-take2-audit-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Tracegen-PIL Alignment Audit

## Purpose
Detect misalignment between trace generation code and PIL constraints (completeness bugs).

## Severity
- **Completeness** bugs reachable via canonical simulation on valid inputs are **Critical**
- Unreachable/theoretical issues: Low to Medium

## Misalignment Types

| Type | Example | Impact |
|------|---------|--------|
| Missing column | `row.a_inv` never set | Constraint fails |
| Wrong computation | `static_cast<uint64_t>(a - b)` for negative | Wrong value |
| Missing event handler | Error case not handled | Trace incomplete |
| Wrong selector | Boolean logic != PIL semantics | Wrong selector |

## Workflow

### Step 1: Column Coverage
```bash
# PIL columns
grep -n "pol commit" pil/vm2/<component>.pil
# Tracegen assignments
grep -n "row\\." src/barretenberg/vm2/tracegen/<component>*.cpp
```
Verify each `pol commit col` has corresponding `row.col` assignment.

### Step 2: Constraint Alignment
```bash
grep -n "#\[" pil/vm2/<component>.pil
```
Check tracegen computes values correctly:
- **Field arithmetic**: `static_cast<uint64_t>(a - b)` fails for negative → use `FF(a) - FF(b)`
- **Selector derivation**: Work backwards from PIL `sel = A + B + C`
- **Event handling**: Each simulation event type needs a tracegen handler

### Step 3: Event Coverage
```bash
grep -rn "struct.*Event" src/barretenberg/vm2/simulation/ --include="*.hpp"
grep -rn "process.*event\|handle" src/barretenberg/vm2/tracegen/ --include="*.cpp"
```
Ensure error events emit proper trace rows.

## Patterns

### Vulnerable
```cpp
row.tag_diff = static_cast<uint64_t>(tag_a - tag_b);  // Wrong for negative!
```

### Secure
```cpp
row.tag_diff = FF(tag_a) - FF(tag_b);  // Field subtraction
```

### False Positive: Start-Row-Only Columns

Columns without propagation are SAFE if strictly gated by start-row selectors:
```pil
// SAFE: offset gated by sel_start, never referenced when sel_start=0
offset_plus_size = sel_start * (offset + copy_size);
```

**Before flagging missing propagation**:
1. Find ALL references (direct + transitive)
2. Verify EVERY reference is gated by start-row selector
3. Check column is NOT in lookups/permutations outside gating
4. Ungated usage OR next-row reference (`col'`) → Flag; ELSE → False Positive

## Real Bug Examples

**Missing Column (PR #18864)**:
`execution_batched_tags_diff_inv` never set → constraint always fails

**Wrong Selector (ECC)**:
```cpp
// PIL: sel = double_op + add_op + INFINITY_PRED
// double_op = x_match * y_match, INFINITY_PRED = x_match * (1 - y_match)
// Therefore add_op = 1 when x_match = 0
// WRONG: bool add_predicate = (!x_match && !y_match);
// RIGHT: bool add_predicate = !x_match;
```

**Wrong Exception Type (PR #18864)**:
Caller catches `Sha256CompressionException`, code throws `runtime_error` → trace not generated

## Output Format

### Markdown Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-take2-audit-tracegen-pil-alignment` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-take2-audit-tracegen-pil-alignment-filename-123-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (Required)
Write `vm2-take2-audit-tracegen-pil-alignment.json` to output directory:
```json
{
  "skill": "vm2-take2-audit-tracegen-pil-alignment",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-take2-audit-tracegen-pil-alignment-filename-123-issue-type",
    "severity": "critical",
    "file": "path/to/file",
    "line": 123,
    "description": "Brief description",
    "exploitability": "high",
    "fix": "Suggested fix"
  }]
}
```