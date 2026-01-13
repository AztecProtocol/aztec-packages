---
name: vm2-audit-edge-case-boundary
description: Audit VM2/AVM PIL files for edge case and boundary condition bugs. Completeness issues where zero sizes, off-by-one errors, or boundary values cause constraint failures or incorrect behavior on valid inputs.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Edge Case and Boundary Audit

## Purpose
Find bugs at boundary conditions: zero size, off-by-one, max values, empty inputs.

## Severity
Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Edge Case Categories

| Category | Examples | Common Bugs |
|----------|----------|-------------|
| **Zero size** | `copy_size=0`, `len=0` | Logic assumes size≥1 |
| **Off-by-one** | `< MAX` vs `<= MAX` | Wrong bound excludes/includes edge |
| **Overflow boundary** | `offset + size > MAX` | Overflow not caught |
| **Empty collection** | No items, empty array | Division by zero, missing check |
| **First/last row** | Row 0, final row | Special case not handled |

## Workflow

### Step 1: Find Size/Count Parameters
```bash
grep -rn "size\|count\|len\|num_\|offset" pil/vm2/<component>.pil
```

### Step 2: Check Zero Size Handling

For each size/count, ask: **What happens when it's 0?**

```pil
// VULNERABLE: Assumes copy_size >= 1
sel_start * (remaining_count - copy_size) = 0;
sel * (remaining_count' - remaining_count + 1) = 0;
// If copy_size = 0, remaining_count starts at 0, then goes to -1 (underflow)!

// SECURE: Handle zero explicitly
sel_start * ((1 - is_zero_size) * (remaining_count - copy_size)) = 0;
is_zero_size * remaining_count = 0;
```

### Step 3: Check Boundary Comparisons

```bash
grep -rn "<\|>\|<=\|>=" pil/vm2/<component>.pil
```

**Off-by-one pattern**:
```pil
// VULNERABLE: Excludes MAX (should be <=)
addr < AVM_HIGHEST_ADDRESS

// VULNERABLE: Uses wrong constant
max_read_addr <= AVM_HIGHEST_ADDRESS - 1  // Off by one!
```

### Step 4: Check Overflow at Boundaries

```bash
grep -rn "offset.*+\|base.*+\|addr.*+" pil/vm2/<component>.pil
```

For `a + b`:
- Is there overflow detection?
- What happens at MAX-1, MAX, MAX+1?

### Step 5: Trace Simulation Edge Cases

```bash
grep -rn "== 0\|!= 0\|empty\|zero" src/barretenberg/vm2/simulation/<component>*.cpp
```

Check simulation handles same edge cases as PIL expects.

## Real Bug Examples

**PR #17877 - Zero copy size**:
```cpp
// If copy_size == 0 and data_offset > data_size:
// data_copy_data_index_upper_bound_gt_offset not set properly
```
Fix: Explicit zero-size handling path.

**PR #17877 - Off-by-one bounds**:
```pil
// WRONG: Off by one
max_read_addr < AVM_HIGHEST_ADDRESS
// Should be:
max_read_addr <= AVM_HIGHEST_ADDRESS
```

**PR #18503 - to_radix_mem underflow**:
```cpp
// dst_addr + num_limbs - 1 when both are 0 → writes to p-1!
```
Fix: Check `num_limbs > 0` before computing end address.

## Checklist

For each size/count/offset parameter:
- [ ] What happens at value = 0?
- [ ] What happens at value = MAX?
- [ ] What happens at value = MAX+1 (overflow)?
- [ ] Is comparison `<` vs `<=` correct?
- [ ] Are both simulation and PIL consistent?

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-edge-case-boundary` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**:
- **ID**: `vm2-audit-edge-case-boundary-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON File (REQUIRED)

Write to output directory as `vm2-audit-edge-case-boundary.json`:

```json
{
  "skill": "vm2-audit-edge-case-boundary",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-edge-case-boundary-data_copy-45-zero-size",
      "severity": "critical",
      "file": "pil/vm2/data_copy.pil",
      "line": 45,
      "description": "Zero copy_size causes remaining_count underflow",
      "exploitability": "high",
      "fix": "Add explicit zero-size handling: is_zero_size * remaining_count = 0"
    }
  ]
}
```
