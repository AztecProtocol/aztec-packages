---
name: vm2-audit-selector-outside-active
description: Audit VM2/AVM PIL files for selector under-constraint outside active rows. Sub-selectors that should only be active when sel=1 can be toggled on inactive rows (sel=0). Includes exploitability analysis to determine if missing constraints are critical (ghost rows consumable) or low severity (isolated by interaction graph).
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Selector Outside Active Rows Audit

Audits for selector under-constraint outside active rows. Selectors that should only be active when `sel = 1` can be toggled on inactive rows (`sel = 0`), enabling "ghost" operations: extra memory writes, operation count bypass, invisible state corruption, or triggering features on invalid rows.

## The Implication Pattern

Sub-selectors must imply the main selector is active:

```pil
// sub_selector = 1 requires sel = 1
#[SUB_SELECTOR_REQUIRES_SEL]
sub_selector * (1 - sel) = 0;

// Equivalently: sub_selector => sel
// If sub_selector = 1, then (1 - sel) = 0, so sel = 1
```

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

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

## Patterns

### Vulnerable Pattern: Boolean Without Implication

```pil
// VULNERABLE: Selector is boolean but doesn't require sel = 1
pol commit selector_col;
selector_col * (1 - selector_col) = 0;  // Boolean OK
```

### Vulnerable Pattern: Gated Boolean Without Force-Zero

```pil
// VULNERABLE: Boolean only checked when sel = 1
sel * sub_sel * (1 - sub_sel) = 0;
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
```

## Examples

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

## Exploitability Analysis

After finding missing constraints, assess whether they're actually exploitable:

### CRITICAL WARNING: Attacker-Controlled Trace Population

**DO NOT assume "destination protection" makes a vulnerability unexploitable.**

A sophisticated attacker (malicious prover) controls ALL trace values. For permutations:
1. The attacker can create ghost source rows (sub_selector=1, main_sel=0)
2. The attacker can ALSO populate destination traces with LEGITIMATE rows (dest_sel=1)
3. Destination constraints like `write * (1 - sel) = 0` only prevent ghost DESTINATIONS
4. They do NOT prevent ghost SOURCES matching legitimate DESTINATIONS

See **Example 5 (SSTORE)** above for a real attack demonstrating this.

**Key Question**: Can the attacker populate the destination trace with rows that match the ghost source's permutation tuple? For most traces, YES - simulation gadgets create valid events with arbitrary values, and the attacker just needs to align clk/row values.

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

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `{skill-name}.json` file to the output directory with:

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

For no findings:
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.