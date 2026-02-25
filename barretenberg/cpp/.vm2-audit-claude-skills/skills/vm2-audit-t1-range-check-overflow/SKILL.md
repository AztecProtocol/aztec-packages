---
name: vm2-audit-t1-range-check-overflow
description: Audit VM2/AVM PIL files for range check and overflow vulnerabilities. High severity soundness issue where arithmetic operations overflow without proper range checks, range checks are incorrectly applied, or protocol values lack required size constraints, enabling integer wrap-around, wrong memory access, size/gas manipulation, or invalid protocol data.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Range Check and Overflow Audit

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report vulnerabilities.

**RULE 1 — Report first, dismiss later.** Every arithmetic operation without an explicit range check is a PRELIMINARY FINDING. Every decomposition witness variable without a range check is a PRELIMINARY FINDING. Report ALL, then filter in a final pass.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss a finding if:
  - (a) **Explicit range check lookup**: The column has a range check lookup `sel { col } in range_check.sel { ... }` with the correct bit width (quote exact file:line and verify bit width matches requirement).
  - (b) **Caller-constrains-inputs with matching bound**: The value comes from a lookup/permutation source that constrains it to THE SPECIFIC required range (quote both the source constraint and the required bound, and show they match).
  - (c) **Precomputed/constant value**: The value is from `precomputed.*` or is a PIL constant (quote the definition).
  - (d) **Bounded by trace size**: The value is `precomputed.clk` or equivalent (quote it).
  You MUST NOT accept "it's bounded because the input is bounded" without quoting the specific input constraint AND showing it matches the required bound. In particular: FF-tagged memory values are NOT bounded — they are full field elements.

**RULE 3 — Quote or report.** For ANY dismissal, quote the EXACT protecting constraint (file:line, constraint text, AND the required bit width). If the range check exists but uses a wrong bit width, that is STILL a finding.

**RULE 4 — Severity floor.** When in doubt, report as **High**. Only downgrade with a quoted constraint proving the value is adequately bounded.

## Purpose
Find missing or incorrect range checks that enable:
1. **Arithmetic overflow/underflow**: integer wrap-around in address calculations, gas, sizes
2. **Protocol-value size violations**: values that must fit specific bit widths for external protocol correctness (e.g., Ethereum addresses in 160 bits, gas counters in 32 bits, hashes in 256 bits) but lack enforcement
3. **Decomposition uniqueness violations**: intermediate witness columns introduced to split computations (limb decompositions, quotient/remainder, carry/borrow) that lack range constraints, allowing a malicious prover to choose any field-satisfying solution and corrupt the computation's output

## Scope

Audit ALL PIL files in the VM2 directory, including:
- Main component files: `pil/vm2/*.pil`
- **Opcode-specific files: `pil/vm2/opcodes/*.pil`** — these implement individual opcodes and frequently handle protocol values that have external size requirements

## When to Use
- Auditing PIL files for overflow/underflow vulnerabilities
- Reviewing arithmetic operations (address calculations, gas, sizes)
- Checking range check table usage
- Reviewing opcode implementations that emit data to public inputs or interact with external systems (L1, logs, etc.)

## Severity Calibration

### Critical (Soundness)
- A malicious prover can set **arbitrary field elements** where a bounded integer is expected in an arithmetic operation — this allows complete bypass of the operation's semantics
- A witness column in a **decomposition equation** (limb split, modular reduction, quotient/remainder) lacks a range check — the prover can choose any field element satisfying the equation, making the decomposition non-unique and the computation's output arbitrary
- A malicious prover can bypass a **size constraint on a protocol value** — e.g., a value that must fit in N bits for protocol correctness (addresses, hashes, counters, indices) can instead be an arbitrary field element. This corrupts data sent to L1 or stored in public outputs
- Overflow/underflow enabling **arbitrary memory access** or **gas manipulation**

### High (Soundness)
- Range check uses wrong bit width (e.g., 32-bit check where 16-bit is required) but exploitation is constrained by other factors
- Off-by-one in bounds checking

### Medium
- Overflow theoretically possible but practically limited by trace size or other indirect constraints

### Low / Completeness
- Honest prover edge cases, unreachable paths
- Completeness bugs reachable via canonical simulation on valid inputs are upgraded to **Critical**

## CRITICAL: Caller-Constrains-Inputs Principle

**Before reporting "missing range check", verify the value isn't already constrained by its source.**

Input columns (from lookup/permutation destinations) do NOT need local range checks if the source constrains them **to the required bound**.

### Validation Steps
1. **Is it an input or locally computed?** - Check if value appears in lookup destination (right of `in`)
2. **For inputs, trace the source** - `grep -rn "column_name" pil/vm2/ | grep " in "`
3. **Verify the source constraint MATCHES the required bound** - The source must constrain the value to the SPECIFIC range needed, not just "some" range
4. **Document the chain** - If safe, note why; if unsafe, the source needs the fix

### IMPORTANT: When Caller Constraints Are NOT Sufficient

The caller-constrains-inputs principle does NOT apply when:

- **The required bound differs from what the source enforces**: e.g., a value comes from memory tagged as FF (full field element) but the protocol requires it to fit in N bits. Memory's tag check only enforces the tag's range — if the tag is FF, the value is unconstrained. The LOCAL consumer must add the protocol-specific range check.
- **The value has an external protocol requirement beyond its type**: e.g., an Ethereum address must be 160 bits regardless of what memory tag it has. A hash must be 256 bits. A counter must fit in 32 bits. These requirements come from the PROTOCOL, not the type system.
- **The source constrains a different property**: e.g., the source proves the value is non-zero, but the consumer needs it to be < 2^32. Different property, insufficient.
- **The value passes through without transformation**: if a full field element from memory is written directly to public inputs or sent to L1, and the protocol expects a bounded value, the mere fact it "came from memory" does not make it safe.
- **The column is a decomposition witness variable**: Columns introduced to express a decomposition equation (limb splits, quotient/remainder, carry/borrow) are locally committed free witnesses. They are NEVER constrained by callers because they don't come from lookups or inputs — they are auxiliary variables created within the gadget. These always require local range checks. Do not confuse them with input columns even if they appear in lookup tuples alongside inputs.

### Common FALSE POSITIVES (use with care)

| Pattern | Why Safe | CAVEAT |
|---------|----------|--------|
| Tree sizes from context | Initialized from public inputs, only incremented by 0/1 | Only if the public input itself is range-checked |
| Memory values with tags | Memory's `RANGE_CHECK_WRITE_TAGGED_VALUE` enforces bounds | **Only for the tag's range** — if tag is FF, value is unconstrained. Does NOT enforce protocol-specific bounds. |
| Gas values | `gas.pil` out-of-gas checks ensure used <= limit | Only for gas arithmetic, not for protocol size requirements |
| Counters with termination | Decrement gated by `(1 - last)`, won't fire when counter = 1 | Verify the counter initialization is also bounded |
| Clock values | From `precomputed.clk` (row number), bounded by trace size | Safe |
| Lookup-validated indices | Forced to match existing rows, bounded by row count | Safe |

### Real Vulnerability Indicators
- Column is locally computed (not an input) and lacks range check
- Column is a `pol commit` used in a decomposition equation (limb split, modular reduction) but either has NO range check or has a range check gated by a selector that's narrower than the equation's selector
- A code comment claims a range check is unnecessary due to input bounds — verify independently; this is a known source of bugs
- Source trace does NOT constrain the value to the REQUIRED bound (not just any bound)
- Value is a full field element (FF tag) but protocol requires N-bit value
- Value is written to public inputs, emitted to L1, or used in cross-system communication without size enforcement
- Prover can set arbitrary field elements where bounded integers are expected
- Enables exploit (memory access, gas manipulation, invalid protocol data)

## Protocol-Value Size Requirements

Many opcode implementations handle values with **external size requirements** imposed by the protocol, not just the VM's type system. These are prime targets for missing range checks.

### Pattern: Values With External Bit-Width Requirements

Look for values that:
1. Are read from memory (often as FF / full field elements)
2. Are written to public inputs, emitted in logs, or sent to L1
3. Have a protocol-defined maximum size (e.g., addresses = 160 bits, storage slots = 256 bits, gas = 32 bits, counters = specific widths)

If the PIL does NOT enforce the size constraint between reading the value and writing it to the output, a malicious prover can inject an arbitrary field element where a bounded value is expected.

### Where to Look
- `pil/vm2/opcodes/*.pil` — opcode implementations that write to public inputs
- Any lookup into `public_inputs.sel` — check what values are sent and whether they have size constraints
- Cross-system boundaries (L2-to-L1 messages, log emissions, external calls)

### What Makes This Critical
- A field element is ~254 bits. If the protocol expects a 160-bit address, a malicious prover can set 94 extra bits of arbitrary data
- L1 contracts and other consumers may truncate, misinterpret, or fail on oversized values
- This is a **soundness** issue: the proof system accepts an invalid state transition

## Workflow

### Step 1: Find Arithmetic Operations
```bash
# Find all arithmetic in component files
grep -rEn "(addr|offset|base|ptr|size|len|count|remaining|gas|sum|total).*[+\-*]|[+\-*].*(addr|offset|size|gas)" pil/vm2/*.pil pil/vm2/opcodes/*.pil
```

### Step 2: Audit Decomposition Witness Variables

Decomposition variables are witness columns introduced to split a value into parts. They appear in modular reductions, limb decompositions, quotient/remainder relations, and carry/borrow patterns. If ANY limb in a decomposition lacks a range check, the decomposition has multiple solutions in the field, and the prover can choose an arbitrary output.

```bash
# Find all committed witness columns in ALU and arithmetic gadget files
grep -rn "pol commit" pil/vm2/alu.pil pil/vm2/ff_gt.pil pil/vm2/gt.pil pil/vm2/to_radix_mem.pil pil/vm2/keccakf1600.pil pil/vm2/sha256.pil pil/vm2/ecc.pil
```

For each witness column found:
1. **Is it used in a decomposition equation?** Look for patterns like:
   - `X = lo + hi * base` (limb split)
   - `a * b = result + quotient * modulus` (modular reduction)
   - `a = b * q + r` (quotient/remainder)
   - `a + b = result + carry * 2^k` (carry/borrow)
2. **Does it have a range check?** Search for the column name in range_check lookups:
   ```bash
   grep -n "column_name" pil/vm2/*.pil | grep "range_check"
   ```
3. **Is the range check gated by the correct selector?** The range check must fire in EVERY context where the decomposition equation is active. Check that the lookup selector matches or is a superset of the equation's activation selector. A range check that only fires for one type (e.g., u128) when the equation also applies to other types (U8/U16/U32/U64) is a bug.
4. **Is the bit width correct?** The range check must bound the variable to `[0, base)` where `base` is the decomposition's radix.

**Key red flags:**
- A witness column appears in a multiplication/division constraint but NOT in any range_check lookup
- A range check exists but is gated by a selector that's narrower than the equation's selector
- A comment claims "no range check needed because inputs are bounded" — verify this claim rigorously. Bounded inputs do NOT guarantee bounded intermediates when the intermediate is a free witness

### Step 3: Check Range Check Lookups
```bash
grep -rn "range_check\|U8\|U16\|U32\|U64\|rng_chk_bits" pil/vm2/*.pil pil/vm2/opcodes/*.pil
```

Expected pattern:
```pil
#[VALUE_RANGE_CHECK]
sel { value } in range_check.sel { range_check.value };
```

### Step 4: Check Overflow/Underflow Handling
```bash
grep -rn "overflow\|underflow\|wrap\|carry" pil/vm2/*.pil pil/vm2/opcodes/*.pil
```
Verify: boolean constrained, triggers error/adjustment, both cases handled.

### Step 5: Verify Correct Range Table
- 8-bit: U8 table
- 16-bit: U16 table
- 32-bit: U32 table, etc.
- Match against the PROTOCOL requirement, not just the memory tag

### Step 6: Audit Protocol-Value Boundaries (EVERY Opcode)

> **CRITICAL**: Check EVERY opcode in `pil/vm2/opcodes/` that writes to public inputs or sends data to L1.

```bash
# Find all lookups into public_inputs (these write protocol data)
grep -rn "public_inputs.sel\|public_inputs.cols" pil/vm2/opcodes/*.pil pil/vm2/tx.pil
# Find register values being sent without range checks
grep -rn "register\[" pil/vm2/opcodes/*.pil
# Find ALL opcode files for coverage
ls pil/vm2/opcodes/*.pil
```

For each value written to public inputs or sent to L1:
1. Determine the protocol-required bit width
2. Check if the value's memory tag enforces that width (FF tag does NOT)
3. Look for an explicit range check between the memory read and the public input write
4. If missing, this is a **Critical** finding

### Step 7: Decomposition Witness Checklist (MANDATORY)

For arithmetic gadgets (alu.pil, ff_gt.pil, gt.pil, sha256.pil, keccakf1600.pil, ecc.pil, to_radix_mem.pil), build a table of ALL `pol commit` witness variables:

| Column | File | Used in decomposition equation? | Range-checked? | Selector match? |
|--------|------|-------------------------------|---------------|----------------|

Any row with "yes" for decomposition but "no" for range-check is a finding. Any row where the range-check selector is narrower than the equation's selector is also a finding.

## Vulnerable Patterns

### Unchecked Arithmetic
```pil
// VULNERABLE: Address calculation can overflow/wrap
pol next_addr = addr + offset;  // No range check!
```

### Missing Range Check
```pil
// VULNERABLE: Value assumed to fit in N bits without lookup
pol commit value;  // Assumed U32, but no range check lookup
```

### Uncaught Underflow
```pil
// VULNERABLE: If used > total, wraps to huge value
pol remaining = total - used;
```

### Incorrect Bound (Off-by-One)
```pil
// VULNERABLE: Should be <= or check against SIZE
addr < AVM_HIGHEST_ADDRESS;
```

### Unconstrained Decomposition Variable
```pil
// VULNERABLE: quotient_limb is a free witness used to express modular reduction.
// Without a range check, the prover can choose quotient_limb to produce any output.
pol commit quotient_limb;
sel_active * (input_a * input_b - result - modulus * quotient_limb) = 0;
// MISSING: range check on quotient_limb ensuring quotient_limb < 2^k
```

**Why this is critical:** The constraint `a*b - result - M*quotient = 0` has a unique integer solution for `(result, quotient)` ONLY when both are bounded. Over a prime field, there are many pairs satisfying the equation. A range check on `result` alone (e.g., via a memory write tag check) is insufficient — the prover controls `quotient_limb`, so they can pick it to force any in-range `result`.

**General pattern:** Any equation of the form `X = sum(limb_i * base^i)` where `limb_i` is a `pol commit` requires `limb_i` to be range-checked to `[0, base)` for the decomposition to be unique.

### Partially-Gated Range Check on Decomposition Variable
```pil
// VULNERABLE: range check only fires for one type, but decomposition is used for ALL types
pol commit hi_limb;
sel_active * (1 - sel_err) * (expr - result - base * hi_limb) = 0;  // active for ALL types
sel_specific_type { hi_limb } in range_check.sel { range_check.value };  // only one type!
// For other types: hi_limb is unconstrained
```

### Protocol Value Without Size Enforcement
```pil
// VULNERABLE: register value is a full field element (FF tag)
// but protocol requires it to fit in N bits.
// No range check before writing to public inputs.
sel_write {
    register[0]     // Could be arbitrary field element!
} in public_inputs.sel {
    public_inputs.cols[0]
};
```

## Secure Patterns

### Overflow Detection
```pil
pol commit overflow;
#[RANGE_CHECK_SUM]
(1 - overflow) { sum } in range_check.sel { range_check.value };
#[OVERFLOW_CHECK]
(1 - overflow) * (sum - addr - offset) = 0;
overflow * (sum - addr - offset + 2^32) = 0;
```

### Underflow Prevention
```pil
pol commit underflow;
#[UNDERFLOW_CHECK]
underflow * (used - total - 1) in range_check.sel { ... };
(1 - underflow) * (total - used) in range_check.sel { ... };
```

### Correct Decomposition With Range Checks
```pil
// SECURE: Every limb in the decomposition is range-checked,
// and the range check selector matches the equation's activation selector.
pol commit hi_limb;
pol sel_active = sel_op * (1 - sel_err); // equation is active here
sel_active * (expr - result - base * hi_limb) = 0;
// Range check fires for ALL cases where the equation is active
#[RANGE_CHECK_HI]
sel_active { hi_limb, bit_width } in range_check.sel { range_check.value, range_check.rng_chk_bits };
```

### Protocol Value With Size Enforcement
```pil
// SECURE: Value range-checked before use in protocol context
#[RANGE_CHECK_PROTOCOL_VALUE]
sel_write { register[0], 160 } in range_check.sel { range_check.value, range_check.rng_chk_bits };
```

## Output Format

### 1. Markdown Report (stdout)

**Summary Table:**
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t1-range-check-overflow` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding Format:**
- **ID**: `vm2-audit-t1-range-check-overflow-{filename}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write `vm2-audit-t1-range-check-overflow.json` to specified output directory:

```json
{
  "skill": "vm2-audit-t1-range-check-overflow",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-range-check-overflow-filename-123-issue-type",
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
</content>
</invoke>