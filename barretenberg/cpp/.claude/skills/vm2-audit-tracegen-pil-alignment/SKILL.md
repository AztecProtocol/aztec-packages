---
name: vm2-audit-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
version: 1.0.0
---

# VM2 Tracegen-PIL Alignment Audit

## Purpose
Find completeness bugs where tracegen doesn't match PIL constraints, causing valid executions to fail verification.

## When to Use
- Auditing PIL files that have corresponding tracegen code
- Reviewing changes to tracegen event handlers
- Investigating verification failures on valid inputs

## When NOT to Use
- Pure PIL-only audits with no tracegen component (use vm2-audit-dead-columns)

## Severity
**Completeness bugs reachable via canonical simulation on valid inputs are Critical.**

## Misalignment Types

| Type | Signal | Check |
|------|--------|-------|
| **Missing Column** | `pol commit` vs `row.col =` | Column declared but never assigned |
| **Wrong Computation** | `static_cast`, integer on field | Tracegen integer math, PIL expects field |
| **Event Not Handled** | `switch`/`if` in handlers | Missing error/edge case |
| **Selector Not Toggled** | `sel_*` assignments | PIL expects sel=1, tracegen doesn't set |
| **Wrong Partition** | `sel = A + B + C` in PIL | Sub-selector boolean != algebraic derivation |
| **Conditional Missing** | `col = flag * expr` in PIL | Tracegen assigns unconditionally |
| **Wrong Selector** | Accumulation loops | Tracegen uses different selector than PIL |
| **Start-Row-Only** | Gated by `sel_start *` | FALSE POSITIVE if ALL refs gated |

### Partition Derivation (Type 5)
For `sel = A + B + C`, derive algebraically:
```
sel = double_op + add_op + INFINITY_PRED
double_op = x_match * y_match
INFINITY_PRED = x_match * (1 - y_match)
=> add_op = sel - x_match (NOT intuitive guess!)
```

### False Positive Check (Type 8)
1. Find ALL references (direct + transitive)
2. Verify EVERY reference gated by `sel_start * expr`
3. Any ungated or `col'` reference -> real bug

## Workflow

### 1. Map PIL Columns to Tracegen
```bash
grep -n "pol commit" pil/vm2/<component>.pil
grep -n "row\\.<column>" src/barretenberg/vm2/tracegen/<component>*.cpp
```

### 2. Trace Constraints to Tracegen
For each constraint: What values? How computed in tracegen? Satisfied for all paths?

### 3. Check All Code Paths
- Normal execution
- Error handling (correct exception types?)
- Edge cases (zero, max, empty)

### 4. Verify Event Handling
```bash
grep -rn "struct.*Event" src/barretenberg/vm2/simulation/ --include="*.hpp"
grep -rn "process.*event" src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

### 5. Check Type Conversions
```bash
grep -rn "static_cast" src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

### 6. Verify Partition Derivations
```bash
grep -rn "sel.*=.*+.*+" pil/vm2/ --include="*.pil"
```

## Extended Examples
Read `references/known-issues.md` for detailed examples from PRs #18864, #19001, #19254, #19471, #19527.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-tracegen-pil-alignment` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Finding Format
- **ID**: `vm2-audit-tracegen-pil-alignment-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path:line`
- **Description**: Brief
- **Fix**: One-line

### JSON File (Required)
Write `vm2-audit-tracegen-pil-alignment.json`:
```json
{
  "skill": "vm2-audit-tracegen-pil-alignment",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "...", "severity": "critical", "file": "...",
    "line": 123, "description": "...", "fix": "..."
  }]
}
```
