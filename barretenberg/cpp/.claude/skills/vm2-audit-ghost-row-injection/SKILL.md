---
name: vm2-audit-ghost-row-injection
description: Test if a selector-outside-active vulnerability is exploitable via ghost row injection. When a sub-selector can fire a PERMUTATION from inactive rows, test if an attacker can create legitimate destination rows to match the ghost source. This is the attack that succeeded against sstore.pil.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Ghost Row Injection Attack Audit

## When to Use This Skill

Use this skill when:
1. The `vm2-audit-selector-outside-active` skill found a missing implication constraint
2. The unconstrained sub-selector fires a **PERMUTATION** (not lookup)
3. You need to determine if the vulnerability is actually exploitable

**This skill tests the specific attack pattern that succeeded against sstore.pil.**

## The Attack Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    GHOST ROW INJECTION ATTACK                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SOURCE TRACE (e.g., execution/sstore)                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Row N: main_sel=0, sub_sel=1  ← GHOST ROW               │    │
│  │        Fires permutation with arbitrary values           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           │ PERMUTATION                          │
│                           ▼                                      │
│  DESTINATION TRACE (e.g., public_data_check)                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Row M: sel=1, dest_sel=1  ← LEGITIMATE ROW              │    │
│  │        Created via simulation gadgets                    │    │
│  │        All cryptographic constraints satisfied           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  RESULT: Permutation matches! Attack succeeds.                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Why "Destination Protection" Fails

Common misconception: "The destination has `write * (1 - sel) = 0`, so ghost rows can't match."

**WRONG.** This constraint only prevents ghost DESTINATIONS (sel=0). It does NOT prevent:
- Ghost SOURCES (source_sel=0) matching legitimate DESTINATIONS (dest_sel=1)
- Attackers creating legitimate destination rows via simulation

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

## Checklist

- [ ] Identified the permutation fired by unconstrained sub-selector
- [ ] Found the destination trace and simulation gadget
- [ ] Confirmed gadget accepts arbitrary values
- [ ] Wrote full attack test using simulation gadgets
- [ ] Placed ghost row where clk values align
- [ ] Ran test and confirmed attack succeeds/fails
- [ ] If attack succeeds: documented as CRITICAL, proposed fix
- [ ] If attack fails: documented blocking factor

## References

- Parent skill: `vm2-audit-selector-outside-active`
- SSTORE vulnerability: `pil/vm2/claude-audits/selector-outside-active-take2/sstore-vulnerability-analysis.md`
- SSTORE attack test: `src/barretenberg/vm2/constraining/relations/storage_write.test.cpp`

---

## Required Output Format

**IMPORTANT**: When running this audit skill, you MUST end your response with this standardized format.

### Findings Summary

At the end of your audit, provide a summary section:

```markdown
## Audit Results

### Summary
| Item | Value |
|------|-------|
| Skill | vm2-audit-ghost-row-injection |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-ghost-row-injection-[file]-[line]-[subtype] [SEVERITY]
- **File**: `path/to/file.pil:line`
- **Type**: [specific vulnerability type]
- **Affected Column/Constraint**: [name]
- **Description**: [brief description]
- **Exploitability**: [High/Medium/Low] - [brief rationale]
- **Suggested Fix**: [one-line fix suggestion]

[Repeat for each finding]
```

### Machine-Readable Findings

After the human-readable summary, include a JSON block:

```markdown
<!-- MACHINE-READABLE FINDINGS (do not edit manually) -->
```json
{
  "skill": "vm2-audit-ghost-row-injection",
  "finding_prefix": "vm2-audit-ghost-row-injection",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-ghost-row-injection-filename-line-subtype",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.pil",
      "line": 123,
      "type": "specific-vulnerability-type",
      "column": "affected_column_name",
      "description": "Brief description of the issue",
      "exploitability": "high|medium|low",
      "fix": "Suggested fix"
    }
  ]
}
```
<!-- END MACHINE-READABLE FINDINGS -->
```

### Finding ID Convention

- Format: `vm2-audit-ghost-row-injection-[filename]-[line]-[subtype]`
- Example: `vm2-audit-ghost-row-injection-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
