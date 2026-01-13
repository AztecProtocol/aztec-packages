---
name: vm2-audit-irreversible-flags
description: Audit VM2/AVM PIL files for reversible state flags. Soundness issue where flags that should be monotonic (padding, error, halted) can toggle back, allowing exit from padding early, error clearing, or computation restart.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Irreversible Flags Audit

## Purpose
Detect state flags that should be monotonic (once set, stay set) but lack the constraint preventing them from toggling back.

**Note**: For trace continuity issues (`sel` dropping before `end`), use `vm2-audit-premature-termination`. This skill focuses on flags like `is_padding`, `halted`, `error` that should be irreversible.

## When to Use
- Auditing multi-row computations with padding states
- Reviewing error flag propagation
- Checking halt/done conditions

## Severity Assessment
- **High**: Reversible flag affects security (padding, error)
- **Medium**: Reversible flag affects computation integrity
- **Low**: Flag with explicit reset mechanism (intentional)

## Core Pattern

```pil
// VULNERABLE: Padding can flip back to 0
pol commit is_padding;
is_padding * (1 - is_padding) = 0;  // Boolean only!
// Can set is_padding=1 then is_padding'=0

// SECURE: Monotonic constraint
is_padding * (1 - is_padding) = 0;       // Boolean
is_padding * (1 - is_padding') = 0;      // Irreversible: once 1, stays 1
```

## Workflow

### Step 1: Find State Flags
```bash
grep -rn "pol commit.*padding\|pol commit.*halted\|pol commit.*done\|pol commit.*error\|pol commit.*finished" pil/vm2/ --include="*.pil"
```

### Step 2: Check Monotonic Constraint
```bash
# For each flag, look for: flag * (1 - flag') = 0
grep -n "is_padding.*(1 - is_padding')" pil/vm2/<file>.pil
grep -n "halted.*(1 - halted')" pil/vm2/<file>.pil
```

### Step 3: Check for Reset Mechanism (False Positive)
```bash
# Some flags intentionally reset via start signal
grep -n "is_padding'\s*=\|halted'\s*=" pil/vm2/<file>.pil
```

If `flag' = start' * initial + (1 - start') * flag`, this is a reset-based state machine.

### Step 4: Check Implicit Monotonicity
If flag is enabled by irreversible condition:
```pil
pol commit is_padding;
pol commit remaining;
sel * is_padding * remaining = 0;  // padding only when remaining=0
// If remaining can only decrease, padding is implicitly monotonic
```

## Vulnerable vs Secure Patterns

### VULNERABLE: Reversible padding
```pil
pol commit is_padding;
is_padding * (1 - is_padding) = 0;
// Missing: is_padding * (1 - is_padding') = 0
```

### SECURE: Monotonic padding
```pil
pol commit is_padding;
is_padding * (1 - is_padding) = 0;
#[PADDING_IRREVERSIBLE]
is_padding * (1 - is_padding') = 0;
```

### FALSE POSITIVE: Reset-based
```pil
pol commit is_active;
// Explicitly reset by start
is_active' = start' + is_active * (1 - end);  // Intentional reset
```

### FALSE POSITIVE: Implicitly monotonic
```pil
pol commit is_done;
sel * is_done * counter = 0;  // done only when counter=0
// counter only decreases via range-checked decrement
// Therefore is_done is implicitly irreversible
```

## Real Bug: Data Copy Padding (PR #17877)

```pil
// data_copy.pil
pol commit is_padding;
is_padding * (1 - is_padding) = 0;
// MISSING: is_padding * (1 - is_padding') = 0
```

**Attack**: Enter padding, exit padding, continue reading/writing beyond intended region.

## Flags to Check

| Flag Pattern | Expected Behavior |
|-------------|-------------------|
| `is_padding`, `in_padding` | Once true, stays true |
| `halted`, `done`, `finished` | Once true, stays true |
| `sel_error`, `has_error` | Once true, stays true (per context) |
| `reached_max_*` | Once true, stays true |

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-irreversible-flags` |
| Target | `{path}` |
| Flags Analyzed | `{N}` |
| Findings | `{e.g., "1 High"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Finding Format
- **ID**: `vm2-audit-irreversible-flags-{file}-{line}-{flag}`
- **Severity**: High / Medium / Low
- **Flag**: `flag_name`
- **Description**: Missing monotonic constraint
- **Fix**: Add irreversibility constraint

### JSON Output (required)
```json
{
  "skill": "vm2-audit-irreversible-flags",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-irreversible-flags-data_copy-65-is_padding",
    "severity": "high",
    "file": "pil/vm2/data_copy.pil",
    "line": 65,
    "flag": "is_padding",
    "description": "Padding flag can toggle back, no monotonic constraint",
    "exploitability": "medium",
    "fix": "Add: is_padding * (1 - is_padding') = 0"
  }]
}
```
