---
name: vm2-audit-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
version: 1.0.0
---

# VM2 Tracegen-PIL Alignment Audit

Audits for tracegen-PIL misalignment - **completeness issue** where trace generation doesn't match PIL constraints, causing valid executions to fail verification.

## Severity Assessment

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical**.

## When Usually NOT Needed

- Pure PIL-only audits with no tracegen component (use vm2-audit-dead-columns instead)
- If unsure, still run the audit but verify findings against both PIL and tracegen

## Misalignment Types Checklist

For each type, search for the pattern and verify tracegen matches PIL:

| Type | What to Search | Distinguishing Signal |
|------|----------------|----------------------|
| **1. Missing Column** | `pol commit` in PIL vs `row.col =` in tracegen | Column declared in PIL but never assigned in tracegen |
| **2. Wrong Computation** | `static_cast`, integer arithmetic on field values | Tracegen uses integer math where PIL expects field arithmetic |
| **3. Event Not Handled** | `switch`/`if` statements in tracegen event handlers | Missing case for error events or edge cases |
| **4. Selector Not Toggled** | `sel_*` assignments in tracegen | PIL expects selector=1 for certain paths but tracegen doesn't set it |
| **5. Wrong Partition Derivation** | `sel = A + B + C` in PIL | Sub-selector boolean in tracegen doesn't match algebraic derivation |
| **6. Conditional Assignment** | `col = flag * expr` in PIL | Tracegen assigns unconditionally instead of gating by flag |
| **7. Wrong Selector Used** | Accumulation loops with selectors | Tracegen uses different selector than PIL for accumulation |
| **8. Start-Row-Only (FALSE POSITIVE)** | Columns gated by `sel_start *` | SAFE if ALL references gated by start-row selector - mark as false positive |

### Type 5 Derivation Protocol

For `sel = A + B + C` partitions, derive each sub-selector algebraically:
```
Example: sel = double_op + add_op + INFINITY_PRED
Where: double_op = x_match * y_match, INFINITY_PRED = x_match * (1 - y_match)
Derivation: add_op = sel - x_match, so add_op = 1 when x_match = 0
```
Verify tracegen boolean matches the algebraic derivation, not intuitive guess.

### Type 8 False Positive Validation

1. Find ALL references (direct + transitive via intermediate defs)
2. Verify EVERY reference is gated by start-row selector (`sel_start * expr`)
3. IF any ungated usage OR next-row reference (`col'`) -> Flag Vulnerability
4. ELSE -> Mark False Positive (Start-Row-Only Input)

## Workflow

### Step 1: Map PIL Columns to Tracegen

```bash
# List all committed columns in PIL
grep -n "pol commit" pil/vm2/<component>.pil

# For each, verify tracegen sets it
grep -n "row\\.<column>" src/barretenberg/vm2/tracegen/<component>*.cpp
```

### Step 2: For Each Constraint, Trace to Tracegen

For each PIL constraint:
- What values does the constraint use?
- How are those values computed in tracegen?
- Do they satisfy the constraint for all code paths?

### Step 3: Check All Code Paths

Verify trace generation handles:
- Normal execution path
- Error handling paths (check simulation throws correct exception types)
- Edge cases (zero values, max values, empty collections)
- Boundary conditions

### Step 4: Verify Event Handling

```bash
# Find event types
grep -rn "struct.*Event\\|enum.*Event" src/barretenberg/vm2/simulation/ --include="*.hpp"

# Find event processing
grep -rn "process.*event\\|handle.*event" src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

Verify each simulation event type has tracegen handler with correct field mappings.

### Step 5: Check Type Conversions

```bash
grep -rn "static_cast\\|reinterpret_cast" src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

Verify field elements vs integers handled correctly, signed vs unsigned conversions safe.

### Step 6: Derive Selector Conditions from PIL Partitions

```bash
grep -rn "sel.*=.*+.*+" pil/vm2/ --include="*.pil"
```

For each partition, algebraically derive sub-selectors and verify tracegen matches.

## Extended Examples

For detailed examples of real issues found (PR #18864, #19001, #19254, #19471, #19527), read `references/known-issues.md`.

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

| Item | Value |
|------|-------|
| Skill | `vm2-audit-tracegen-pil-alignment` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-tracegen-pil-alignment-filename-123-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write `vm2-audit-tracegen-pil-alignment.json` to the output directory:

```json
{
  "skill": "vm2-audit-tracegen-pil-alignment",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-tracegen-pil-alignment-filename-123-issue-type",
      "severity": "critical",
      "file": "path/to/file.pil",
      "line": 123,
      "description": "Brief description",
      "exploitability": "high",
      "fix": "Suggested fix"
    }
  ]
}
```
