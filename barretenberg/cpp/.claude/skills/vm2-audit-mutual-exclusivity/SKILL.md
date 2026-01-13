---
name: vm2-audit-mutual-exclusivity
description: Audit VM2/AVM PIL files for missing mutual exclusivity constraints. Soundness issue where selectors or error flags that should be mutually exclusive (only one active at a time) lack explicit exclusivity constraints, leading to undefined behavior or constraint bypass.
version: 1.0.0
---

# VM2 Mutual Exclusivity Audit

## Purpose
Detect missing mutual exclusivity constraints on selectors/flags that should never be simultaneously active.

## When to Use
- Auditing PIL files for error handling, operation dispatch, or state machine issues
- Reviewing selector groups that logically require at-most-one semantics

## Severity
- **Soundness** (malicious prover exploits): Critical/High
- **Completeness** (honest prover fails): Low to Critical based on reachability
- Completeness bugs reachable via canonical simulation are **Critical**

## Workflow

### Step 1: Find Selector Groups
```bash
# Error flags
grep -rn "pol commit sel_.*err\|pol commit.*_err" pil/vm2/ --include="*.pil"
# Operation selectors
grep -rn "pol commit sel_op_\|pol commit sel_.*_op" pil/vm2/ --include="*.pil"
# State flags
grep -rn "pol commit state_\|pol commit phase_\|pol commit is_" pil/vm2/ --include="*.pil"
```

### Step 2: Classify Exclusivity Requirements
- **At most one**: Error flags, operation selectors
- **Exactly one** (one-hot): State machine states
- **Multiple allowed**: Independent feature flags (no constraint needed)

### Step 3: Verify Constraints Exist
```bash
# Pairwise: sel_a * sel_b = 0
grep -rn "sel_.*\* sel_" pil/vm2/ --include="*.pil"
# Sum constraint
grep -rn "+ sel_.*= 1\|+ sel_.*\* (1 -" pil/vm2/ --include="*.pil"
```

### Step 4: Check Aggregation Sums
If `sel_total = sel_a + sel_b + sel_c`, verify `sel_total * (1 - sel_total) = 0` exists.

## Vulnerable vs Secure Patterns

**VULNERABLE**: Errors summed without exclusivity
```pil
sel_err = sel_tag_err + sel_div_0_err + sel_overflow_err;
// If both = 1: sel_err = 2 (breaks boolean assumption)
```

**SECURE**: Sum constrained boolean
```pil
pol SEL_ERR_SUM = sel_tag_err + sel_div_0_err + sel_overflow_err;
SEL_ERR_SUM * (1 - SEL_ERR_SUM) = 0;  // At most one
```

## Explicit Exclusivity Patterns

**Pairwise** (n <= 4): `a * b = 0; a * c = 0; b * c = 0;`

**Sum** (many selectors): `SUM * (1 - SUM) = 0`

**Priority encoding**: `sel_a = raw_a; sel_b = (1-raw_a) * raw_b;`

**One-hot**: `a + b + c + d = 1` plus boolean constraints on each

## Implicit Patterns (NOT Vulnerabilities)

**CRITICAL**: Check these before flagging - they enforce exclusivity implicitly.

### A: Shifted Boolean Propagation
```pil
// a + b = c' where c is boolean => a, b mutually exclusive
NOT_END * (is_write_memory_value + is_write_contract_address - is_write_memory_value') = 0;
```

### B: Conflicting Value Constraints
```pil
sel_gt * (cmp_rng_ctr - 4) = 0;   // sel_gt=1 => ctr=4
sel_dec * (cmp_rng_ctr - 1) = 0;  // sel_dec=1 => ctr=1
// Both=1 impossible (ctr can't be 4 and 1)
```

### C: Lookup/Precomputed Table
```pil
sel { phase_value, is_public_call_request, is_teardown, ... }
in precomputed.sel_phase_spec { ... };
// Table structure guarantees exclusivity
```

### D: Algebraic Construction
```pil
sel_cd_copy_start = sel_start * sel_cd_copy;
sel_rd_copy_start = sel_start * (1 - sel_cd_copy);
// x*y and x*(1-y) always exclusive when y is boolean
```

### E: Shared Flag Conflict
```pil
start_read * rw = 0;        // start_read=1 => rw=0
start_write * (1 - rw) = 0; // start_write=1 => rw=1
// Both=1 => rw=0 AND rw=1, impossible
```

### F: Caller-Enforced (Lookup Deduplication)
Each selector used by exactly one caller module - exclusivity by architecture, not constraint.
Verify: search all usages, confirm each selector has single caller.

### Pre-Flag Checklist
Before reporting, verify NONE of these apply:
1. Shifted propagation: `a + b - c' = 0` where c is boolean?
2. Conflicting values: selectors force different values on same column?
3. Lookup enforcement: selectors from constrained precomputed table?
4. Algebraic: `x*y` and `x*(1-y)` pattern?
5. Shared flag: opposite values forced on shared boolean?
6. Caller-enforced: lookup deduplication with single caller per selector?

## Real Bug Example

**PR #18192 - ALU Error States**
```pil
// BEFORE: div_by_0 and sel_tag_err could both be 1
// AFTER: sel_div_0_err * sel_tag_err = 0;
```

## References
- [PR #18192](https://github.com/AztecProtocol/aztec-packages/pull/18192) - ALU Pre-Audit

## Output Format

### Markdown Report (stdout)

| Item | Value |
|------|-------|
| Skill | `vm2-audit-mutual-exclusivity` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding fields**: ID (`vm2-audit-mutual-exclusivity-filename-line-type`), Severity, File:line, Description, Fix

### JSON File (required)

Write `vm2-audit-mutual-exclusivity.json` to output directory:
```json
{
  "skill": "vm2-audit-mutual-exclusivity",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-mutual-exclusivity-filename-123-type",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "Brief description",
    "exploitability": "high",
    "fix": "Suggested fix"
  }]
}
```
For no findings: `{"skill": "vm2-audit-mutual-exclusivity", "status": "COMPLETED_NO_FINDINGS", "findings": []}`