---
name: vm2-audit-witness-boundedness
description: Audit VM2/AVM PIL files for unbounded witness columns. Critical soundness issue where committed polynomials lack boolean, lookup, or range constraints, allowing malicious provers to set arbitrary field values for intermediates like c_hi, quotients, or helpers.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 2.0.0
---

# VM2 Witness Boundedness Audit

## Purpose
Detect committed polynomials (witness columns) that are unbounded - not constrained by boolean checks, lookups, permutations, or derivation from bounded values.

**Key improvement (v2.0)**: Track INCOMING permutations to avoid false positives on crypto gadget I/O.

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
- **Critical**: Unbounded arithmetic intermediate affecting output (alu, memory)
- **High**: Unbounded intermediate with no incoming permutation
- **Medium**: Partial boundedness (conditional range check)
- **Low**: Inverse columns, equation-derived intermediates
- **Info**: Crypto gadget I/O with incoming permutation (expected pattern)

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

### Step 0: Categorize File Type
```bash
# Crypto gadgets - likely bound by callers
CRYPTO_GADGETS="poseidon2_perm|keccakf1600|sha256|ecc|scalar_mul"

# Arithmetic gadgets - primary audit targets
ARITHMETIC="alu|ff_gt|gt|bitwise"
```

### Step 1: Find Committed Columns
```bash
grep -rn "pol commit" pil/vm2/<file>.pil
```

### Step 2: Check Direct Boundedness
```bash
# Boolean constraint
grep -n "col_name.*(1 - col_name)" pil/vm2/<file>.pil

# Lookup/range check (column in tuple)
grep -n "{ col_name" pil/vm2/<file>.pil | grep -E "in |is "

# Equality constraint
grep -n "col_name = \|col_name =" pil/vm2/<file>.pil
```

### Step 3: Check Inverse Columns (Safe)
```bash
# Naming pattern: *_inv, *_inverse
grep -n "_inv\|inverse" pil/vm2/<file>.pil
```
Inverses are algebraically determined - not exploitable.

### Step 4: Check Incoming Permutations (NEW - Critical for FP avoidance)
```bash
# Check if column is bound as permutation DESTINATION
# For namespace.column, search OTHER files for references
grep -rn "NAMESPACE\.COL_NAME" pil/vm2/ --include="*.pil" | grep -v "<file>.pil"
```

**Example for poseidon2_perm.a_0:**
```bash
grep -rn "poseidon2_perm\.a_0" pil/vm2/ --include="*.pil" | grep -v "poseidon2_perm.pil"
# Expected: poseidon2_mem.pil:163 binds it as destination
```

If column appears after `is NAMESPACE.` or in `NAMESPACE.sel { NAMESPACE.col }` → **transitively bounded by source**.

### Step 5: Check Equation Derivation (NEW)
```bash
# Column constrained by equation: sel * (COL - expr) = 0
grep -n "COL_NAME\s*-" pil/vm2/<file>.pil | grep "= 0"
```
If gated by sel → column derived from expr, bounded if expr is bounded.

### Step 6: Check Conditional Boundedness
```bash
# Range check gated by specific selector
grep -n "{ col_name" pil/vm2/<file>.pil | grep "in range_check"
# Check what selector gates it - is it always active or conditional?
```
Mark as MEDIUM if range check exists but is conditional (e.g., `sel_mul_u128` only).

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

## Real Bug: Multiplication c_hi (PR #18192)

```pil
// alu.pil line 211
pol commit c_hi;

// U128 case - HAS range check (line 247):
sel_mul_u128 { c_hi, constant_64 } in range_check.sel_alu { ... };

// Non-U128 case - NO range check:
sel_op_mul * IS_NOT_U128 * (1 - sel_tag_err) * (ia * ib - ic - (max_value + 1) * c_hi) = 0;
```

**Attack**: For U64/U32/etc multiplication, set arbitrary c_hi to forge any output.

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
| Skill | `vm2-audit-witness-boundedness` |
| Target | `{path}` |
| Columns Analyzed | `{N}` |
| Findings | `{e.g., "1 Critical"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Finding Format
- **ID**: `vm2-audit-witness-boundedness-{file}-{line}-{column}`
- **Severity**: Critical / High / Medium / Low / Info
- **Column**: `column_name`
- **Description**: What boundedness checks failed
- **Exploitability**: high / medium / low
- **Fix**: Add range check or document safety

### JSON Output (required)
```json
{
  "skill": "vm2-audit-witness-boundedness",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-witness-boundedness-alu-211-c_hi",
    "severity": "critical",
    "file": "pil/vm2/alu.pil",
    "line": 211,
    "column": "c_hi",
    "description": "Unbounded for non-U128 multiplication. Range check at line 247 only gates by sel_mul_u128.",
    "exploitability": "high",
    "fix": "Add range check for all mul cases or constrain c_hi via decomposition"
  }]
}
```
