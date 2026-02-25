---
name: vm2-audit-t4-zero-check
description: Audit VM2/AVM PIL files for zero-check pattern violations. Soundness issue where the pattern used to create boolean indicators for equality checks (e.g., "e = 1 iff x = 0") is implemented incorrectly, allowing bypass of division-by-zero checks, fake equality comparisons, and conditional logic manipulation.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Zero-Check Pattern Audit

## Purpose
Detect incorrectly implemented zero-check patterns (`e = 1 iff x = 0`) that enable division-by-zero bypass, fake equality claims, and conditional logic manipulation.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every zero-check pattern (`e = 1 iff x = 0`) where `e` lacks a boolean constraint is a PRELIMINARY FINDING. Every place where `inv` is used without proper zero-check setup is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Complete zero-check exists**: Both the algebraic equation AND `e * (1 - e) = 0` are present (quote both with file:line).
  - (b) **Inverse is correctly constrained**: The inverse variable satisfies `x * inv = 1 - e` AND `e * x = 0` or equivalent (quote both constraints).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

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

### Step 0: Enumerate ALL PIL Files With Zero-Check Patterns (MANDATORY)

> **CRITICAL**: Before deep-diving any single file, enumerate ALL files with inverse or indicator columns.

```bash
# Find all files with inverse/indicator patterns
grep -rl "inv\|is_zero\|is_eq\|div_by_0\|_eq_" pil/vm2/ --include="*.pil" | sort

# Find all files with the zero-check formula
grep -rl "(1 - inv)\|inverse" pil/vm2/ --include="*.pil" | sort
```

Build a master checklist of ALL files with zero-check patterns. You MUST check every one.

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

### Step 4: Check Tracegen Populates All Three Columns

For each zero-check triple `(value, indicator, inverse)` found in PIL, verify ALL THREE are populated in tracegen:

```bash
# Find the tracegen file for the component
grep -rn "<indicator_name>\|<inverse_name>" src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

**Check for each column**:
1. **Value column**: Is it set? (Usually yes — it's the input to the check)
2. **Indicator column** (`e`): Is it set to `1` when value is zero, `0` otherwise?
3. **Inverse column** (`inv`): Is it set to `1/value` when value is non-zero?

A zero-check formula can be structurally correct in PIL but still fail if tracegen never populates the inverse or indicator column. The default value (0) for an unpopulated inverse column will cause the honest prover to fail verification whenever the value is non-zero.

**Severity**: Missing tracegen population of a zero-check column is a **completeness** bug — High or Critical if reachable on valid inputs.

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
| Skill | `vm2-audit-t4-zero-check` |
| Target | `{path}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**: ID `vm2-audit-t4-zero-check`, Severity, File:line, Description, Fix

### JSON File (REQUIRED)
Write `vm2-audit-t4-zero-check.json` to specified output directory:
```json
{
  "skill": "vm2-audit-t4-zero-check",
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