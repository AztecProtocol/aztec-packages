---
name: vm2-audit-dead-columns
description: Audit VM2/AVM PIL files for dead columns - columns that are declared but never used in constraints, lookups, or permutations. This can indicate incomplete constraints, missing security checks, or leftover code from refactoring that may hide soundness issues.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Dead Columns Audit

Audits for dead columns - columns declared (`pol commit`) but never meaningfully used. Can indicate incomplete constraints, missing lookups, forgotten security checks, or refactoring leftovers. **Used**: appears in constraints, lookups/permutations, intermediate polys, or as lookup destination. **Dead**: only declared, only assigned in tracegen, or only in comments/disabled code.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: List All Declared Columns

```bash
# Find all committed polynomials in a component
grep -n "pol commit" barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 2: For Each Column, Search for Usage

```bash
# Search for column usage in same file
grep -n "column_name" barretenberg/cpp/pil/vm2/<component>.pil | grep -v "pol commit"

# Search for column usage across all PIL files (for shared columns)
grep -rn "component\\.column_name" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Check for Virtual Trace Sharing

Some traces share column namespaces. Check if the column is used in related files:

```bash
# Find files that might share the namespace
grep -rln "namespace.*component" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Check each related file for column usage
```

### Step 4: Check Lookup/Permutation Destinations

A column might be used as a lookup destination from another trace:

```bash
# Find lookups INTO this trace
grep -rn "in component\\.sel\\|in component\\." barretenberg/cpp/pil/vm2/ --include="*.pil"

# Check what columns are in the destination tuple
```

### Step 5: Verify Tracegen Sets the Column

Even if constrained, verify tracegen actually sets it:

```bash
# Find column assignment in tracegen
grep -rn "row\\.column_name\\|column_name =" barretenberg/cpp/src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

### Step 6: Categorize Dead Columns

For each dead column found, determine:
1. **Intentionally unused**: Placeholder for future work (should have comment)
2. **Accidentally unused**: Bug - constraint missing
3. **Refactoring leftover**: Should be removed
4. **Lookup destination**: Used by other traces (not dead)

## Patterns

### Vulnerable Pattern: Declared But Unused

```pil
// VULNERABLE: Column never constrained
pol commit secret_value;
// Prover can set secret_value to anything!
// If this affects any computation, it's exploitable
```

### Vulnerable Pattern: Set But Not Constrained

```pil
// VULNERABLE: Tracegen sets it, but PIL doesn't verify
pol commit computed_hash;
// No constraint that computed_hash is correct!
```

```cpp
// Tracegen computes and sets
row.computed_hash = poseidon2(inputs);
// But prover could put any value here
```

### Vulnerable Pattern: Commented Constraint

```pil
// VULNERABLE: Constraint was disabled
pol commit balance;
// #[BALANCE_CHECK]
// sel * (balance - expected_balance) = 0;
// Without this, balance is unconstrained!
```

### Valid Pattern: Lookup Destination

```pil
// VALID: Used as lookup destination
pol commit precomputed_value;
// No local constraints needed - other traces look this up
```

### Valid Pattern: Intermediate Storage

```pil
// VALID: Used in intermediate then constrained
pol commit raw_value;
pol PROCESSED = raw_value * factor;
sel * (PROCESSED - expected) = 0;  // raw_value is constrained through PROCESSED
```

### Valid Pattern: Conditional Usage

```pil
// VALID: Used conditionally
pol commit optional_check;
sel_special * (optional_check - expected) = 0;
// Constrained when sel_special = 1
```

## Automated Detection Script

```bash
#!/bin/bash
# Find potentially dead columns in a PIL file

PIL_FILE="$1"
if [ -z "$PIL_FILE" ]; then
    echo "Usage: $0 <pil_file>"
    exit 1
fi

echo "=== Declared columns in $PIL_FILE ==="
COLUMNS=$(grep "pol commit" "$PIL_FILE" | sed 's/.*pol commit \([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/')

for col in $COLUMNS; do
    # Count non-declaration uses in same file
    LOCAL_USES=$(grep -c "$col" "$PIL_FILE" | grep -v "pol commit")

    # Count uses in other PIL files
    OTHER_USES=$(grep -rn "$col" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "$PIL_FILE" | wc -l)

    TOTAL=$((LOCAL_USES + OTHER_USES - 1))  # -1 for declaration

    if [ "$TOTAL" -le 1 ]; then
        echo "POTENTIALLY DEAD: $col (uses: $TOTAL)"
    fi
done
```

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-dead-columns` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-dead-columns-filename-123-issue-type` (MUST use full skill name: `vm2-audit-dead-columns`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-dead-columns.json` file to the output directory with:

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

For no findings:
```json
{
  "skill": "vm2-audit-dead-columns",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.