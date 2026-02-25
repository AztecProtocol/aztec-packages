---
name: vm2-audit-t1-missing-boolean
description: Audit VM2/AVM PIL files for missing boolean selector constraints. Critical soundness issue where columns used as booleans lack `sel * (1 - sel) = 0` constraints, allowing field arithmetic exploits including error cancellation, conditional logic corruption, and accumulator manipulation.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Missing Boolean Selector Audit

Audit for missing boolean constraints on selector columns - a **critical soundness vulnerability** enabling field arithmetic exploits.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report vulnerabilities.

**RULE 1 — Report first, dismiss later.** Every boolean-candidate column lacking `col * (1 - col) = 0` is a PRELIMINARY FINDING. Report ALL of them first, then only remove in a final filtering pass using the strict criteria below.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss a finding if it matches one of these EXACT safe patterns:
  - (a) **Explicit boolean constraint**: `col * (1 - col) = 0` exists ungated (quote exact file:line).
  - (b) **Gated boolean with ALL uses also gated by same selector**: `sel * col * (1 - col) = 0` AND every use of `col` is also gated by `sel` (quote both the boolean constraint and confirm all uses are gated).
  - (c) **Lookup-constrained to binary table**: `sel { col } in precomputed.sel_binary { ... }` (quote exact line). NOTE: only protects on active rows — report if the column is used on inactive rows too.
  - (d) **Derived from boolean operations**: `pol DERIVED = bool_a * bool_b` where both inputs are themselves boolean-constrained (quote the derivation and both input constraints).
  - (e) **Multiplicative-only usage**: The column ONLY appears in `col * expr = 0` forms — never in additive expressions, MUX patterns, or as a permutation/lookup selector (confirm ALL uses are multiplicative).
  You MUST NOT invent novel "it's safe because..." reasoning.

**RULE 3 — Quote or report.** For ANY dismissal, quote the EXACT protecting constraint (file:line and text). If you cannot, REPORT.

**RULE 4 — Severity floor.** When in doubt, report as **High**. Only downgrade with a quoted constraint proving limited impact.

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

### Phase 1: Batch Collection (5 parallel searches)

Run these searches in parallel to collect the two sets needed for diffing:

**Search A — All boolean-candidate columns** (columns that SHOULD be boolean):
```bash
grep -rn "pol commit.*sel_\|pol commit.*is_\|pol commit.*err_\|pol commit.*start\|pol commit.*end\|pol commit.*write\|pol commit.*latch\|pol commit.*first\|pol commit.*last\|@boolean" pil/vm2/ --include="*.pil"
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

**Search D — File inventory** (for coverage tracking):
```bash
find pil/vm2/ -name "*.pil" | sort
```

**Search E — Main `sel` boolean constraints** (CRITICAL — see Phase 2a):
```bash
grep -rn "pol commit sel;" pil/vm2/ --include="*.pil"
grep -rn "sel \* (1 - sel)" pil/vm2/ --include="*.pil"
```

### Phase 2: MANDATORY Main `sel` Check (DO THIS BEFORE ANYTHING ELSE)

> **CRITICAL BLIND SPOT**: The main `sel` column is a committed column like any other. It is NOT automatically boolean. Many files declare `pol commit sel;` without `sel * (1 - sel) = 0`. This is a HIGH-severity finding when `sel` is used in additive expressions or as a permutation/lookup selector.

**Phase 2a — Mechanical check**: For every file that has `pol commit sel;` (from Search E), verify that `sel * (1 - sel) = 0` exists IN THAT SAME FILE (ungated). If it does not exist, immediately add `sel` as a PRELIMINARY FINDING. Do not skip this step. Do not assume `sel` is boolean.

**Phase 2b — Error column check**: For every file with `pol commit err` or `pol commit sel_err` or similar error columns, check whether those error columns have boolean constraints. Error columns used in additive aggregation (`sel_err = err1 + err2 + ...`) without boolean constraints enable error cancellation attacks.

### Phase 3: Set Difference (compute candidates)

From the batch results:
1. Build set DECLARED = columns from Search A **plus all `sel` columns from Phase 2a**
2. Build set CONSTRAINED = columns appearing in Search B + Search C
3. CANDIDATES = DECLARED - CONSTRAINED (these are the columns to investigate)

Typically yields **10-30 candidates**, not hundreds.

### Phase 4: Two-Pass Breadth-First Analysis

> **CRITICAL**: You MUST use a two-pass approach. Phase 4a outputs ALL candidates. Phase 4b dismisses. You may NOT combine scanning and dismissing into a single pass.

**Phase 4a — Preliminary Finding List (NO DISMISSALS)**: For every file (breadth-first, small files first), list every candidate column that lacks a boolean constraint. Output this as a complete table BEFORE any analysis:

| File | Column | Has `col * (1 - col) = 0`? | Has gated boolean? | Has lookup constraint? | Preliminary Finding? |
|------|--------|---------------------------|--------------------|-----------------------|---------------------|

**Every candidate MUST appear in this table.** Mark each as Preliminary Finding = YES unless it clearly has an explicit boolean constraint (quote the line). Do NOT dismiss based on "derived" or "only multiplicative" reasoning yet.

**Phase 4b — Dismissal Pass**: Now go through each Preliminary Finding and attempt to dismiss using ONLY the safe patterns (a)-(e) from the Doctrine. For each dismissal, quote the exact protecting constraint. If you cannot quote a specific constraint, the finding STAYS.

**Phase 4c — Small files first**: Start with PIL files that have fewer than 20 `pol commit` declarations. These are faster to analyze and frequently contain simple missing-boolean bugs.

**Phase 4d — Large files second**: Then process larger files (execution.pil, tx.pil, context.pil, alu.pil). For these, extract ONLY `pol commit` declarations and check each candidate against Search B/C results. Skip reading full constraint bodies unless a candidate is identified.

For each surviving candidate:
1. Is it derived from `sel *` (inherently safe)?
2. Does it appear in additive expressions (exploitable)?
3. Are all uses gated by the same selector (safe)?

**Only report if**: Column lacks boolean constraint AND (appears in additive expression OR used as ungated permutation selector).

### Phase 5: Completeness Reconciliation

**5a — Catch unconventionally-named booleans**:
```bash
grep -roPh "(1 - [a-z_][a-z_0-9]*)" pil/vm2/ --include="*.pil" | sort -u
```
Any column name appearing here that wasn't in Search A is an unconventionally-named boolean. Add it to candidates.

**5b — File coverage table** (MANDATORY):
Using the file list from Search D, output a table:

| File | `pol commit` count | `sel` boolean checked? | Candidates found | Analyzed? |
|------|-------------------|----------------------|-----------------|-----------|

Every file MUST appear in this table. If a file was not analyzed, explain why. **You MUST analyze every PIL file under `pil/vm2/`, `pil/vm2/opcodes/`, `pil/vm2/bytecode/`, and `pil/vm2/trees/`.** If you cannot complete all files, prioritize breadth — a single grep per file for unconstrained boolean candidates is better than deep analysis of 3 files.

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

- Missing boolean on the **main `sel` column** itself (NOT just sub-selectors) — many files declare `pol commit sel;` without `sel * (1 - sel) = 0`
- Missing boolean on memory sub-module selector columns (ecc_mem, poseidon2_mem, to_radix_mem)
- Missing boolean on ALU operation selectors
- Missing boolean on error/failure columns used in additive aggregation (e.g., `sel_bytecode_retrieval_failure` in execution.pil)
- Missing boolean on calldata/calldata_hashing `sel` columns

## Expected Finding Count

A well-executed audit typically finds **5-15 genuine findings**, not 50+. If you're finding significantly more, re-verify against the FALSE POSITIVE FILTERING criteria above. However, do NOT let this expectation prevent you from reporting valid findings — if you find 20 genuine issues, report all 20.

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
