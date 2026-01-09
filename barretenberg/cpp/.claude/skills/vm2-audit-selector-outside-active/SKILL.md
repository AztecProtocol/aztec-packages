---
name: vm2-audit-selector-outside-active
description: Audit VM2/AVM PIL files for selector under-constraint outside active rows. Sub-selectors that should only be active when sel=1 can be toggled on inactive rows (sel=0). Includes exploitability analysis to determine if missing constraints are critical (ghost rows consumable) or low severity (isolated by interaction graph).
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Selector Outside Active Rows Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for selector under-constraint outside active rows. Selectors that should only be active when the main trace selector `sel = 1` can be toggled on inactive rows (`sel = 0`), allowing a malicious prover to activate features or operations outside the valid trace.

**Bug Type**: Soundness
**Severity**: Critical (if exploitable), Low (if mitigated by interaction graph)
**Frequency**: High

## Why This is Critical

Unconstrained sub-selectors on inactive rows enable "ghost" operations:
- **Insert extra operations**: Memory writes, state changes outside legitimate trace
- **Bypass operation counts and limits**: Operations don't count toward quotas
- **Corrupt state**: "Ghost" operations affect global state invisibly
- **Trigger invalid features**: Activate features on rows that shouldn't exist

## The Implication Pattern

Sub-selectors must imply the main selector is active:

```pil
// sub_selector = 1 requires sel = 1
#[SUB_SELECTOR_REQUIRES_SEL]
sub_selector * (1 - sel) = 0;

// Equivalently: sub_selector => sel
// If sub_selector = 1, then (1 - sel) = 0, so sel = 1
```

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify All Sub-Selectors

```bash
# Find sub-selectors in the component
grep -rn "pol commit.*sel_\|pol commit is_\|pol commit should_\|pol commit has_" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find operation-specific selectors
grep -rn "pol commit.*_op\|pol commit.*_flag\|pol commit.*_mode" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Sub-selectors are typically named:
- `sel_*` (e.g., `sel_add`, `sel_mem_read`)
- `is_*` (e.g., `is_public_call_request`, `is_cleanup`)
- `should_*` (e.g., `should_emit_event`)
- `has_*` (e.g., `has_error`)
- `*_op` (e.g., `double_op`, `add_op`)

### Step 2: Identify the Main Trace Selector

Find the main `sel` that indicates active rows:

```bash
# Find the main selector
grep -rn "pol commit sel;" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Check for Implication Constraints

For each sub-selector, verify one of these exists:

```bash
# Option 1: Direct implication constraint
grep -rn "sub_selector.*(1 - sel)\|sub_selector.*1 - sel" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Option 2: Defined as derived from sel
grep -rn "pol.*= sel \*\|pol.*=sel\*" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected patterns:
```pil
// Option 1: Explicit implication
#[SUB_SELECTOR_REQUIRES_SEL]
sub_selector * (1 - sel) = 0;

// Option 2: Derived definition (inherently safe)
pol SUB_SELECTOR = sel * some_condition;  // Always 0 when sel = 0

// Option 3: Lookup that requires sel = 1
sel { sub_selector, ... } in other.sel { ... };
```

### Step 4: Check Boolean Constraints Are Properly Gated

If a boolean constraint is gated by `sel`, the selector must also be forced to 0 when `sel = 0`:

```bash
# Find gated boolean constraints
grep -rn "sel.*sub_sel.*(1 - sub_sel)" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

```pil
// INCOMPLETE: Only checks boolean when sel = 1
sel * sub_sel * (1 - sub_sel) = 0;
// When sel = 0, sub_sel can be ANY value!

// COMPLETE: Also force to 0 when sel = 0
sel * sub_sel * (1 - sub_sel) = 0;
sub_sel * (1 - sel) = 0;  // Force to 0 when inactive
```

### Step 5: Trace What Happens on Inactive Rows

For each sub-selector, analyze:
1. Can it be set to 1 when `sel = 0`?
2. What constraints would still apply with that sub-selector?
3. What interactions (lookups/permutations) would fire?
4. Could it affect other components or global state?

### Step 6: Check for Derived Selectors

Derived selectors defined using `sel *` are inherently safe:

```bash
# Find derived selectors (these are safe)
grep -rn "pol [A-Z_]* = sel \*" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Boolean Without Implication

```pil
// VULNERABLE: Selector is boolean but doesn't require sel = 1
pol commit selector_col;
selector_col * (1 - selector_col) = 0;  // Boolean OK
// Missing: selector_col * (1 - sel) = 0;

// On row where sel = 0, prover can set selector_col = 1!
```

### Vulnerable Pattern: Gated Boolean Without Force-Zero

```pil
// VULNERABLE: Boolean only checked when sel = 1
sel * sub_sel * (1 - sub_sel) = 0;
// When sel = 0, sub_sel is completely unconstrained!
```

### Secure Pattern: Explicit Implication

```pil
// SECURE Option 1: Selector implies active row
pol commit selector_col;
#[SELECTOR_COL_BOOL]
selector_col * (1 - selector_col) = 0;
#[SELECTOR_COL_IMPLIES_SEL]
selector_col * (1 - sel) = 0;  // selector_col = 1 requires sel = 1
```

### Secure Pattern: Gated Boolean With Force-Zero

```pil
// SECURE Option 2: Gate boolean AND force zero
pol commit selector_col;
#[SELECTOR_COL_BOOL_GATED]
sel * selector_col * (1 - selector_col) = 0;
#[SELECTOR_COL_ZERO_WHEN_INACTIVE]
selector_col * (1 - sel) = 0;  // Force to 0 when sel = 0
```

### Secure Pattern: Derived Selector

```pil
// SECURE Option 3: Define selector as derived
pol SELECTOR = sel * some_condition;  // Always 0 when sel = 0
// No separate constraint needed - inherently safe
```

## Historical Examples

### Example 1: TX Subsystem (PR #18336)

```pil
// is_public_call_request could be toggled without sel == 1
pol commit is_public_call_request;
// Missing: is_public_call_request * (1 - sel) = 0;
```
**Impact**: Insert illegitimate public call requests.

### Example 2: TX Subsystem (PR #18336)

```pil
// Same issue for is_collect_fee and is_cleanup
pol commit is_collect_fee;
pol commit is_cleanup;
// Neither required sel == 1
```
**Impact**: Trigger fee collection or cleanup on arbitrary rows.

### Example 3: Data Copy (PR #17877)

```pil
// sel_cd_copy/sel_rd_copy unconstrained beyond first row
pol commit sel_cd_copy;
pol commit sel_rd_copy;
// Only constrained on sel_start == 1 rows
```
**Impact**: Change copy type mid-operation.

### Example 4: ECC - FALSE POSITIVE

```pil
// double_op and add_op boolean constraints not gated by sel
double_op * (1 - double_op) = 0;  // Not gated!
add_op * (1 - add_op) = 0;        // Not gated!
```
**Analysis**: Initially appears vulnerable, but **not an issue** because:
1. Canonical tracegen (`ecc_trace.cpp`) only sets values within event loops
2. Inactive rows have all columns = 0 (sparse storage default)
3. Constraints evaluate to `0 * (1-0) = 0` on inactive rows
4. Incoming lookups use `ecc.sel` as destination, isolating ghost rows

### Example 5: SSTORE - CRITICAL EXPLOITABLE (2024)

```pil
// sstore.pil - sel_write_public_data fires STORAGE_WRITE permutation
pol commit sel_write_public_data;
sel_execute_sstore * ((1 - sel_opcode_error) - sel_write_public_data) = 0;
// Missing: sel_write_public_data * (1 - sel_execute_sstore) = 0;
```

**Analysis**: **CRITICAL - Exploitable!**
1. Ghost sstore row: `sel_execute_sstore=0, sel_write_public_data=1`
2. Fires `STORAGE_WRITE` permutation to `public_data_check.non_protocol_write`
3. Initial analysis said "destination protected by `write * (1 - sel) = 0`"
4. **BUT**: Attacker can create LEGITIMATE public_data_check rows via simulation
5. Ghost source matches legitimate destination - permutation passes!
6. **Attack succeeded**: Arbitrary storage writes possible

**Key Lesson**: "Destination protection" only prevents ghost destinations. For permutations, always check if the attacker can create legitimate destination rows.

**Test**: `storage_write.test.cpp:NegativeFullAttackWithAllTraces`
**Fix**: Add `sel_write_public_data * (1 - sel_execute_sstore) = 0`

## Audit Checklist

1. **Identify all sub-selectors**:
   - [ ] `sel_*` selectors
   - [ ] `is_*` flags
   - [ ] `should_*` flags
   - [ ] `has_*` flags
   - [ ] `*_op` operation selectors

2. **For each sub-selector, check one of**:
   - [ ] Has constraint: `sub_selector * (1 - sel) = 0`
   - [ ] Is defined as: `pol SUB_SEL = sel * condition`
   - [ ] Is constrained via lookup that requires `sel = 1`

3. **Check boolean constraints are gated properly**:
   - [ ] If `sel * sub_sel * (1 - sub_sel) = 0` exists
   - [ ] Then `sub_sel * (1 - sel) = 0` must also exist

4. **Trace what happens on inactive rows**:
   - [ ] Can the selector be set to 1?
   - [ ] What constraints would still apply?
   - [ ] What interactions would fire?

5. **CRITICAL: For permutation sources, check if attack is possible**:
   - [ ] Does the sub-selector fire a PERMUTATION (not lookup)?
   - [ ] Can the destination trace be legitimately populated? (simulation gadgets exist?)
   - [ ] Can the attacker align clk values for the permutation to match?
   - [ ] If YES to all: **CRITICAL vulnerability** - write a full attack test!
   - [ ] "Destination protection" like `write * (1-sel) = 0` is NOT sufficient!

6. **Check canonical tracegen** (before flagging completeness issues):
   - [ ] Does tracegen use sparse storage (TraceContainer)?
   - [ ] Does it only set values within event iteration loops?
   - [ ] Are inactive rows left unset (defaulting to 0)?
   - [ ] Do ungated constraints evaluate to 0 when all columns are 0?

7. **Verify derived selectors are safe**:
   - [ ] Defined as `pol NAME = sel * condition`
   - [ ] Inherently 0 when `sel = 0`

## Exploitability Analysis

After finding missing constraints, assess whether they're actually exploitable:

### CRITICAL WARNING: Attacker-Controlled Trace Population

**DO NOT assume "destination protection" makes a vulnerability unexploitable.**

A sophisticated attacker (malicious prover) controls ALL trace values. For permutations:
1. The attacker can create ghost source rows (sub_selector=1, main_sel=0)
2. The attacker can ALSO populate destination traces with LEGITIMATE rows (dest_sel=1)
3. Destination constraints like `write * (1 - sel) = 0` only prevent ghost DESTINATIONS
4. They do NOT prevent ghost SOURCES matching legitimate DESTINATIONS

**The sstore.pil vulnerability (2024)** demonstrated this:
- Ghost sstore row: `sel_execute_sstore=0, sel_write_public_data=1`
- Legitimate public_data_check row: `sel=1, non_protocol_write=1` (created via simulation)
- The STORAGE_WRITE permutation matched: 1 ghost source = 1 legitimate destination
- **Attack succeeded**: arbitrary storage writes possible

**Key Question**: Can the attacker populate the destination trace with rows that match the ghost source's permutation tuple?

For most traces, the answer is YES because:
- Simulation gadgets can create valid events with arbitrary values
- Trace builders convert events to trace rows
- Cryptographic constraints (Poseidon2, Merkle) are satisfied by the simulation
- The attacker just needs to align clk/row values for the permutation to match

### Step 1: Check Canonical Tracegen Behavior

**Critical**: Honest provers use canonical tracegen, which uses sparse storage:
- `TraceContainer` stores values in `unordered_flat_map<uint32_t, FF>`
- Unset rows return `FF::zero()` (see `trace_container.cpp:29`)
- Tracegen only sets values for active rows (where events exist)

**Before flagging a completeness issue**, check the tracegen:
```bash
# Find the tracegen for the component
ls src/barretenberg/vm2/tracegen/*_trace.cpp
```

Verify: Does tracegen only iterate over events and set values on active rows? If so, inactive rows will have all columns = 0, and ungated boolean constraints like `col * (1 - col) = 0` evaluate to `0 * 1 = 0` (satisfied).

**Not a completeness issue if**:
- Tracegen only sets values within event loops
- No explicit initialization of inactive rows with non-zero values
- The constraint evaluates to 0 when all columns are 0

### Step 2: Check Incoming Interactions

```bash
# Find all lookups/permutations INTO this trace
grep -rn "in trace\.sel\|is trace\.sel" pil/vm2/ --include="*.pil"
```

If callers use `trace.sel` as destination, ghost rows (sel=0) cannot be consumed - they're isolated.

### Step 3: Check Outgoing Interaction Destinations

For lookups/permutations FROM ghost rows, check if destination gadgets have implication constraints:

```bash
# Find what this trace looks up into
grep -n "in \|is " pil/vm2/trace.pil
# Then check those destinations for: (sub_sel + ...) * (1 - sel) = 0
```

If destinations enforce implication, ghost lookups require legitimate (constrained) destination rows.

### Step 4: Classify Gadget Type

- **Stateless verification** (gt, range_check, ff_gt): Extra rows harmless
- **Stateful traces** (memory, execution): Extra rows dangerous

### Severity Rating

| Scenario | Interaction Type | Destination | Severity |
|----------|------------------|-------------|----------|
| Ghost source fires permutation | Permutation | Can be legitimately populated | **CRITICAL** |
| Ghost source fires permutation | Permutation | Cannot be populated (no simulation path) | LOW |
| Ghost source fires lookup | Lookup | Any | LOW (lookups are one-way) |
| Ghost rows isolated | Any | `trace.sel` used as destination | NOT AN ISSUE |
| Tracegen zeros inactive | Any | Any | NOT AN ISSUE (completeness only) |

**IMPORTANT**: "Destination protected" (e.g., `write * (1 - sel) = 0`) is **NOT sufficient** for permutations!
This only prevents ghost destinations. Ghost sources can still match legitimate destinations.

The key question for permutations: **Can the attacker create legitimate destination rows?**
- If YES (simulation gadgets exist): **CRITICAL**
- If NO (no way to create matching events): LOW

## Fix Pattern

```pil
// Add implication constraint
pol commit sub_selector;
#[SUB_SELECTOR_BOOL]
sub_selector * (1 - sub_selector) = 0;
#[SUB_SELECTOR_REQUIRES_SEL]
sub_selector * (1 - sel) = 0;
```

## Common Locations to Audit

Sub-selectors requiring implication checks:
- **Transaction**: `tx.pil` - phase selectors, call types
- **Execution**: `execution.pil` - operation selectors
- **ALU**: `alu.pil` - operation type selectors
- **ECC**: `ecc.pil` - point operation selectors
- **Memory**: `memory.pil` - read/write selectors
- **Data copy**: `data_copy.pil` - copy type selectors

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/02-selector-outside-active-rows.md)
- [Missing Boolean Selectors Skill](../vm2-audit-missing-boolean/SKILL.md)
- [Lookup vs Permutation](../../../pil/vm2/claude-skills/03-lookup-vs-permutation.md)

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
| Skill | vm2-audit-selector-outside-active |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-selector-outside-active-[file]-[line]-[subtype] [SEVERITY]
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
  "skill": "vm2-audit-selector-outside-active",
  "finding_prefix": "vm2-audit-selector-outside-active",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-selector-outside-active-filename-line-subtype",
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

- Format: `vm2-audit-selector-outside-active-[filename]-[line]-[subtype]`
- Example: `vm2-audit-selector-outside-active-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
