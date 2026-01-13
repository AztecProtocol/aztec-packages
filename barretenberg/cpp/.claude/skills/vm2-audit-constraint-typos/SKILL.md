---
name: vm2-audit-constraint-typos
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

## Key Example (PR #19404)

```pil
// VULNERABLE: constraint name says SIZE but constrains addr
#[CD_SIZE_ENQUEUED_CALL_IS_ZERO]
enqueued_call_start * parent_calldata_addr = 0;  // WRONG!

// FIXED:
enqueued_call_start * parent_calldata_size = 0;  // CORRECT
```

## Typo Patterns

### addr/size Confusion
- `parent_calldata_addr` vs `parent_calldata_size`
- `last_child_returndata_addr` vs `last_child_returndata_size`
- `memory_addr` vs `memory_size`

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

### Step 1: Match Constraint Names to Columns
```bash
grep -rn "#\[.*\]" pil/vm2/ --include="*.pil"
```
For each constraint:
1. Parse name hints (e.g., `CD_SIZE` implies calldata size)
2. Verify actual constrained column matches the name
3. Flag mismatches between name hint and column

### Step 2: Cross-Reference Comments
```bash
grep -B1 "#\[" pil/vm2/<component>.pil | grep -v "^--$"
```
Check: Does comment describe what's actually constrained?

### Step 3: Audit Similar Column Groups
```bash
grep "pol commit\|pol " pil/vm2/<component>.pil | sed 's/.*pol \(commit \)\?//' | sort | uniq
```
For each group (e.g., `foo_addr`, `foo_size`):
- Find all constraints involving any group member
- Verify each targets the semantically correct column

### Step 4: Check Initialization Constraints
```bash
grep -rn "start\|first\|init" pil/vm2/ --include="*.pil"
```
High-risk for typos. Verify ALL columns that need initialization have correct constraints.

### Step 5: Check Propagation Constraints
```bash
grep -rn "' -\|')" pil/vm2/ --include="*.pil"
```
Verify propagation targets match semantic intent.

### Step 6: Cross-Reference with Tracegen
```bash
grep -rn "column_name\s*=" src/barretenberg/vm2/tracegen/<component>*.cpp
```
Verify tracegen sets values matching constraint expectations.

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
| Skill | `vm2-audit-constraint-typos` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-constraint-typos-filename-line-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write `vm2-audit-constraint-typos.json` to the output directory:

```json
{
  "skill": "vm2-audit-constraint-typos",
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
