---
name: vm2-audit-ghost-row-injection
description: Test if a selector-outside-active vulnerability is exploitable via ghost row injection. When a sub-selector can fire a PERMUTATION from inactive rows, test if an attacker can create legitimate destination rows to match the ghost source. This is the attack that succeeded against sstore.pil.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Ghost Row Injection Audit Skill

## Overview

This skill tests if a selector-outside-active vulnerability is exploitable via ghost row injection. Use this after `vm2-audit-selector-outside-active` finds a missing implication constraint where the unconstrained sub-selector fires a **PERMUTATION** (not lookup). This is the specific attack pattern that succeeded against sstore.pil.

## Why This is Important

Ghost row injection allows attackers to fire permutations from inactive rows (where `main_sel=0`) and match them with legitimate destination rows created via simulation gadgets. This bypasses the common misconception that "destination protection" (`write * (1 - sel) = 0`) prevents attacks - that constraint only prevents ghost DESTINATIONS, not ghost SOURCES matching legitimate destinations.

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify the Permutation

Find the permutation fired by the unconstrained sub-selector from the `selector-outside-active` finding.

```bash
# Find permutation definitions
grep -rn "in.*{" pil/vm2/<component>.pil | grep -v lookup
```

### Step 2: Find the Destination Trace

Identify the destination trace and its simulation gadget in tracegen.

### Step 3: Verify Gadget Accepts Arbitrary Values

Check if the simulation gadget can be used to create rows with attacker-controlled values.

### Step 4: Analyze Blocking Factors

Check for factors that might prevent the attack (CLK mismatch, START_CONDITION, cryptographic constraints).

### Step 5: Document Attack Feasibility

If attack succeeds: CRITICAL finding. If blocked: document the blocking factor.

## Common Blocking Factors

### CLK Mismatch
The permutation tuple often includes clock values:
- Source uses `precomputed.clk` (row number)
- Destination uses committed `clk` column

**Solution**: Place ghost row at row N where N equals the destination's clk value.

### START_CONDITION
Some traces have: `sel' * (1 - sel) * (1 - first_row) = 0`

This requires trace continuity. The destination trace builder handles this automatically.

### Cryptographic Constraints
Destinations often require valid hashes/proofs. Using simulation gadgets handles this automatically.

## Real-World Example: SSTORE Attack

```cpp
// From storage_write.test.cpp
TEST(SStoreConstrainingTest, NegativeFullAttackWithAllTraces)
{
    // Uses PublicDataTreeCheck simulation gadget
    // Creates events with malicious slot/value/address
    // Builds public_data_check trace (legitimate rows)
    // Injects ghost sstore row at row 0
    // Result: Attack SUCCEEDED
}
```

**Output**:
```
Ghost sstore row at row 0 with precomputed_clk=0
public_data_check write row at row 1 with clk=0

sstore relation: PASSED
public_data_check relation: PASSED
STORAGE_WRITE permutation: PASSED

CRITICAL: Attack SUCCEEDED!
```

## Fix Pattern

Add the implication constraint to the source PIL:

```pil
// Before (vulnerable):
pol commit sub_selector;
main_sel * (condition - sub_selector) = 0;
// sub_selector unconstrained when main_sel = 0

// After (fixed):
pol commit sub_selector;
main_sel * (condition - sub_selector) = 0;
#[SUB_SELECTOR_REQUIRES_MAIN_SEL]
sub_selector * (1 - main_sel) = 0;
// sub_selector forced to 0 when main_sel = 0
```

## Historical Examples

- **SSTORE Attack** - Ghost row injection succeeded against sstore.pil, allowing arbitrary storage writes

## References

- Parent skill: `vm2-audit-selector-outside-active`
- SSTORE attack test: `src/barretenberg/vm2/constraining/relations/storage_write.test.cpp`

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
