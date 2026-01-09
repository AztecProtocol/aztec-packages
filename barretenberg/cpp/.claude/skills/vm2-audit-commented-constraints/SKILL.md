---
name: vm2-audit-commented-constraints
description: Audit VM2/AVM PIL files for commented-out security constraints. Critical soundness issue where security-critical constraints are disabled via FIXME, TODO, or comments, often indicating incomplete implementations that create severe vulnerabilities while still compiling and passing tests.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Commented-Out Constraints Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for commented-out security constraints. Security-critical constraints that are disabled via comments (FIXME, TODO, or just commented out) often indicate incomplete implementations that create severe vulnerabilities.

## Why This is Important

This is often the **most dangerous** vulnerability type because:
- **The constraint was identified as necessary**: Someone knew it was needed
- **Someone intentionally disabled it**: Not an oversight, but deliberate
- **Easy to forget during review**: Comments blend into the background
- **Code still compiles/passes tests**: No obvious failure signal
- **False sense of security**: Boolean constraint may exist without aggregation

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Scan for FIXME/TODO Comments

```bash
# Find all FIXME/TODO/HACK comments in PIL files
grep -rn "FIXME\|TODO\|HACK\|TEMPORARY\|DISABLED\|XXX\|WORKAROUND" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Scan for Commented-Out Constraints

```bash
# Find lines that look like commented-out constraints
grep -rn "^[[:space:]]*//.*=" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "pol\|include\|Example\|e.g."

# Find commented-out constraint blocks
grep -rn "^[[:space:]]*/\*" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find conditional compilation that disables constraints
grep -rn "#if 0\|#ifdef DISABLE\|#ifndef ENABLE" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Assess Each Finding

For each commented-out constraint or FIXME/TODO:

1. **Is this security-critical?**
   - Error aggregation constraints
   - Boolean constraints
   - Implication constraints
   - Propagation constraints
   - Zero-check formulas

2. **What happens without this constraint?**
   - Can a prover bypass validation?
   - Can errors be suppressed?
   - Can state be corrupted?

3. **Is there a valid reason it's disabled?**
   - Incomplete feature implementation
   - Performance optimization pending
   - Bug workaround

4. **When will it be re-enabled?**
   - Is there a tracking issue?
   - Is there a timeline?

### Step 4: Check for Boolean-Only Error Flags

A common pattern is error flags that only have boolean constraints but missing aggregation:

```bash
# Find error-related selectors
grep -rn "sel_err\|sel_.*_err\|_error\|parsing_err" barretenberg/cpp/pil/vm2/ --include="*.pil"

# For each, verify aggregation exists (not just boolean)
grep -rn "sel_err.*=\|sel_err - " barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Suspicious pattern:
```pil
// SUSPICIOUS: Error flag only has boolean constraint
sel_error * (1 - sel_error) = 0;
// Missing: sel_error = err_a + err_b + err_c;
```

### Step 5: Cross-Reference with Individual Errors

For each aggregate error flag, verify all individual errors are included:

```bash
# Find individual error flags
grep -rn "pol commit.*_err\|pol commit err_\|out_of_range\|overflow" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Verify they're all aggregated
grep -rn "sel_err.*=.*+" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Commented-Out Aggregation

```pil
// VULNERABLE: Critical constraint commented out
sel_parsing_err * (1 - sel_parsing_err) = 0;  // Only boolean constraint!
```

### Vulnerable Pattern: Partial Implementation TODO

```pil
// VULNERABLE: Constraint acknowledged but missing
```

### Secure Pattern: Complete Implementation

```pil
// SECURE: All constraints present
#[PARSING_ERR_BOOL]
sel_parsing_err * (1 - sel_parsing_err) = 0;
#[PARSING_ERR_AGGREGATION]
sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;
```

## Historical Examples

### Example 1: Instruction Fetching Error Aggregation

```pil
// instr_fetching.pil
// FIXME: constrain this again once all execution opcodes are supported.
// sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;

// Only this constraint exists:
sel_parsing_err * (1 - sel_parsing_err) = 0;
```
**Impact**: CRITICAL - Prover can set `sel_parsing_err = 0` even when individual error flags are 1, bypassing error propagation to execution layer. Could claim valid instruction at invalid PC.

## Prevention Checklist

When reviewing PRs that add FIXME/TODO:
1. Is this a security-critical constraint?
2. Is there an issue tracking this?
3. What's the plan to enable it?
4. Can we add a test that will fail when it's missing?
5. Should this block the PR?

---

## REQUIRED OUTPUT FORMAT

**IMPORTANT**: Your response MUST end with this machine-readable section.

### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format

For each finding, include:
- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### Machine-Readable JSON (REQUIRED)

You MUST include this exact format at the end of your response:

<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "{skill-name}-{file}-{line}-{subtype}",
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
<!-- END MACHINE-READABLE FINDINGS -->

For no findings, use:
<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```
<!-- END MACHINE-READABLE FINDINGS -->
