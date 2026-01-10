---
name: vm2-audit-constraint-typos
description: Audit VM2/AVM PIL files for constraint typos where the wrong variable is constrained. Soundness issue where copy-paste errors or variable name confusion leads to constraining `addr` instead of `size`, `index` instead of `length`, etc. Allows unconstrained values to be set arbitrarily by malicious provers.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Constraint Typo Audit

Audits for typos where the wrong variable is constrained due to copy-paste errors or variable name confusion. This is a **soundness vulnerability** - syntactically valid, silently incorrect, and leaves the intended value unconstrained.

### Example from PR #19404

```pil
// VULNERABLE: constrains addr instead of size
#[CD_SIZE_ENQUEUED_CALL_IS_ZERO]
enqueued_call_start * parent_calldata_addr = 0;  // WRONG!

// FIXED: constrains the correct variable
#[CD_SIZE_ENQUEUED_CALL_IS_ZERO]
enqueued_call_start * parent_calldata_size = 0;  // CORRECT
```

**Impact**: A malicious prover could set `parent_calldata_size` to any non-zero value at the start of an enqueued call, potentially causing:
- Incorrect calldata bounds
- Memory access violations
- Program state corruption

## Common Typo Patterns

### Pattern 1: addr vs size Confusion

Similar column names for related concepts:
- `parent_calldata_addr` vs `parent_calldata_size`
- `last_child_returndata_addr` vs `last_child_returndata_size`
- `memory_addr` vs `memory_size`

### Pattern 2: index vs length Confusion

```pil
// VULNERABLE
some_selector * byte_index = 0;   // Meant to constrain length!

// CORRECT
some_selector * byte_length = 0;
```

### Pattern 3: src vs dst Confusion

```pil
// VULNERABLE: constrained source instead of destination
copy_start * dst_addr = 0;  // If this was meant to be src_addr

// Or vice versa
copy_start * src_addr = 0;  // If this was meant to be dst_addr
```

### Pattern 4: current vs next row Confusion

```pil
// VULNERABLE: constrained wrong row
sel * value = 0;    // Meant to constrain next row!

// CORRECT
sel * value' = 0;   // Prime notation for next row
```

### Pattern 5: Related Column Groups

Watch for typos within groups of similar columns:
- `a`, `b`, `c` (operation inputs)
- `op1`, `op2`, `op3`
- `lo`, `hi`, `mid`
- `start`, `end`, `current`
- `read`, `write`, `exec`

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify Constraint Intent from Names

Read the constraint name and comment to understand what SHOULD be constrained:

```bash
# Find all named constraints
grep -rn "#\[.*\]" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

For each constraint:
1. Parse the constraint name (e.g., `CD_SIZE_ENQUEUED_CALL_IS_ZERO`)
2. Identify the implied target (e.g., "CD_SIZE" implies calldata size)
3. Verify the actual constrained column matches the name

### Step 2: Cross-Reference with Comments

```bash
# Find constraints with comments
grep -B1 "#\[" barretenberg/cpp/pil/vm2/<component>.pil | grep -v "^--$"
```

Check that:
- Comment describes what SHOULD be constrained
- Actual constraint matches the comment
- No mismatch between documentation and implementation

### Step 3: Analyze Similar Column Groups

For each PIL file, identify groups of similarly-named columns:

```bash
# Find columns with similar prefixes
grep "pol commit\|pol " barretenberg/cpp/pil/vm2/<component>.pil | \
    sed 's/.*pol \(commit \)\?//' | sort | uniq
```

Then for each group (e.g., `foo_addr`, `foo_size`, `foo_offset`):
1. Find all constraints involving any column from the group
2. Verify each constraint targets the semantically correct column

### Step 4: Check Initialization Constraints

Initialization constraints are high-risk for typos:

```bash
# Find initialization constraints (setting values to 0 at start)
grep -rn "start\|first\|init" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

For each initialization:
- Verify ALL columns that need initialization have constraints
- Verify each constraint targets the correct column

### Step 5: Check Propagation Constraints

Propagation constraints often involve multiple related columns:

```bash
# Find propagation constraints (value stays same across rows)
grep -rn "' -\|')" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Verify propagation targets match the semantic intent.

### Step 6: Compare PIL with Tracegen

Cross-reference constraints with tracegen to verify consistency:

```bash
# Find how values are set in tracegen
grep -rn "column_name\s*=" barretenberg/cpp/src/barretenberg/vm2/tracegen/<component>*.cpp
```

Verify:
- Tracegen sets values that match constraint expectations
- No mismatch between what tracegen initializes and what constraints check

## Red Flags to Watch For

1. **Constraint names containing column type hints** (SIZE, ADDR, INDEX, etc.)
   - Verify the actual column matches the hint

2. **Groups of similar constraints** (e.g., initializing multiple related columns)
   - Verify no copy-paste errors

3. **Long column names with common prefixes**
   - `execution_parent_calldata_addr` vs `execution_parent_calldata_size`
   - Easy to confuse in long expressions

4. **Constraints with comments describing different columns**
   - Comment says "constrain X" but code constrains Y

5. **Autocomplete-prone names**
   - IDE autocomplete might select wrong similar name

## Examples

### Example 1: Context PIL - returndata and calldata (PR #19404)

```pil
// BEFORE (VULNERABLE):
#[CD_SIZE_ENQUEUED_CALL_IS_ZERO]
enqueued_call_start * parent_calldata_addr = 0;

#[RD_SIZE_IS_ZERO]
enqueued_call_start * last_child_returndata_addr = 0;

// AFTER (FIXED):
#[CD_SIZE_ENQUEUED_CALL_IS_ZERO]
enqueued_call_start * parent_calldata_size = 0;

#[RD_SIZE_IS_ZERO]
enqueued_call_start * last_child_returndata_size = 0;
```

**Root cause**: Copy-paste from addr constraints without updating to size.

**Detection**: Constraint names contain "SIZE" but constrained columns are "addr".

## Fix Pattern

When a typo is found:

1. **Identify the correct column** based on constraint name and semantic intent
2. **Update the PIL constraint** to target the correct column
3. **Run `vmp`** to regenerate C++ relations
4. **Add a negative test** to verify the fix
5. **Audit for similar typos** in the same file and related files

```pil
// Fix example:
// Before: selector * wrong_column = 0;
// After:  selector * correct_column = 0;
```

## REQUIRED OUTPUT FORMAT

### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format

- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### Machine-Readable JSON (REQUIRED)

<!-- MACHINE-READABLE FINDINGS -->
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
<!-- END MACHINE-READABLE FINDINGS -->

For no findings:
<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```
<!-- END MACHINE-READABLE FINDINGS -->
