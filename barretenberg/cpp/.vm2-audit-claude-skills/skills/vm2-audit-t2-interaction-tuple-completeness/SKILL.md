---
name: vm2-audit-t2-interaction-tuple-completeness
description: Audit VM2/AVM PIL files for interaction tuple completeness. High severity soundness issue where lookup or permutation tuples are missing columns that should be included, allowing malicious provers to manipulate missing values like clock ordering, context isolation, or operation flags.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# VM2 Interaction Tuple Completeness Audit

## Purpose
Detect incomplete interaction tuples where missing columns allow: forged operations, arbitrary reordering (missing clock), cross-context access (missing context_id), or flag manipulation.

## Severity

### Soundness vs Completeness
- **Soundness** (prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low to Critical based on reachability

Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

### Severity Calibration by Column Category

When a column is missing from a lookup/permutation tuple, rate severity based on what the missing column *controls*:

**Critical — Cryptographic semantics columns:**
Missing columns that allow the prover to change *what cryptographic operation is computed*. This includes columns controlling:
- Hash function initialization vectors, domain separators, or input lengths — these determine *which* hash is being computed. Without them, the prover can substitute a different-length hash that produces the same internal state progression, breaking all downstream derivations (addresses, storage slots, leaf hashes, class IDs).
- Commitment blinding factors or randomness — altering these breaks hiding properties.
- **Key rule**: If removing a column lets the prover change the *mathematical definition* of the cryptographic operation being invoked, this is **always Critical** regardless of downstream constraints. Downstream Merkle roots or signature checks do NOT mitigate this because the leaf/preimage computation itself is compromised — the prover controls both the forged input and the forged leaf.

**Critical — Identity and isolation columns:**
Missing columns that break execution isolation or enable row injection:
- Context identifiers (context_id, call pointers) — allow cross-context data access.
- Read/write flags (rw) — allow converting reads to writes or vice versa.
- Clock/ordering columns (clk) — allow arbitrary reordering of operations.
- Lifecycle flags (discard, success, revert) — allow manipulating transaction outcomes.

**High — Dispatch and sequencing columns:**
Missing columns that could cause incorrect operation routing or ordering:
- Operation type selectors or opcode identifiers — allow one operation type to be confused for another.
- Round counters or step indices (when not controlling cryptographic semantics) — allow skipping or reordering sub-steps.

**Medium — Structural constraint columns:**
Missing columns that weaken but don't break constraints:
- Redundant range-check inputs where other constraints partially bound the value.
- Auxiliary columns that mirror values already constrained elsewhere in the same interaction.

**Low — Informational columns:**
Missing columns that don't directly enable any exploit:
- Debug or logging columns not consumed by any constraint.
- Columns whose values are fully determined by other included columns via local constraints.

### Common Severity Mistakes to Avoid

1. **Do NOT downgrade because "other constraints exist downstream."** If a missing column lets the prover forge a cryptographic input (e.g., choose a different IV/domain separator), downstream constraints like Merkle root checks do not help — the prover controls the forged value that feeds *into* those checks.
2. **Do NOT assume padding or round-count constraints substitute for input-length constraints.** A prover can often adjust padding to maintain a valid round count while using a completely different input length, changing the IV/domain separator.
3. **Do NOT treat hash-input-controlling columns as "informational."** Columns like input length that feed into IV computation are *cryptographic semantics columns*, not bookkeeping.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every interaction tuple that might be missing a column needed for soundness is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Missing column is constrained independently**: The column is forced to a unique value by other constraints in the destination (quote the constraining constraint with file:line).
  - (b) **Column is irrelevant to soundness**: The column is purely informational and its value doesn't affect any constraint (explain with quoted evidence).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## Workflow

### 0. Enumerate ALL Interactions Across ALL PIL Files (MANDATORY)

> **CRITICAL**: Before analyzing any individual interaction, enumerate ALL interactions across the entire codebase.

```bash
# Find ALL interactions in ALL PIL files
grep -rn "} in \|} is " pil/vm2/ --include="*.pil" | sort

# Count interactions per file
for f in $(grep -rl "} in \|} is " pil/vm2/ --include="*.pil"); do
  echo "=== $f ==="; grep -c "} in \|} is " "$f"
done
```

Build a master checklist:

| File | Line | Interaction Name | Type (lookup/permutation) | Checked? | Finding? |
|------|------|-----------------|--------------------------|----------|----------|

**You MUST check every interaction.** Breadth across all files is more important than depth on any single file.

### 1. Find All Interactions
```bash
grep -n "} in \|} is " pil/vm2/<component>.pil
```

### 2. Check Required Columns Per Type

**Memory operations** - must have:
- `clk` (ordering), `context_id` (isolation), `addr`, `value`, `rw` (read/write), `tag`

**Call operations** - must have:
- `clk`, `caller_context`, `callee_context`, `args`, `success`, `discard`

**State operations** - must have:
- `slot`, `value`, `exists`, `root_before`, `root_after`

### 3. Compare Source/Destination Tuples
```bash
grep -n "TUPLE:\|USAGE:" pil/vm2/<destination>.pil
```
Verify: same columns, same order, same semantics.

### 4. Cross-Reference Similar Interactions
```bash
grep -rn "} in \|} is " pil/vm2/ --include="*.pil" | grep -i "memory\|call\|context"
```

## Vulnerable Patterns

```pil
// VULNERABLE: Missing rw - can't distinguish read from write
sel { addr, value } in memory.sel { memory.addr, memory.value };

// VULNERABLE: Missing clock - operations can be reordered
sel { op_id, args } in dest.sel { dest.op_id, dest.args };

// VULNERABLE: Missing context_id - cross-context access
sel { addr, value } in memory.sel { memory.addr, memory.value };

// VULNERABLE: Missing discard - revert flag can be manipulated
sel { context_id, success } in tx.sel { tx.context_id, tx.success };
```

## Secure Pattern
```pil
// Complete memory tuple
sel { clk, context_id, addr, value, rw, tag }
in memory.sel { memory.clk, memory.context_id, memory.addr, memory.value, memory.rw, memory.tag };
```

## Example Pattern: Missing Column in Lookup Tuple

### Pattern A: Missing cryptographic-semantics column (Critical)

```pil
// VULNERABLE: Missing msg_length — prover can choose any domain separator
sel { data_0, data_1, data_2, digest, round_count }
in hash_gadget.start { hash_gadget.data_0, hash_gadget.data_1, hash_gadget.data_2,
    hash_gadget.digest, hash_gadget.round_count };

// FIXED: msg_length included — domain separator is now constrained
sel { data_0, data_1, data_2, digest, round_count, msg_length }
in hash_gadget.start { hash_gadget.data_0, hash_gadget.data_1, hash_gadget.data_2,
    hash_gadget.digest, hash_gadget.round_count, hash_gadget.msg_length };
```
**Pattern**: When a column controls the cryptographic definition of an operation (e.g., domain separation, initialization vector), omitting it from the lookup lets the prover substitute a different operation entirely. This is **Critical** because downstream integrity checks (Merkle roots, signatures) cannot catch it -- the prover controls both the forged input and the forged result.

### Pattern B: Missing lifecycle/status column (High-Critical)

```pil
// VULNERABLE: Missing status_flag — prover can manipulate it independently
sel { ctx_id, result } in target.sel { target.ctx_id, target.result };

// FIXED: status_flag included
sel { ctx_id, result, status_flag } in target.sel { target.ctx_id, target.result, target.status_flag };
```
**Pattern**: When a lifecycle or status column (e.g., discard, revert, success) is omitted from a tuple, the prover can set it to any value on one side without matching the other. This breaks transaction outcome isolation.

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t2-interaction-tuple-completeness` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-audit-interaction-tuple-completeness-<file>-<line>-<type>`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (required)
Write `vm2-audit-t2-interaction-tuple-completeness.json` to the specified output directory:
```json
{
  "skill": "vm2-audit-t2-interaction-tuple-completeness",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-interaction-tuple-completeness-file-123-missing-clk",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "Missing clock column allows reordering",
    "exploitability": "high",
    "fix": "Add clk to tuple"
  }]
}
```