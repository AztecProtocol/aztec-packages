---
name: vm2-audit-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Tracegen-PIL Alignment Audit

Audits for tracegen-PIL misalignment - **completeness issue** where trace generation doesn't match PIL constraints.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## Common Misalignment Types

| Type | Example | Impact |
|------|---------|--------|
| Missing column | `row.a_inv` never set | Constraint fails |
| Wrong computation | `static_cast<uint64_t>(tag_a - tag_b)` (wrong for negative) | Wrong value |
| Missing event handler | Error case not handled | Trace incomplete |
| Wrong selector condition | Boolean logic doesn't match PIL semantics | Wrong selector |

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Verify Column Assignments

```bash
# Find columns in PIL
grep -n "pol commit" pil/vm2/<component>.pil

# Check each is set in tracegen
grep -n "row\\." src/barretenberg/vm2/tracegen/<component>*.cpp
```

For each `pol commit col`, verify tracegen sets `row.col`.

### Step 2: Check Constraint Alignment

For each PIL constraint, verify tracegen computes values correctly:

```bash
# Find constraints
grep -n "#\[" pil/vm2/<component>.pil
```

Common issues:
- **Field arithmetic**: `static_cast<uint64_t>(a - b)` fails for negative results → use `FF(a) - FF(b)`
- **Selector derivation**: Work backwards from PIL `sel = A + B + C` to determine when each sub-selector should be 1
- **Event handling**: Each simulation event type needs a tracegen handler

### Step 3: Verify Event Coverage

```bash
# Find event types
grep -rn "struct.*Event" src/barretenberg/vm2/simulation/ --include="*.hpp"

# Find handlers
grep -rn "process.*event\|handle" src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

Ensure error events emit proper trace rows.

## Patterns

### Vulnerable
```cpp
row.tag_diff = static_cast<uint64_t>(tag_a - tag_b);  // Wrong for negative!
```

### Secure
```cpp
row.tag_diff = FF(tag_a) - FF(tag_b);  // Field subtraction
```

### False Positive: Start-Row-Only Columns (NO FIX NEEDED)

Columns without propagation are SAFE if influence is strictly limited to start rows:
```pil
// SAFE: offset gated by sel_start, never referenced when sel_start=0
offset_plus_size = sel_start * (offset + copy_size);
```

**Before flagging missing propagation**:
1. Find ALL references (direct + transitive via intermediate defs)
2. Verify EVERY reference is gated by start-row selector (`sel_start * expr`)
3. Confirm gating selector is boolean-constrained and only active on start rows
4. Check column is NOT in lookups/permutations outside start-row gating
5. IF any ungated usage OR next-row reference (`col'`) → Flag Vulnerability
6. ELSE → Mark False Positive

## Examples

### Example 1: Missing Column (PR #18864)
```cpp
// execution_batched_tags_diff_inv never set → constraint always fails
```

### Example 2: Wrong Selector Condition (ECC)
```cpp
// PIL: sel = double_op + add_op + INFINITY_PRED
// where double_op = x_match * y_match, INFINITY_PRED = x_match * (1 - y_match)
// Therefore add_op = 1 when x_match = 0

// WRONG: bool add_predicate = (!x_match && !y_match);
// RIGHT: bool add_predicate = !x_match;
```

### Example 3: Wrong Exception Type (PR #18864)
```cpp
// Caller catches Sha256CompressionException, code throws runtime_error
// → error path broken, trace not generated
```

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-tracegen-pil-alignment` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-tracegen-pil-alignment-filename-123-issue-type` (MUST use full skill name: `vm2-audit-tracegen-pil-alignment`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-tracegen-pil-alignment.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-tracegen-pil-alignment",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-tracegen-pil-alignment-filename-123-issue-type",
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
  "skill": "vm2-audit-tracegen-pil-alignment",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.