---
name: vm2-audit-t3-memory-row-injection
description: Audit VM2/AVM PIL files for memory row injection vulnerabilities. Critical soundness issue where malicious provers can inject fake memory rows into the memory trace, allowing arbitrary memory reads/writes that bypass the legitimate execution trace and corrupt program state.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Memory Row Injection Audit

## Purpose
Detect memory row injection vulnerabilities where fake rows in memory trace allow arbitrary reads/writes, giving complete control over VM state.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every memory interaction where a malicious prover could inject fake rows is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Permutation enforces 1:1 matching**: The interaction is a permutation (`} is`), not a lookup (quote with file:line).
  - (b) **Destination selector is protected**: `dest_sel * (1 - sel) = 0` exists (quote with file:line).
  - (c) **Row uniqueness enforced**: Memory trace has ordering/uniqueness constraints that prevent injection (quote the specific constraints).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## When to Use
- Auditing memory-related PIL files (memory.pil, *_mem.pil)
- Reviewing memory interactions/permutations in PIL
- Checking memory selector constraints
- Verifying memory trace integrity

## When NOT to Use
- General PIL syntax issues (use linting)
- Non-memory related constraints

## Severity Assessment

**Assess case-by-case** based on impact and reachability:
- **Soundness** (malicious prover exploits): Typically Critical/High
- **Completeness** (honest prover fails): Low (theoretical) to Critical (blocks valid inputs)

Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Attack Vectors

### Vector 1: Non-Boolean Memory Selector
```pil
pol commit memory_sel;
// Missing: memory_sel * (1 - memory_sel) = 0;
// Prover sets memory_sel = 2, row participates twice in interactions
```

### Vector 2: Lookup Instead of Permutation
```pil
// VULNERABLE: Many sources can point to same destination
sel_mem { addr, value } in memory.sel { memory.addr, memory.value };
// Can add extra rows to memory trace not in source
```

### Vector 3: Missing Selector Implication
```pil
pol commit sel_mem_access;
sel_mem_access * (1 - sel_mem_access) = 0;  // Boolean but...
// Missing: sel_mem_access * (1 - sel) = 0;
// Memory access on inactive rows (sel = 0)
```

### Vector 4: Unconstrained Memory Rows
Memory trace rows not accounted for by permutations allow injecting arbitrary state.

## Workflow

> **PERFORMANCE RULE**: Use batch-first approach. Collect all memory-related components, selectors, and interactions in parallel searches, then cross-reference in memory. Do NOT iterate per-selector with individual greps.

### Phase 1: Batch Collection (4 parallel searches)

This session targets a single PIL file. Run searches against the target file; also search for interactions with memory across the full `pil/vm2/` directory to understand how the target file is connected.

**Search A — Selectors and memory columns in the target file**:
```bash
grep -n "pol commit.*sel\|pol commit.*mem" <target_file>
```

**Search B — Memory interactions involving the target file** (lookups and permutations):
```bash
grep -n "} in memory\.\|} is memory\." <target_file>
# Also find other files that interact with the target's namespace:
grep -rn "} in memory\.\|} is memory\." pil/vm2/ --include="*.pil"
```

**Search C — Boolean and implication constraints on memory selectors in the target file**:
```bash
grep -n "(1 - sel)\|sel.*(1 - " <target_file>
```

**Search D — Memory ordering and context constraints in the target file**:
```bash
grep -n "addr'\|same_addr\|ordering\|context\|space_id\|call_id" <target_file>
```

### Phase 2: Ghost-Row Implication Check

This phase targets the most common class of memory injection bugs: sub-selectors that can be activated on ghost rows (rows where the component's main selector `sel = 0`).

**Search E — Sub-selectors gating memory interactions in the target file**:
```bash
# Find permutation/lookup selectors in the target file that interact with memory
grep -n "} is memory\.\|} in memory\." <target_file>
# For each source selector found, check if it implies the component's main sel
```

For each sub-selector `sel_X` gating a memory interaction:
1. Check whether `sel_X * (1 - sel) = 0` exists in the target file (sel_X implies component is active)
2. If missing: a malicious prover can set `sel_X = 1` on ghost rows (`sel = 0`) where all computation constraints are vacuously true, injecting arbitrary memory operations

**Also check non-memory interaction selectors that trigger memory writes indirectly**:
```bash
# Sub-selectors in the target file that gate write permutations
grep -n "sel_should_write\|sel_write\|sel_.*_mem\|sel_perform\|sel_not_padding" <target_file>
```

For each such sub-selector, verify it implies the parent component's active selector.

### Phase 3: Cross-Reference Analysis

From the batch results, verify:

1. **Boolean constraints**: Every memory selector has `sel * (1 - sel) = 0`
2. **Interaction types**: Memory ops use permutations (`is`), NOT lookups (`in`) — lookups allow row injection
3. **Row accountability**: Every memory trace row corresponds to exactly one source operation (1:1 mapping)
4. **Selector implication**: Sub-selectors have `sub_sel * (1 - sel) = 0`
5. **Memory ordering**: Proper address/clock ordering constraints exist
6. **Context isolation**: Operations bound to context via `context_id`/`space_id`

## Secure Pattern
```pil
pol commit sel;
#[SEL_BOOL]
sel * (1 - sel) = 0;
#[MEM_ACCESS]
sel_mem_op { clk, addr, value, rw } is memory.sel { memory.clk, memory.addr, memory.value, memory.rw };
```

## Security Properties Checklist
1. Every memory row comes from execution (permutations, not lookups)
2. Memory selector is boolean constrained
3. No duplicate rows (permutation enforces 1:1)
4. Proper ordering (reads see most recent writes)
5. Context isolation (operations bound to context)

## REQUIRED OUTPUT FORMAT

### 1. Markdown Report (stdout)

#### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t3-memory-row-injection` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format
- **ID**: `vm2-audit-t3-memory-row-injection`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write `vm2-audit-t3-memory-row-injection.json` to the output directory:

```json
{
  "skill": "vm2-audit-t3-memory-row-injection",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-memory-row-injection-filename-123-issue-type",
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

For no findings: `{"skill": "vm2-audit-t3-memory-row-injection", "status": "COMPLETED_NO_FINDINGS", "findings": []}`
