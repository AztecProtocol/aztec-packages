---
name: vm2-audit-ghost-row-injection
description: Test if a selector-outside-active vulnerability is exploitable via ghost row injection. When a sub-selector can fire a PERMUTATION from inactive rows, test if an attacker can create legitimate destination rows to match the ghost source. This is the attack that succeeded against sstore.pil.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Ghost Row Injection Audit

Tests if a selector-outside-active vulnerability is exploitable via ghost row injection. Use after `vm2-audit-selector-outside-active` finds a missing implication constraint.

**Key insight**: "Destination protection" (`write * (1 - sel) = 0`) only prevents ghost DESTINATIONS, not ghost SOURCES matching legitimate destinations.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify Attack Vector

Given a sub-selector without implication constraint:

```bash
# Find what permutation it fires
grep -n "sub_selector.*{" pil/vm2/<component>.pil | grep -v lookup

# Find the destination trace
```

### Step 2: Assess Exploitability

Check if attacker can create legitimate destination rows:

| Check | Result | Severity |
|-------|--------|----------|
| Destination has simulation gadget? | Yes → attack likely works | **CRITICAL** |
| CLK in permutation tuple? | Align ghost row number with dest clk | Bypassable |
| Cryptographic constraints? | Simulation gadgets handle this | Bypassable |

**If simulation gadgets exist for the destination trace, the attack almost certainly works.**

## Common Blocking Factors (Usually Bypassable)

- **CLK mismatch**: Place ghost row at row N where N = destination's clk value
- **START_CONDITION**: Destination trace builder handles automatically
- **Crypto constraints**: Simulation gadgets produce valid hashes/proofs

## Real-World Example: SSTORE Attack

```cpp
// Ghost sstore row: sel_execute_sstore=0, sel_write_public_data=1
// Legitimate public_data_check row created via simulation gadget
// Ghost source matches legitimate destination → Attack SUCCEEDED
```

**Test**: `storage_write.test.cpp:NegativeFullAttackWithAllTraces`

## Fix Pattern

```pil
// Add implication constraint
sub_selector * (1 - main_sel) = 0;
```

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-ghost-row-injection` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-ghost-row-injection-filename-123-issue-type` (MUST use full skill name: `vm2-audit-ghost-row-injection`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-ghost-row-injection.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-ghost-row-injection",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-ghost-row-injection-filename-123-issue-type",
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
  "skill": "vm2-audit-ghost-row-injection",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.