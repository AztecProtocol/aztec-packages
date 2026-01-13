---
name: vm2-audit-dead-columns
description: Audit VM2/AVM PIL files for dead columns - columns that are declared but never used in constraints, lookups, or permutations. This can indicate incomplete constraints, missing security checks, or leftover code from refactoring that may hide soundness issues.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
version: 1.2.0
---

# VM2 Dead Columns Audit

Audits for dead columns - columns declared (`pol commit`) but never meaningfully used. Can indicate incomplete constraints, missing lookups, forgotten security checks, or refactoring leftovers.

**Meaningfully Used**: appears in lookups/permutations, intermediate polys that feed constraints, or as lookup destination from other traces.
**Dead**: only declared, only assigned in tracegen, only in comments/disabled code, **OR constrained to constant but never used in interactions**.

## Severity Assessment

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: A dead column that should be constrained is a soundness bug - prover can set arbitrary values.

## When Usually NOT Needed

- Columns that are lookup destinations from other traces
- Columns explicitly documented as placeholders for future work
- If unsure whether a column is a lookup destination, still audit but note uncertainty

## Dead Column Categories

| Category | Severity | Action |
|----------|----------|--------|
| **Security-critical unconstrained** | Critical | Column affects security but has no constraints |
| **Logic-critical unconstrained** | High | Column affects computation but has no constraints |
| **Constrained-but-unused** | Low | Column constrained to constant but never used in lookups/permutations |
| **Lookup destination** | Not a bug | Used by lookups from other traces |
| **Intermediate storage** | Not a bug | Used in intermediate poly then constrained |
| **Intentional placeholder** | Low | Has comment indicating future use |
| **Refactoring leftover** | Low | Should be removed, but not exploitable |

## Workflow (Optimized for Speed)

**IMPORTANT**: PIL files can have 50-200+ columns. Do NOT grep per-column - this causes extreme slowness. Instead, read files once and analyze in memory.

### Step 1: Read the PIL File Once

Use the Read tool to load the entire PIL file. From this single read:
1. Extract all `pol commit <name>` declarations
2. Note line numbers for each declaration
3. Scan the rest of the file for each column name's usage

### Step 2: In-Memory Usage Analysis

For each column found in Step 1, analyze HOW it's used (from the already-loaded content):

**Check 1: Does it appear in lookups/permutations?**
- Look for `{ column_name }` or `column_name }` patterns
- These are meaningful uses - column value is actually utilized

**Check 2: Does it appear in intermediate polys?**
- Look for `pol ... = ... column_name`
- These feed into constraints - meaningful use

**Check 3: Does it ONLY appear in constant-assignment constraints?**
- Pattern: `sel * (CONSTANT - column_name) = 0`
- If this is the ONLY usage (besides declaration), the column is **constrained-but-unused**
- The constraint sets the value, but nothing reads it

**Candidates are columns that:**
- Have only ONE occurrence (declaration only), OR
- Have TWO occurrences where the second is only a constant-assignment constraint

### Step 3: Batch Cross-File Check (Single Search)

For candidates from Step 2, do ONE search for the namespace pattern:

```bash
# Single search for all cross-file lookups into this namespace
grep -rn "in <namespace>\\." pil/vm2/ --include="*.pil" | head -100
```

This finds ALL lookups into the namespace. Check if any candidate columns appear in lookup destinations.

### Step 4: Batch Tracegen Check (Single Search)

```bash
# Single search for all row assignments in the component's tracegen
grep -n "row\\." src/barretenberg/vm2/tracegen/<component>*.cpp | head -200
```

Cross-reference with candidates to see which are set in tracegen but unconstrained in PIL.

### Step 5: Categorize Candidates

For remaining candidates after Steps 3-4, determine category:
- If tracegen sets a meaningful value but PIL doesn't constrain it → **Vulnerability (Critical/High)**
- If column constrained to constant but never in lookups/permutations → **Constrained-but-unused (Low)**
- If column is a lookup destination → **Not a bug**
- If column has TODO/FIXME comment → **Placeholder (Low)**
- If column appears unused everywhere → **Refactoring leftover (Low)**

## Pattern Checklist

### VULNERABLE: Declared But Unused
```pil
pol commit secret_value;
// No constraints! Prover can set secret_value to anything.
```

### VULNERABLE: Set But Not Constrained
```pil
pol commit computed_hash;
// Tracegen computes: row.computed_hash = poseidon2(inputs);
// But PIL has no constraint verifying computed_hash is correct!
```

### LOW: Constrained-But-Unused (Code Hygiene)
```pil
pol commit domain_separator;
sel * (constants.DOMAIN_SEP - domain_separator) = 0;
// Column is constrained to a constant, but never used in any lookup/permutation!
// The constraint serves no purpose - nothing reads domain_separator.
// Often indicates TODO workaround or incomplete implementation.
```

### VALID: Lookup Destination
```pil
pol commit precomputed_value;
// No local constraints, but other traces do:
// { ... } in precomputed.sel { precomputed_value }
```

### VALID: Intermediate Storage
```pil
pol commit raw_value;
pol PROCESSED = raw_value * factor;
sel * (PROCESSED - expected) = 0;
// raw_value is constrained through PROCESSED
```

## Anti-Pattern: Per-Column Grepping

**DO NOT** do this (causes 10+ minute runtimes):
```
For each of the 76 columns:
    grep for column in file
    grep for column in other files
    grep for column in tracegen
```

**DO** this instead:
```
Read file once → extract all columns → analyze in memory
One grep for namespace lookups → check candidates
One grep for tracegen → check candidates
```

## REQUIRED OUTPUT FORMAT

### 1. Markdown Report (stdout)

| Item | Value |
|------|-------|
| Skill | `vm2-audit-dead-columns` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-dead-columns-filename-123-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write `vm2-audit-dead-columns.json` to the output directory:

```json
{
  "skill": "vm2-audit-dead-columns",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-dead-columns-filename-123-issue-type",
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
