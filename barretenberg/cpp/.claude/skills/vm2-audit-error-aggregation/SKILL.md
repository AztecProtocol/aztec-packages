---
name: vm2-audit-error-aggregation
description: Audit VM2/AVM PIL files for missing error aggregation constraints. Critical soundness issue where aggregate error flags only have boolean constraints but no constraint tying them to individual errors, allowing provers to claim no error when individual errors exist and bypass error handling logic.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Error Aggregation Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for missing error aggregation. Error flags are not properly aggregated from individual error conditions - the aggregate error flag only has a boolean constraint but no constraint tying it to the individual errors.

**Bug Type**: Soundness
**Severity**: Critical
**Frequency**: Low

## Why This is Critical

Missing error aggregation allows complete bypass of error handling:
- **Claim no error when individual errors exist**: Hide failures
- **Bypass error handling logic**: Continue execution after failure
- **Continue execution after failure**: Corrupt state
- **Hide invalid operations**: Make invalid operations appear valid

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All Aggregate Error Flags

```bash
# Find aggregate error flags
grep -rn "pol commit sel_err\|pol commit.*_error\|pol commit.*_failure\|pol commit.*err$" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find error-related selectors
grep -rn "sel_.*err\|sel_err" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Find Individual Error Flags

For each aggregate error, find the individual errors that should feed into it:

```bash
# Find individual error flags
grep -rn "err_\|_err\|out_of_range\|overflow\|underflow\|invalid" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Verify Aggregation Constraint Exists

For each aggregate error, verify there's a constraint connecting it to individual errors:

```bash
# Look for aggregation constraints
grep -rn "sel_err.*=\|sel_err -" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for implication constraints (alternative pattern)
grep -rn "err.*\* (1 - sel_err)" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected patterns:
```pil
// Direct aggregation
sel_err = err_a + err_b + err_c;

// Or implication pattern
err_a * (1 - sel_err) = 0;  // err_a => sel_err
```

### Step 4: Check for Commented-Out Aggregation

```bash
# Find commented-out error aggregation (CRITICAL!)
grep -rn "//.*sel_err.*=\|//.*error.*=\|FIXME.*err\|TODO.*err" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 5: Verify Mutual Exclusivity (If Using Sum)

If aggregation uses sum (`sel_err = err_a + err_b`), errors must be mutually exclusive:

```bash
# Check for mutual exclusivity constraints
grep -rn "err_.*\* err_\|err_a.*err_b" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

If errors can co-occur, sum aggregation is WRONG - use OR pattern instead.

### Step 6: Trace Error Propagation

Follow error flags through the hierarchy:
1. Individual error source
2. Component-level aggregate
3. Higher-level handling (e.g., execution error)

Verify each level properly aggregates from the level below.

## Aggregation Patterns

### Pattern 1: Mutually Exclusive Errors (Sum)

```pil
// Errors cannot occur simultaneously
// Safe to use sum since at most one is 1
sel_err = err_a + err_b + err_c;

// Prerequisites:
err_a * (1 - err_a) = 0;  // Boolean
err_b * (1 - err_b) = 0;  // Boolean
err_c * (1 - err_c) = 0;  // Boolean
// Plus mutual exclusivity (at most one can be 1)
```

### Pattern 2: Non-Exclusive Errors (OR)

```pil
// Errors can co-occur - use boolean OR formula
sel_err = 1 - (1 - err_a) * (1 - err_b);

// Or use implication pattern:
#[ERR_A_IMPLIES_SEL_ERR]
err_a * (1 - sel_err) = 0;  // err_a => sel_err

#[ERR_B_IMPLIES_SEL_ERR]
err_b * (1 - sel_err) = 0;  // err_b => sel_err

#[NO_ERR_IMPLIES_NO_SEL_ERR]
(1 - err_a) * (1 - err_b) * sel_err = 0;  // (~err_a & ~err_b) => ~sel_err
```

### Pattern 3: Hierarchical Aggregation

```pil
// Low-level errors aggregate to mid-level
sel_err_low = err_a + err_b;

// Mid-level aggregates to high-level
sel_err_high = sel_err_low + err_c;
```

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Only Boolean Constraint

```pil
// VULNERABLE: Only boolean constraint on aggregate
pol commit sel_err;           // Aggregate error
pol commit err_type_a;        // Individual error A
pol commit err_type_b;        // Individual error B

sel_err * (1 - sel_err) = 0;  // Boolean constraint only!

// MISSING: sel_err = err_type_a + err_type_b;
// Prover can set sel_err = 0 even when err_type_a = 1!
```

### Vulnerable Pattern: Commented-Out Aggregation

```pil
// VULNERABLE: Aggregation commented out!
sel_parsing_err * (1 - sel_parsing_err) = 0;
// FIXME: constrain this again once all execution opcodes are supported.
// sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;
```

### Secure Pattern: Proper Aggregation

```pil
// SECURE: Proper aggregation
pol commit sel_err;
pol commit err_type_a;
pol commit err_type_b;

// Boolean constraints
#[SEL_ERR_BOOL]
sel_err * (1 - sel_err) = 0;
#[ERR_TYPE_A_BOOL]
err_type_a * (1 - err_type_a) = 0;
#[ERR_TYPE_B_BOOL]
err_type_b * (1 - err_type_b) = 0;

// Aggregation constraint (CRITICAL!)
#[ERROR_AGGREGATION]
sel_err = err_type_a + err_type_b;

// Note: This works because individual errors are mutually exclusive
// If they can co-occur, use: sel_err = 1 - (1 - err_a) * (1 - err_b)
```

## Historical Examples

### Example 1: Instruction Fetching (Critical!)

```pil
// BEFORE: Only boolean, no aggregation
sel_parsing_err * (1 - sel_parsing_err) = 0;
// FIXME: commented out:
// sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;

// AFTER: Proper aggregation
#[ERROR_AGGREGATION]
sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;
```
**Impact**: Complete bypass of instruction validation.

### Example 2: Execution Errors

```pil
// Multiple error sources should aggregate
sel_err = sel_opcode_err + sel_bytecode_err + sel_addressing_err + ...;
```

## Test Patterns

### Test 1: Error Not Aggregated (Suppressed Error)

```cpp
TEST_F(ComponentTest, NegativeErrorNotAggregated)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::err_type_a, 1 },    // Individual error set!
         { C::err_type_b, 0 },
         { C::sel_err, 0 }},      // But aggregate claims no error!
    });

    // Should fail on aggregation constraint
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "ERROR_AGGREGATION"
    );
}
```

**Interpretation**:
- **Test passes (throws)**: Aggregation enforced - secure
- **Test fails (no throw)**: Error can be suppressed - CRITICAL vulnerability

### Test 2: Fake Error (False Positive)

```cpp
TEST_F(ComponentTest, NegativeFakeError)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::err_type_a, 0 },    // No individual errors
         { C::err_type_b, 0 },
         { C::sel_err, 1 }},      // But aggregate claims error!
    });

    // Should fail on aggregation constraint
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "ERROR_AGGREGATION"
    );
}
```

### Test 3: Multiple Errors Set (If Non-Exclusive)

```cpp
TEST_F(ComponentTest, NegativeMultipleErrorsNotExclusive)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::err_type_a, 1 },    // Both errors set
         { C::err_type_b, 1 },
         { C::sel_err, 2 }},      // Sum would be 2, not boolean!
    });

    // If using sum aggregation, this should fail boolean check
    EXPECT_THROW(
        check_relation<ComponentRelation>(trace),
        std::runtime_error
    );
}
```

### Test 4: Verify All Individual Errors Aggregate

```cpp
TEST_F(ComponentTest, NegativeEachIndividualErrorAggregates)
{
    // Test each individual error separately
    std::vector<C> error_columns = {
        C::err_type_a,
        C::err_type_b,
        C::err_type_c
    };

    for (auto err_col : error_columns) {
        auto trace = TestTraceContainer({
            {{ C::sel, 1 },
             { err_col, 1 },       // Only this error set
             { C::sel_err, 0 }},   // But aggregate claims no error
        });

        // Should fail for each individual error
        EXPECT_THROW(
            check_relation<ComponentRelation>(trace),
            std::runtime_error
        );
    }
}
```

## Audit Checklist

1. **Find all aggregate error flags**:
   - [ ] `sel_err`, `sel_*_err`, `*_error`, `*_failure`
   - [ ] Document each aggregate found

2. **For each aggregate, find individual errors**:
   - [ ] List all individual error flags in the component
   - [ ] Determine which should feed into the aggregate

3. **Verify aggregation constraint exists**:
   - [ ] Look for: `sel_err = individual_errors...`
   - [ ] Or: `individual_err * (1 - sel_err) = 0` for each
   - [ ] Verify ALL individual errors are included

4. **Check for commented-out aggregation**:
   - [ ] Search for `//.*sel_err.*=`
   - [ ] Search for `FIXME.*err`, `TODO.*err`

5. **Verify mutual exclusivity (if using sum)**:
   - [ ] Can multiple errors occur simultaneously?
   - [ ] If yes, sum aggregation is WRONG - use OR pattern

6. **Trace error propagation**:
   - [ ] Individual → Component aggregate → Higher-level
   - [ ] Verify each level properly aggregates

## Fix Pattern

```pil
// Add aggregation constraint

// For mutually exclusive errors (sum):
#[ERROR_AGGREGATION]
sel_err = err_type_a + err_type_b + err_type_c;

// For non-exclusive errors (implication):
#[ERR_A_IMPLIES_SEL_ERR]
err_type_a * (1 - sel_err) = 0;
#[ERR_B_IMPLIES_SEL_ERR]
err_type_b * (1 - sel_err) = 0;
#[NO_ERR_IMPLIES_NO_SEL_ERR]
(1 - err_type_a) * (1 - err_type_b) * sel_err = 0;
```

## Build and Test Commands

```bash
# Regenerate C++ from PIL
vmp  # or: ../../bb-pilcom/target/release/bb_pil pil/vm2

# Build VM2 tests
vmb  # or: cmake --preset build && cd build && ninja vm2_tests

# Run all VM2 tests
vmt  # or: ./build/bin/vm2_tests

# Run specific component test
vmtg "ComponentConstraining*"
```

## Common Locations to Audit

Error aggregation is critical in:
- **Instruction fetching**: `instr_fetching.pil` - parsing errors
- **Execution**: `execution.pil` - operation errors
- **ALU**: `alu.pil` - arithmetic errors (overflow, division by zero)
- **Memory**: `memory.pil` - access errors
- **Bytecode**: `bytecode.pil` - retrieval errors
- **Gas**: Gas exhaustion errors

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/10-error-aggregation.md)
- [Commented-Out Constraints Skill](../vm2-audit-commented-constraints/SKILL.md)
- [Missing Error Gating Skill](../vm2-audit-missing-error-gating/SKILL.md)

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
| Skill | vm2-audit-error-aggregation |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-error-aggregation-[file]-[line]-[subtype] [SEVERITY]
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
  "skill": "vm2-audit-error-aggregation",
  "finding_prefix": "vm2-audit-error-aggregation",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-error-aggregation-filename-line-subtype",
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

- Format: `vm2-audit-error-aggregation-[filename]-[line]-[subtype]`
- Example: `vm2-audit-error-aggregation-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
