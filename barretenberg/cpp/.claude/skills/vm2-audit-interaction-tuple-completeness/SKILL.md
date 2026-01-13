---
name: vm2-audit-interaction-tuple-completeness
description: Audit VM2/AVM PIL files for interaction tuple completeness. High severity soundness issue where lookup or permutation tuples are missing columns that should be included, allowing malicious provers to manipulate missing values like clock ordering, context isolation, or operation flags.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# VM2 Interaction Tuple Completeness Audit

## Purpose
Detect incomplete interaction tuples where missing columns allow: forged operations, arbitrary reordering (missing clock), cross-context access (missing context_id), or flag manipulation.

## Severity
- **Soundness** (prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low to Critical based on reachability

Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Workflow

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

## Real Bug: PR #19149

```pil
// BEFORE: Missing discard
sel { context_id, success } in tx.sel { tx.context_id, tx.success };

// AFTER: Fixed
sel { context_id, success, discard } in tx.sel { tx.context_id, tx.success, tx.discard };
```
**Impact**: Prover could manipulate discard flag independently of success.

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-interaction-tuple-completeness` |
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
Write `vm2-audit-interaction-tuple-completeness.json` to the specified output directory:
```json
{
  "skill": "vm2-audit-interaction-tuple-completeness",
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