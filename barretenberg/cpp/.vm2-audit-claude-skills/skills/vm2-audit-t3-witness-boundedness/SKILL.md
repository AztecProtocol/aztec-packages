---
name: vm2-audit-t3-witness-boundedness
description: Audit VM2/AVM PIL files for unbounded witness columns. Critical soundness issue where committed polynomials lack boolean, lookup, or range constraints, allowing malicious provers to set arbitrary field values for intermediates like c_hi, quotients, or helpers.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 2.0.0
---

# VM2 Witness Boundedness Audit

## Purpose
Detect committed polynomials (witness columns) that are unbounded - not constrained by boolean checks, lookups, permutations, or derivation from bounded values.

**Key improvement (v2.0)**: Track INCOMING permutations to avoid false positives on crypto gadget I/O.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every committed polynomial (witness column) that lacks a boolean, lookup, or range constraint is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Boolean constraint exists**: `col * (1 - col) = 0` (quote with file:line).
  - (b) **Range check lookup exists**: `sel { col } in range_check.sel { ... }` (quote with file:line).
  - (c) **Constrained via interaction**: The column appears in a lookup/permutation destination that forces its value (quote the interaction).
  - (d) **Derived polynomial**: `pol NAME = ...` (not `pol commit`) — these are computed, not witness columns.

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## When to Use
- Auditing arithmetic operations for unbounded intermediates
- Reviewing new committed columns
- Checking ALU decomposition variables

## File Priority

| Priority | Files | Why |
|----------|-------|-----|
| HIGH | `alu.pil`, `memory.pil`, `execution.pil` | Arithmetic bugs = direct exploitation |
| MEDIUM | `ff_gt.pil`, `gt.pil`, `bitwise.pil` | Comparison/logic manipulation |
| LOW | `poseidon2_perm.pil`, `keccakf1600.pil`, `sha256.pil`, `ecc.pil` | Crypto I/O bound by callers |

## Severity Assessment
- **Soundness** (malicious prover exploits): Critical/High/Medium based on impact
- **Completeness** (honest prover fails): Low to Critical based on reachability
- **Key principle**: Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

| Pattern | Soundness | Completeness |
|---------|-----------|--------------|
| Unbounded arithmetic intermediate affecting output | Critical | Critical if tracegen violates |
| Unbounded intermediate with no incoming permutation | High | High if tracegen violates |
| Partial boundedness (conditional range check) | Medium | Medium |
| Inverse columns, equation-derived intermediates | Low | Low |
| Crypto gadget I/O with incoming permutation | Info | Info (expected pattern) |

## Core Concept: Boundedness

A witness column is **bounded** if ONE applies:
1. **Boolean**: `col * (1 - col) = 0`
2. **Lookup**: `sel { col } in table.sel { table.val }`
3. **Range check**: `sel { col } in range_check.sel_N { ... }`
4. **Equality derivation**: `col = expr` where expr is bounded
5. **Inverse pattern**: `x * col = 1` (determined when x != 0)
6. **Incoming permutation**: Column appears in DESTINATION tuple (NEW)
7. **Equation-derived**: `sel * (col - expr) = 0` where expr is bounded (NEW)

## Workflow

> **PERFORMANCE RULE**: Do NOT iterate per-column with individual greps. Use the batch-first approach below. The codebase has ~1,730 committed columns across ~65 PIL files — per-column iteration will exhaust the context window.

### Step 0: Categorize File Type
```bash
# Crypto gadgets - likely bound by callers
CRYPTO_GADGETS="poseidon2_perm|keccakf1600|sha256|ecc|scalar_mul"

# Arithmetic gadgets - primary audit targets
ARITHMETIC="alu|ff_gt|gt|bitwise"
```

### Phase 1: Batch Collection (4 parallel searches)

**Search A — All committed columns** (the full set):
```bash
grep -rn "pol commit" pil/vm2/ --include="*.pil"
```

**Search B — All boundedness constraints** (boolean, range check, lookup):
```bash
grep -rn "(1 - \|in range_check\|in precomputed" pil/vm2/ --include="*.pil"
```

**Search C — All incoming permutations** (cross-file bindings):
```bash
grep -rn "} is " pil/vm2/ --include="*.pil"
```

**Search D — All equation derivations** (equality constraints):
```bash
grep -rn "= 0;" pil/vm2/ --include="*.pil" | grep -v "pol \|//\|#"
```

### Phase 2: Set Difference (compute candidates)

From the batch results:
1. ALL_COLUMNS = committed columns from Search A
2. BOUNDED = columns appearing in Search B + C + D (boolean, lookup, range, permutation dest, equation)
3. INVERSE_COLS = columns with names matching `_inv` (algebraically determined)
4. CANDIDATES = ALL_COLUMNS - BOUNDED - INVERSE_COLS

Typically yields **15-40 candidates**, not hundreds.

### Phase 2.5: ALU Decomposition Deep Dive

**Priority target**: `alu.pil` and any arithmetic gadgets (`ff_gt.pil`, `gt.pil`). These files contain decomposition variables (high/low limbs, quotients, remainders) that are the most exploitable unbounded witnesses.

```bash
# Find all decomposition-related committed columns in arithmetic files
grep -n "pol commit" pil/vm2/alu.pil pil/vm2/ff_gt.pil pil/vm2/gt.pil
# Find all range checks in arithmetic files
grep -n "in range_check\|in precomputed" pil/vm2/alu.pil pil/vm2/ff_gt.pil pil/vm2/gt.pil
```

For each decomposition variable (names like `*_hi`, `*_lo`, `*_quotient`, `*_remainder`, `*_carry`, `*_limb*`):
1. **Is it range-checked?** Look for `{ col } in range_check.sel_N { ... }`
2. **Is the range check universal or conditional?** Check if the range check selector covers ALL operation variants, not just one specific type (e.g., only U128 but not U64)
3. **Does every variant that uses it in a decomposition equation also range-check it?** Cross-reference: find all equations `sel * (... col ...) = 0` and verify each such `sel` has a corresponding range check

**Critical pattern**: A decomposition variable range-checked under `sel_variant_A` but used in equations under `sel_variant_B` without a range check → **Critical** finding.

### Phase 3: Deep Analysis (only on candidates)

For each candidate, read the relevant PIL file (group by file to minimize reads) and check:
1. **Boolean**: `col * (1 - col) = 0`?
2. **Lookup/range check**: `sel { col } in table { ... }`?
3. **Equality derivation**: `col = expr` or `sel * (col - expr) = 0`?
4. **Incoming permutation**: Column in DESTINATION tuple from another file?
5. **Inverse column**: Name contains `_inv` (algebraically determined)?
6. **Conditional range check**: Range check gated by specific selector? → MEDIUM
7. **Decomposition variable**: Used in arithmetic decomposition equation? → Check Phase 2.5 results

### Phase 4: Completeness Check

Verify coverage by counting `pol commit` per file and ensuring all files were analyzed:
```bash
for f in pil/vm2/*.pil pil/vm2/**/*.pil; do
  [ -f "$f" ] || continue
  echo "$f: $(grep -c 'pol commit' "$f" 2>/dev/null || echo 0) columns"
done
```

## False Positive Avoidance

| Pattern | Detection | Action |
|---------|-----------|--------|
| **Incoming permutation** | `grep NAMESPACE.col` in other files | INFO (bound by caller) |
| **Inverse column** | Name contains `_inv` | LOW (algebraically determined) |
| **Equation-derived** | `sel * (col - expr) = 0` | LOW (transitively bounded) |
| **Crypto gadget I/O** | File in CRYPTO_GADGETS | Check incoming perm FIRST |
| **Conditional range** | Range check with specific sel | MEDIUM (note the condition) |

### Crypto Gadget Binding Map

| Gadget File | Input Columns | Bound By |
|-------------|--------------|----------|
| `poseidon2_perm.pil` | `a_0-a_3`, `b_0-b_3` | `poseidon2_mem.pil`, `poseidon2_hash.pil` |
| `keccakf1600.pil` | `state_in_*` | `keccak_memory.pil` |
| `sha256.pil` | `init_*` | Caller context |
| `ecc.pil` | `p_x, p_y, q_x, q_y` | Memory reads |

**For crypto gadgets**: Only flag if NO incoming permutation found.

## Vulnerable vs Secure Patterns

### VULNERABLE: Unbounded arithmetic intermediate
```pil
pol commit c_hi;  // High limb of multiplication
// Only constraint: decomposition equation
sel_mul * (a * b - c - c_hi * (max + 1)) = 0;
// c_hi has no range check! Prover can set any c_hi to get any c.
```

### VULNERABLE: Conditional range check missing cases
```pil
pol commit c_hi;
// ONLY bounds U128 case
sel_mul_u128 { c_hi } in range_check.sel_64 { range_check.value };
// Non-U128 multiplication: c_hi UNBOUNDED
```

### SECURE: Range-checked intermediate
```pil
pol commit c_hi;
sel_mul { c_hi } in range_check.sel_64 { range_check.value };  // ALL cases
sel_mul * (a * b - c - c_hi * (max + 1)) = 0;
```

### FALSE POSITIVE: Incoming permutation (crypto I/O)
```pil
// poseidon2_perm.pil
pol commit a_0, a_1, a_2, a_3;  // Looks unbounded locally!

// BUT poseidon2_mem.pil:
poseidon2_perm.sel { poseidon2_perm.a_0, poseidon2_perm.a_1, ... }
// Source tuple constrains these values → SAFE
```

### FALSE POSITIVE: Equation-derived intermediate
```pil
pol commit T_0_4;
sel * (T_0_4 - (4 * T_0_1 + T_0_3)) = 0;  // Derived from other values
// If T_0_1, T_0_3 bounded → T_0_4 transitively bounded
```

## Example Pattern: Unbounded Witness in Modular Reduction

Consider a multiplication gadget that decomposes the product into low and high limbs:

```pil
pol commit result_hi;  // High limb of decomposition

// One variant has a range check:
sel_variant_A { result_hi } in range_check.sel_N { range_check.value };

// Other variants use result_hi in a decomposition equation but never range-check it:
sel_op * IS_OTHER_VARIANT * (input_a * input_b - output - (modulus + 1) * result_hi) = 0;
```

**Pattern**: `result_hi` is range-checked only under a specific variant selector. For all other variants, a malicious prover can set `result_hi` to any field element, solving the decomposition equation for an arbitrary `output`. This is a **Critical** soundness bug because it allows forging arithmetic results.

**Fix**: Add a universal range check covering all variants, or add per-variant range checks for each case.

## Checklist

For each `pol commit X`:
- [ ] Boolean constraint `X * (1 - X) = 0`?
- [ ] In lookup/permutation tuple `{ X }`?
- [ ] Equality `X = expr` with bounded expr?
- [ ] Inverse column (name contains `_inv`)?
- [ ] **Incoming permutation from another file?** (NEW)
- [ ] **Equation-derived `sel * (X - expr) = 0`?** (NEW)
- [ ] If range check exists, is it conditional or universal?

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t3-witness-boundedness` |
| Target | `{path}` |
| Columns Analyzed | `{N}` |
| Findings | `{e.g., "1 Critical"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Finding Format
- **ID**: `vm2-audit-t3-witness-boundedness-{file}-{line}-{column}`
- **Severity**: Critical / High / Medium / Low / Info
- **Column**: `column_name`
- **Description**: What boundedness checks failed
- **Exploitability**: high / medium / low
- **Fix**: Add range check or document safety

### JSON Output (required)
```json
{
  "skill": "vm2-audit-t3-witness-boundedness",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-witness-boundedness-gadget-42-result_hi",
    "severity": "critical",
    "file": "pil/vm2/gadget.pil",
    "line": 42,
    "column": "result_hi",
    "description": "Unbounded for non-variant-A cases. Range check only gated by sel_variant_A.",
    "exploitability": "high",
    "fix": "Add universal range check or per-variant range checks"
  }]
}
```
