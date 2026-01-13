---
name: vm2-audit-dead-columns
description: Audit VM2/AVM PIL files for dead columns - columns that are declared but never used in constraints, lookups, or permutations. This can indicate incomplete constraints, missing security checks, or leftover code from refactoring that may hide soundness issues.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.3.0
---

# VM2 Dead Columns Audit

## Purpose
Find columns declared (`pol commit`) but never meaningfully used - indicates incomplete constraints, missing security checks, or refactoring leftovers.

## Definitions
- **Meaningfully Used**: appears in lookups/permutations, intermediate polys feeding constraints, or as lookup destination from other traces
- **Dead**: only declared, only in tracegen, only in comments, OR constrained to constant but never used in interactions

**Key principle**: Dead column that should be constrained = soundness bug (prover sets arbitrary values).

## Categories

| Category | Severity | Notes |
|----------|----------|-------|
| Security-critical unconstrained | Critical | Affects security, no constraints |
| Logic-critical unconstrained | High | Affects computation, no constraints |
| Constrained-but-unused | Low | Constrained to constant, never in lookups |
| Lookup destination | Not a bug | Used by lookups from other traces |
| Intermediate storage | Not a bug | Used in intermediate poly then constrained |
| Placeholder (with TODO) | Low | Documented future use |
| Refactoring leftover | Low | Should remove, not exploitable |

## Workflow

**CRITICAL**: PIL files have 50-200+ columns. Do NOT grep per-column. Read file once, analyze in memory.

### Step 1: Read PIL File Once
Extract from single read:
1. All `pol commit <name>` declarations with line numbers
2. All usages of each column name

### Step 2: In-Memory Usage Analysis
For each column, check:

1. **Lookups/permutations?** - `{ column_name }` patterns = meaningful use
2. **Intermediate polys?** - `pol ... = ... column_name` = meaningful use
3. **ONLY constant-assignment?** - `sel * (CONSTANT - column_name) = 0` with no other use = **constrained-but-unused**

**Candidates**: columns with only declaration, OR only declaration + constant-assignment

### Step 3: Batch Cross-File Check
One search for all lookups into namespace:
```bash
grep -rn "in <namespace>\\." pil/vm2/ --include="*.pil" | head -100
```

### Step 4: Batch Tracegen Check
```bash
grep -n "row\\." src/barretenberg/vm2/tracegen/<component>*.cpp | head -200
```

### Step 5: Categorize
- Tracegen sets value, PIL unconstrained → **Critical/High**
- Constrained to constant, never in lookups → **Low**
- Is lookup destination → **Not a bug**
- Has TODO/FIXME → **Low placeholder**

## Patterns

### VULNERABLE: Declared But Unused
```pil
pol commit secret_value;
// No constraints! Prover sets arbitrary value.
```

### VULNERABLE: Set But Not Constrained
```pil
pol commit computed_hash;
// Tracegen: row.computed_hash = poseidon2(inputs);
// PIL: no constraint verifying correctness!
```

### LOW: Constrained-But-Unused
```pil
pol commit domain_separator;
sel * (constants.DOMAIN_SEP - domain_separator) = 0;
// Constrained but nothing reads it - no purpose
```

### VALID: Lookup Destination
```pil
pol commit precomputed_value;
// Other traces: { ... } in precomputed.sel { precomputed_value }
```

### VALID: Intermediate Storage
```pil
pol commit raw_value;
pol PROCESSED = raw_value * factor;
sel * (PROCESSED - expected) = 0;  // raw_value constrained through PROCESSED
```

## Anti-Pattern: Per-Column Grepping

**DO NOT**: grep per-column (10+ minute runtimes with 76 columns)

**DO**: Read once → analyze in memory → batch grep for namespace lookups and tracegen

## Output Format

### Markdown Report (stdout)

| Item | Value |
|------|-------|
| Skill | `vm2-audit-dead-columns` |
| Target | `{path}` |
| Findings | `{count by severity or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

Each finding: ID, Severity, File:line, Description, Fix

### JSON File (required)
Write `vm2-audit-dead-columns.json`:
```json
{
  "skill": "vm2-audit-dead-columns",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{"id": "...", "severity": "critical", "file": "...", "line": 123, "description": "...", "fix": "..."}]
}
```
