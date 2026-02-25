---
name: vm2-audit-t2-constraint-typos
description: Audit VM2/AVM PIL files for constraint typos where the wrong variable is constrained. Soundness issue where copy-paste errors or variable name confusion leads to constraining `addr` instead of `size`, `index` instead of `length`, etc. Allows unconstrained values to be set arbitrarily by malicious provers.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Constraint Typo Audit

## Purpose
Detect typos where the wrong variable is constrained due to copy-paste errors or variable name confusion. Syntactically valid but semantically incorrect - leaves intended value unconstrained.

## Severity Assessment
- **Soundness** (prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low to Critical based on reachability
- Completeness bugs reachable via canonical simulation on valid inputs are **Critical**

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every constraint where a variable name looks like it could be a copy-paste error is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Variable usage is intentional**: The constraint's semantics require the exact variable used (explain the algebraic reason with quoted constraint).
  - (b) **Different variable, same value**: The two variables are provably equal in context (quote the equality constraint with file:line).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## Key Example: Transposed Variable Name in Constraint

```pil
// VULNERABLE: constraint name says TOTAL but constrains partial
#[WIDGET_TOTAL_COUNT_IS_ZERO]
widget_start * partial_count = 0;  // WRONG! Should be total_count

// FIXED:
widget_start * total_count = 0;  // CORRECT
```

## Typo Patterns

### offset/length Confusion
- `region_offset` vs `region_length`
- `buffer_offset` vs `buffer_length`
- `segment_offset` vs `segment_length`

### index/length Confusion
```pil
some_selector * byte_index = 0;   // Meant byte_length!
```

### src/dst Confusion
```pil
copy_start * dst_addr = 0;  // Was this meant to be src_addr?
```

### current/next Row Confusion
```pil
sel * value = 0;    // Meant value' (next row)!
```

### Similar Column Groups
Watch for typos in: `a/b/c`, `op1/op2/op3`, `lo/hi/mid`, `start/end/current`, `read/write/exec`

## Workflow

> **PERFORMANCE RULE**: Do NOT iterate per-constraint with individual greps. Use batch collection to gather all constraint names and column declarations first, then cross-reference in memory. Per-constraint iteration will exhaust the context window.

### Phase 1: Batch Collection (3 parallel searches)

**Search A — All constraint names and their expressions**:
```bash
grep -rn "#\[.*\]" pil/vm2/ --include="*.pil"
grep -A1 "#\[" pil/vm2/ --include="*.pil"
```

**Search B — All column declarations with similar-name groups**:
```bash
grep -rn "pol commit" pil/vm2/ --include="*.pil"
```

**Search C — All initialization and propagation constraints**:
```bash
grep -rn "start\|first\|init\|' -\|')" pil/vm2/ --include="*.pil"
```

### Phase 2: Cross-Reference in Memory

From the batch results:
1. Parse constraint name hints (e.g., `CD_SIZE` implies calldata size)
2. Build groups of similar column names (e.g., `foo_addr`, `foo_size`, `foo_offset`)
3. For each constraint, verify the actual constrained column matches the name hint
4. Flag mismatches between name and column

### Phase 3: Deep Analysis (only on flagged constraints)

For each suspicious constraint:
1. Read the PIL file to verify context
2. Cross-reference with comments
3. Cross-reference with tracegen assignments

### Phase 4: Completeness Check

Verify coverage across all PIL files:
```bash
for f in pil/vm2/*.pil pil/vm2/**/*.pil; do
  [ -f "$f" ] || continue
  echo "$f: $(grep -c '#\[' "$f" 2>/dev/null || echo 0) constraints"
done
```

## Red Flags

1. **Name/column mismatch**: Constraint name contains SIZE/ADDR/INDEX but constrains different column type
2. **Similar constraint groups**: Multiple constraints initializing related columns (copy-paste risk)
3. **Long column names with common prefixes**: `execution_parent_calldata_addr` vs `..._size`
4. **Comment/code mismatch**: Comment says "constrain X" but code constrains Y

## Fix Pattern

1. Identify correct column from constraint name and semantic intent
2. Update PIL constraint
3. Run `vmp` to regenerate C++ relations
4. Add negative test
5. Audit for similar typos in same/related files

## Output Format

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t2-constraint-typos` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-t2-constraint-typos`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write `vm2-audit-t2-constraint-typos.json` to the output directory:

```json
{
  "skill": "vm2-audit-t2-constraint-typos",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-constraint-typos-filename-123-issue-type",
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
