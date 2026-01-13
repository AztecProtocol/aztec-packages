---
name: vm2-audit-missing-boolean
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

### Step 1: Find Boolean Columns
```bash
grep -rn "@boolean\|pol commit.*sel\|pol commit is_" pil/vm2/ --include="*.pil"
```
Also review column usage - some booleans lack naming conventions.

### Step 2: Verify Constraints Exist

For each boolean column, verify one applies:
1. **Explicit**: `col * (1 - col) = 0;`
2. **Lookup to binary table**: Document with comment
3. **Derived from booleans**: Prove derivation preserves boolean property

```bash
grep -rn "my_selector.*1 - my_selector" pil/vm2/ --include="*.pil"
```

### Step 3: Check Gated Boolean Constraints

Gated constraints acceptable IF all uses also gated:
```pil
// OK: Gated constraint, gated uses
sel * my_bool * (1 - my_bool) = 0;
sel * (output - my_bool * value) = 0;

// VULNERABLE: Gated constraint, ungated use
sel * my_bool * (1 - my_bool) = 0;
other_expr + my_bool = 0;  // UNGATED - exploitable!
```

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

## Historical Bugs

- **PR #19256**: ecc_mem.pil, to_radix_mem.pil - sel missing boolean constraint
- **PR #18192**: ALU sel_op_shl, sel_op_shr, sel_shift_ops_no_overflow unconstrained

## REQUIRED OUTPUT FORMAT

### 1. Markdown Report (stdout)

#### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-missing-boolean` |
| Target | `{path}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format
- **ID**: `vm2-audit-missing-boolean-{filename}-{line}-{issue-type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write `vm2-audit-missing-boolean.json` to output directory:
```json
{
  "skill": "vm2-audit-missing-boolean",
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

For no findings: `{"skill": "vm2-audit-missing-boolean", "status": "COMPLETED_NO_FINDINGS", "findings": []}`
