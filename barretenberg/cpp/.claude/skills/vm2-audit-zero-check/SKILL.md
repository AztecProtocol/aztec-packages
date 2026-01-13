---
name: vm2-audit-zero-check
description: Audit VM2/AVM PIL files for zero-check pattern violations. Soundness issue where the pattern used to create boolean indicators for equality checks (e.g., "e = 1 iff x = 0") is implemented incorrectly, allowing bypass of division-by-zero checks, fake equality comparisons, and conditional logic manipulation.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Zero-Check Pattern Audit

## Purpose
Detect incorrectly implemented zero-check patterns (`e = 1 iff x = 0`) that enable division-by-zero bypass, fake equality claims, and conditional logic manipulation.

## Severity
- **Soundness** (prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low to Critical based on reachability
- **Key**: Completeness bugs reachable via canonical simulation/tracegen are **Critical**

## Correct Pattern

```pil
// Goal: e = 1 iff x = 0
pol commit x, e, inv;  // value, indicator, inverse

#[E_BOOL]
e * (1 - e) = 0;

#[ZERO_CHECK]
x * (e * (1 - inv) + inv) - 1 + e = 0;

// x = 0: 0 * (...) - 1 + e = 0  =>  e = 1 (correct)
// x != 0, inv = 1/x: x * (1/x) - 1 + e = 0  =>  e = 0 (correct)
// x != 0, e = 1: x * (1 - inv + inv) - 1 + 1 = x != 0 (violation!)
```

**Variants**: Equality (`a == b`) uses `diff = a - b`. Division-by-zero uses divisor. Same pattern.

## Workflow

### Step 1: Find Zero-Check Patterns
```bash
# Search indicator names
grep -rn "inv\|eq.*bool\|is_zero\|div_by_0\|_eq\|is_eq" pil/vm2/ --include="*.pil"
# Search formula pattern
grep -rn "(1 - inv)\|* inv.*- 1\|inverse" pil/vm2/ --include="*.pil"
```
**Manual review required** for zero/one/equality checks - grep alone insufficient.

### Step 2: Verify Three Required Components
For each pattern:
1. **Boolean constraint**: `e * (1 - e) = 0`
2. **Zero-check relation**: `x * (e * (1 - inv) + inv) - 1 + e = 0`
3. **Inverse column** exists and correctly used

### Step 3: Verify Indicator Usage
- `e = 1` => `x` must be 0
- `e = 0` => `x` must be non-zero

### Step 4: Check Tracegen
```bash
grep -rn "inverse\|inv =\|is_zero\|eq =" src/barretenberg/vm2/tracegen/<component>*.cpp
```
Verify: `e = 1 iff x == 0`, `inv = 1/x` when `x != 0`

## Vulnerable Patterns

### 1. Missing Boolean Constraint
```pil
// VULNERABLE: e not constrained boolean - can be any field value
x * (e * (1 - inv) + inv) - 1 + e = 0;
```

### 2. Incorrect Formula (Missing Inner Term)
```pil
// VULNERABLE: Wrong formula
x * inv - 1 + e = 0;
// x != 0, e = 1: prover sets inv = 0, then x*0 - 1 + 1 = 0. Passes!
```

### 3. Missing Inverse Constraint
```pil
// VULNERABLE: x = 0 doesn't force e = 1
x * e = 0;
(1 - e) * (x * inv - 1) = 0;
```

### 4. Gated Boolean, Ungated Usage
```pil
// VULNERABLE: Bool only enforced when sel = 1
sel * e * (1 - e) = 0;
e + other_value = 0;  // Uses e when sel = 0!
```

## Common Locations
ALU (division), memory (address equality), control flow (conditional jumps), comparisons (equality case), error handling

## Output Format

### Markdown Report (stdout)

| Item | Value |
|------|-------|
| Skill | `vm2-audit-zero-check` |
| Target | `{path}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**: ID `vm2-audit-zero-check-filename-123-issue-type`, Severity, File:line, Description, Fix

### JSON File (REQUIRED)
Write `vm2-audit-zero-check.json` to specified output directory:
```json
{
  "skill": "vm2-audit-zero-check",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-zero-check-filename-123-issue-type",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "Brief description",
    "exploitability": "high",
    "fix": "Suggested fix"
  }]
}
```