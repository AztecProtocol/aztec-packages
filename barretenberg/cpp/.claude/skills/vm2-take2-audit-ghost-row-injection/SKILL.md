---
name: vm2-take2-audit-ghost-row-injection
description: Test if a selector-outside-active vulnerability is exploitable via ghost row injection. When a sub-selector can fire a PERMUTATION from inactive rows, test if an attacker can create legitimate destination rows to match the ghost source. This is the attack that succeeded against sstore.pil.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Ghost Row Injection Audit

## Purpose
Test exploitability of selector-outside-active vulnerabilities via ghost row injection on PERMUTATIONS.

## When to Use
- After `vm2-audit-selector-outside-active` finds unconstrained sub-selector firing a **PERMUTATION**
- Testing if attacker can inject ghost source rows matching legitimate destination rows
- Note: "Destination protection" (`write * (1 - sel) = 0`) only prevents ghost destinations, not ghost sources

## When NOT to Use
- The interaction is a LOOKUP (not exploitable this way)
- Sub-selector is already constrained by `sub_sel * (1 - main_sel) = 0`

## Workflow

### 1. Identify the Permutation
Find the permutation fired by the unconstrained sub-selector:
```bash
grep -rn "in.*{" pil/vm2/<component>.pil | grep -v lookup
```

### 2. Find Destination Trace
Locate the destination trace and its simulation gadget in tracegen.

### 3. Verify Gadget Accepts Arbitrary Values
Check if simulation gadget can create rows with attacker-controlled values.

### 4. Analyze Blocking Factors

| Factor | How It Blocks | Bypass |
|--------|---------------|--------|
| CLK mismatch | Source uses `precomputed.clk`, dest uses committed `clk` | Place ghost row at row N = destination's clk |
| START_CONDITION | `sel' * (1 - sel) * (1 - first_row) = 0` requires continuity | Trace builder handles automatically |
| Crypto constraints | Destinations require valid hashes/proofs | Use simulation gadgets |

### 5. Document Result
- Attack succeeds: **CRITICAL** finding
- Attack blocked: Document the blocking factor

## Fix Pattern

```pil
// Vulnerable: sub_selector unconstrained when main_sel = 0
pol commit sub_selector;
main_sel * (condition - sub_selector) = 0;

// Fixed: force sub_selector = 0 when main_sel = 0
#[SUB_SELECTOR_REQUIRES_MAIN_SEL]
sub_selector * (1 - main_sel) = 0;
```

## Reference: SSTORE Attack

The attack that proved this pattern (from `storage_write.test.cpp`):
1. Used PublicDataTreeCheck simulation gadget with malicious slot/value/address
2. Built public_data_check trace (legitimate destination rows)
3. Injected ghost sstore row at row 0
4. All relations and permutations PASSED - **Attack SUCCEEDED**

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low (theoretical) to Critical (blocks valid inputs)

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-take2-audit-ghost-row-injection` |
| Target | `{path}` |
| Files Scanned | `{count}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-take2-audit-ghost-row-injection-{filename}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-take2-audit-ghost-row-injection",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-take2-audit-ghost-row-injection-filename-123-type",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "Description",
    "exploitability": "high",
    "fix": "Suggested fix"
  }]
}
```
