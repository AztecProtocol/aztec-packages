---
name: vm2-audit-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
version: 2.0.0
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

## CRITICAL: Performance Anti-Patterns

**DO NOT** perform per-column or per-constraint grepping. This causes 30+ minute runtimes.

**DO NOT** try to "verify all code paths" or "trace all constraints" - this is unbounded.

**DO**: Read files once → analyze in memory → batch operations → bounded sampling.

## Misalignment Types (Reference Only)

| Type | Signal | Quick Check |
|------|--------|-------------|
| **Missing Column** | `pol commit` vs `row.col =` | Set difference |
| **Missing Conditional** | `col = flag * expr` in PIL | Shape match: C++ has `if`/`?` |
| **Selector Not Toggled** | `sel_*` in PIL | Presence check in C++ |
| **Event Not Handled** | `switch` in handlers | Check for `Error` case |
| **Wrong Type Cast** | `static_cast` on field | Grep for `static_cast` |

**Note**: Types like "Wrong Partition Derivation" and "Wrong Boolean in Accumulation" require deep analysis. Use bounded sampling (Step 4) for these.

## Optimized Workflow

### Step 1: Batch Column Presence Check (REQUIRED)

Read files once, compute set differences:

```bash
# Extract PIL columns (one read)
grep -oE "pol commit [a-z_][a-z0-9_]*" pil/vm2/<component>.pil | cut -d' ' -f3 | sort -u > /tmp/pil_cols.txt

# Extract tracegen assignments (one read, robust regex)
grep -oE "row\.[a-z_][a-z0-9_]*\s*=" src/barretenberg/vm2/tracegen/<component>*.cpp | cut -d'.' -f2 | cut -d'=' -f1 | tr -d ' ' | sort -u > /tmp/cpp_cols.txt

# Set difference
comm -23 /tmp/pil_cols.txt /tmp/cpp_cols.txt  # Missing in C++
```

**Output**: List of columns in PIL but not assigned in tracegen → potential bugs.

### Step 2: Batch Conditional Shape Check (REQUIRED)

For columns used with multiplication in PIL (`sel * col`):

1. Read PIL file, identify columns in `sel * X` or `flag * X` patterns
2. For each, check if C++ assignment contains `if`, `?`, or `switch`
3. **DO NOT verify the math** - only check for presence of control flow

```bash
# Find conditional columns in PIL
grep -E "[a-z_]+ \* [a-z_]+" pil/vm2/<component>.pil | head -20

# Check C++ has conditionals (batch)
grep -n "row\.<flagged_col>" src/barretenberg/vm2/tracegen/<component>*.cpp
# Look for ? or if on same/nearby lines
```

**Output**: Columns where PIL expects conditional but C++ assigns unconditionally → potential bugs.

### Step 3: Event Handler Completeness (REQUIRED)

Quick check for missing error handling:

```bash
# Find event handlers
grep -rn "process.*Event" src/barretenberg/vm2/tracegen/<component>*.cpp

# Check switch statements handle Error cases
grep -A 20 "switch.*type" src/barretenberg/vm2/tracegen/<component>*.cpp | grep -E "Error|default"
```

**Output**: Event handlers missing error cases → potential bugs.

### Step 3b: Type Conversion Safety (REQUIRED)

Search for dangerous integer casting on field elements:

```bash
grep -n "static_cast" src/barretenberg/vm2/tracegen/<component>*.cpp
```

**Action**: If `static_cast` is used on a variable that flows into a `row.` assignment for a field element, flag as **Suspected (High)**. Integer math on field elements can cause overflow/underflow bugs.

### Step 4: Bounded Deep Analysis (OPTIONAL - Max 3 Items)

If Steps 1-3 found potential issues, select **at most 3** for deep verification:

1. Pick the 3 most suspicious findings from Steps 1-3
2. For each, trace the specific constraint through PIL → C++
3. Check the known-issues.md patterns against these 3 only
4. **STOP after 3** regardless of other potential issues

**Rationale**: Deep analysis is expensive. Report the 3 verified issues; note others as "needs manual review."

### Step 5: Termination (REQUIRED)

The audit is COMPLETE when:
- Step 1 set difference computed
- Step 2 conditional shape check done
- Step 3 event handlers checked
- Step 3b type conversions checked
- Step 4 deep analysis on ≤3 items (or skipped if no findings)

**DO NOT** continue searching for more issues after these steps.

## False Positive Quick Filters

Before reporting, apply these **name-based** filters (no deep analysis):

| Pattern | Action |
|---------|--------|
| Column ends in `_inv` | Likely valid (IS_ZERO pattern) - note as "likely FP" |
| Column starts with `sel_start` or `init_` | Low Priority - start-row-only columns |
| Column matches `*_sel_*` in perms_*.hpp | Auto-set DST selector - skip |
| Tracegen has `// TODO` near assignment | Known incomplete - note severity as Low |

**DO NOT** perform transitive reference analysis or graph traversal for FP checks.

## Extended Examples

See `references/known-issues.md` for patterns. Use these for **pattern matching during Step 4 only**, not exhaustive checking.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-tracegen-pil-alignment` |
| Target | `{path}` |
| Columns Checked | `{n}` |
| Findings | `{e.g., "2 Critical, 1 Needs Review" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**:
- **ID**: `vm2-audit-tracegen-pil-alignment-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low / Needs Manual Review
- **File**: `path/to/file:line`
- **Description**: Brief description
- **Confidence**: Verified (from Step 4) / Suspected (from Steps 1-3)
- **Fix**: One-line suggestion

### JSON File (REQUIRED)

Write to output directory as `vm2-audit-tracegen-pil-alignment.json`:

```json
{
  "skill": "vm2-audit-tracegen-pil-alignment",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-tracegen-pil-alignment-addressing-123-missing-column",
      "severity": "critical",
      "confidence": "verified",
      "file": "src/barretenberg/vm2/tracegen/addressing_trace.cpp",
      "line": 123,
      "description": "Column X in PIL but not assigned in tracegen",
      "fix": "Add row.X = ... assignment"
    }
  ],
  "notes": [
    "Deep analysis performed on 3 items.",
    "Skipped deep analysis on 12 items - manual review recommended for: [list IDs]"
  ]
}
```
