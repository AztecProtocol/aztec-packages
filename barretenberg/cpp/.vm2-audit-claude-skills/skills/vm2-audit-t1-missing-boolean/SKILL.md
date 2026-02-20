---
name: vm2-audit-t1-missing-boolean
description: Audit VM2/AVM PIL files for missing boolean selector constraints. Critical soundness issue where columns used as booleans lack `sel * (1 - sel) = 0` constraints, allowing field arithmetic exploits including error cancellation, conditional logic corruption, and accumulator manipulation.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Missing Boolean Selector Audit

Audit for missing boolean constraints on selector columns - a **critical soundness vulnerability** enabling field arithmetic exploits.

## When to Use
- Auditing PIL files for missing boolean constraints
- Reviewing selectors, flags, or indicator columns
- Checking zero-check pattern implementations

## Severity Assessment

Assess case-by-case based on impact:
- **Soundness** (malicious prover exploits): Critical/High
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation

## FALSE POSITIVE FILTERING (CRITICAL)

**DO NOT REPORT** columns that fall into these categories:

### 1. Multiplicative-Only Usage is NOT Exploitable
```pil
sel * expr = 0;  // If sel=2, constraint still forces expr=0
```
A non-boolean selector in `sel * expr = 0` does NOT bypass the constraint. Non-zero `sel` still forces `expr=0`. **Only additive expressions are exploitable.**

### 2. Lookup-Constrained Columns (when selector is active)
```pil
sel { col } in precomputed.sel_binary { precomputed.binary_value };
```
If the column is constrained via lookup to a binary table **when the main selector is active**, it's secure on active rows. Only report if exploitable on inactive rows.

### 3. Gated Boolean with All Uses Also Gated
```pil
sel * my_bool * (1 - my_bool) = 0;  // Gated constraint
sel * (output - my_bool * value) = 0;  // Gated use - SECURE
```
If ALL uses of the column are gated by the same selector, this is NOT exploitable.

### 4. Derived from Boolean Operations
```pil
pol DERIVED = bool_a * bool_b;  // Product of booleans is boolean
pol DERIVED = bool_a + bool_b - bool_a * bool_b;  // OR of booleans
```
If a column is algebraically derived from constrained booleans via operations that preserve booleanness, it's secure.

### 5. Array Columns with Loop Constraints
```pil
pol commit sel_op[8];
for i in 0..8 { sel_op[i] * (1 - sel_op[i]) = 0; }
```
Array columns often have constraints added via loops in PIL. Check for loop-based constraint generation before reporting.

### Severity Criteria for Valid Findings

| Usage Pattern | Exploitable? | Severity |
|---------------|--------------|----------|
| Used in additive error aggregation (`err1 + err2`) | YES | Critical |
| Used in MUX pattern (`sel * A + (1-sel) * B`) | YES | Critical |
| Used as permutation selector | YES | High |
| Only multiplicative use (`sel * expr = 0`) | NO | Don't report |
| Lookup-constrained on active rows | NO | Don't report |
| All uses gated by same selector | NO | Don't report |

## Exploit Types

### 1. Error Cancellation (Most Common)
```pil
sel_err = sel_out_of_bound + sel_wrong_tag;
// If sel_wrong_tag unconstrained, prover sets sel_wrong_tag = p-1:
//   sel_err = 1 + (p-1) = 0 (mod p) - error cancelled!
```

### 2. Conditional Logic Corruption (MUX Pattern)
```pil
result = sel * A + (1 - sel) * B;
// If sel=2: result = 2*A - B (neither A nor B!)
```

### 3. Accumulator Manipulation
```pil
count = sel_a + sel_b + sel_c;
// If sel_a unconstrained, prover sets arbitrary counts
```

**Note**: `sel * expr = 0` with non-boolean sel does NOT bypass constraints (non-zero sel still forces expr=0). Vulnerability is in **additive expressions** and **multiplicative factors**.

## Workflow

> **PERFORMANCE RULE**: Do NOT iterate per-column with individual greps. Use the batch-first approach below. The codebase has ~1,730 committed columns across ~65 PIL files — per-column iteration will exhaust the context window.

### Phase 1: Batch Collection (3 parallel searches)

Run these three searches in parallel to collect the two sets needed for diffing:

**Search A — All boolean-candidate columns** (columns that SHOULD be boolean):
```bash
grep -rn "pol commit.*sel_\|pol commit.*is_\|pol commit.*err_\|@boolean" pil/vm2/ --include="*.pil"
```

**Search B — All existing boolean constraints** (columns that ARE constrained):
```bash
grep -rn "(1 - " pil/vm2/ --include="*.pil"
```
This catches `col * (1 - col) = 0`, gated forms like `sel * col * (1 - col) = 0`, and loop-generated constraints.

**Search C — All lookup-to-binary constraints**:
```bash
grep -rn "sel_binary\|binary_value" pil/vm2/ --include="*.pil"
```

### Phase 2: Set Difference (compute candidates)

From the batch results:
1. Build set DECLARED = columns from Search A
2. Build set CONSTRAINED = columns appearing in Search B + Search C
3. CANDIDATES = DECLARED - CONSTRAINED (these are the columns to investigate)

Typically yields **10-30 candidates**, not hundreds.

### Phase 3: Deep Analysis (only on candidates)

For each candidate from the diff, read the relevant file ONCE and check:
1. Is it derived from `sel *` (inherently safe)?
2. Does it appear in additive expressions (exploitable)?
3. Are all uses gated by the same selector (safe)?

**Only report if**: Column lacks boolean constraint AND (appears in additive expression OR used as ungated permutation selector).

### Phase 4: Completeness Reconciliation (catch naming gaps)

The batch searches use naming conventions (sel_, is_, err_). To catch unconventionally-named booleans:

```bash
# Find ALL columns treated as boolean by usage pattern (1 - col_name), regardless of name
grep -roPh "(1 - [a-z_][a-z_0-9]*)" pil/vm2/ --include="*.pil" | sort -u
```

Cross-check: any column name appearing here that wasn't in Search A is an unconventionally-named boolean. Add it to candidates and re-run Phase 3 for those.

Also do a quick per-file scan: for each PIL file, count `pol commit` declarations and verify the file was covered by Phases 1-3. List any files with 0 candidates analyzed (they may still be fine, but flag for awareness in the report).

**Expected result**: Phase 4 adds 0-5 extra candidates, confirming the batch approach was comprehensive.

## Patterns

### Vulnerable
```pil
pol commit my_selector; // @boolean but no constraint!
pol commit is_active;
is_active * some_expression = 0;  // Assumes boolean
```

### Secure
```pil
pol commit my_selector;
my_selector * (1 - my_selector) = 0;  // Explicit constraint

pol commit sel;
sel { sel } in precomputed.sel_binary { precomputed.binary_value };  // Lookup
```

## Zero-Check Pattern (Critical)

```pil
// e = 1 iff x = 0
pol commit e, inv;
x * (e * (1 - inv) + inv) - 1 + e = 0;
// MUST have: e * (1 - e) = 0;  // Without this, check bypassed!
```

## Historical Bug Patterns

- Missing boolean on memory sub-module selector columns
- Missing boolean on ALU operation selectors

## Files with Good Boolean Hygiene (Typically No Findings)

These files demonstrate excellent constraint practices - verify before reporting:
- `gt.pil`, `ff_gt.pil` - All selectors properly constrained
- `memory.pil` - All permutation selectors constrained
- `alu.pil` - Operation selectors properly constrained
- `merkle_check.pil` - Core selectors constrained
- `addressing.pil` - Well-constrained
- `data_copy.pil` - Well-constrained

## Expected Finding Count

A well-executed audit typically finds **5-15 genuine findings**, not 50+. If you're finding significantly more, re-verify against the FALSE POSITIVE FILTERING criteria above.

## REQUIRED OUTPUT FORMAT

### 1. Markdown Report (stdout)

#### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t1-missing-boolean` |
| Target | `{path}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format
- **ID**: `vm2-audit-t1-missing-boolean-{filename}-{line}-{issue-type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write `vm2-audit-t1-missing-boolean.json` to output directory:
```json
{
  "skill": "vm2-audit-t1-missing-boolean",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-missing-boolean-filename-123-issue-type",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "Brief description",
    "exploitability": "high",
    "fix": "Suggested fix"
  }]
}
```

For no findings: `{"skill": "vm2-audit-t1-missing-boolean", "status": "COMPLETED_NO_FINDINGS", "findings": []}`
