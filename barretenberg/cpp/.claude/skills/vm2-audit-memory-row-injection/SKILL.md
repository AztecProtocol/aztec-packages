---
name: vm2-audit-memory-row-injection
description: Audit VM2/AVM PIL files for memory row injection vulnerabilities. Critical soundness issue where malicious provers can inject fake memory rows into the memory trace, allowing arbitrary memory reads/writes that bypass the legitimate execution trace and corrupt program state.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Memory Row Injection Audit

## Purpose
Detect memory row injection vulnerabilities where fake rows in memory trace allow arbitrary reads/writes, giving complete control over VM state.

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

### Step 1: Find Memory Components
```bash
ls barretenberg/cpp/pil/vm2/*mem*.pil
grep -n "pol commit.*mem\|pol commit sel" barretenberg/cpp/pil/vm2/memory*.pil
grep -rn "memory\." barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Verify Boolean Constraints
Every memory selector needs `sel * (1 - sel) = 0`:
```bash
grep -n "sel.*1 - sel\|sel.*(1 - sel)" barretenberg/cpp/pil/vm2/memory*.pil
```

### Step 3: Check Interaction Types
Memory ops MUST use permutations (`is`), not lookups (`in`):
```bash
# Should be empty (lookups are BAD):
grep -rn "} in memory\." barretenberg/cpp/pil/vm2/ --include="*.pil"
# Should have entries (permutations are GOOD):
grep -rn "} is memory\." barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 4: Verify Row Accountability
Every memory trace row must correspond to exactly one source operation via permutation (1:1 mapping). Check no orphan rows possible.

### Step 5: Check Selector Implication
```bash
grep -n "sel_mem\|sel.*read\|sel.*write" barretenberg/cpp/pil/vm2/memory*.pil
grep -n "sel_.*\* (1 - sel)" barretenberg/cpp/pil/vm2/memory*.pil
```

### Step 6: Verify Memory Ordering
```bash
grep -n "addr'\|same_addr\|ordering" barretenberg/cpp/pil/vm2/memory*.pil
```

### Step 7: Check Context Isolation
```bash
grep -n "context\|space_id\|call_id" barretenberg/cpp/pil/vm2/memory*.pil
```

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
| Skill | `vm2-audit-memory-row-injection` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format
- **ID**: `vm2-audit-memory-row-injection-filename-123-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write `vm2-audit-memory-row-injection.json` to the output directory:

```json
{
  "skill": "vm2-audit-memory-row-injection",
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

For no findings: `{"skill": "vm2-audit-memory-row-injection", "status": "COMPLETED_NO_FINDINGS", "findings": []}`
