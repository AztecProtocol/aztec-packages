---
name: vm2-audit-exception-type-matching
description: Audit VM2/AVM simulation code for exception type matching issues. Completeness issue where simulation code throws a different exception type than what the caller catches, causing error handling paths to fail completely and valid error cases to crash instead of producing proper traces.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Exception Type Matching Audit Skill

## Overview

This skill audits VM2/AVM simulation code for exception type matching issues. When simulation code throws a different exception type than what the caller catches, error handling paths fail completely.

**Bug Type**: Completeness
**Severity**: Medium
**Frequency**: Low

## Why This is Important

This is a **completeness** issue - honest provers crash or produce incorrect traces because:
- Error is thrown but not caught at the right level
- Error handling code never executes
- Trace generation fails for valid error cases
- What should be a recoverable error becomes fatal

## The Problem

```cpp
// VULNERABLE: Throwing wrong exception type

// In callee (sha256_compression.cpp):
void compress(const Input& input) {
    if (invalid_condition) {
        throw std::runtime_error("SHA256 compression failed");  // WRONG TYPE!
    }
}

// In caller (execution.cpp):
try {
    sha256.compress(input);
} catch (const Sha256CompressionException& e) {  // Won't catch runtime_error!
    handle_sha256_error(e);
}
// runtime_error propagates up, crashes simulation!
```

## Audit Instructions

> **Note**: This skill focuses on C++ simulation code, not PIL files.

### Step 1: Find All Throw Statements

```bash
# Find all throw statements in simulation
grep -rn "throw " barretenberg/cpp/src/barretenberg/vm2/simulation/ --include="*.cpp"

# Find all throw statements in tracegen
grep -rn "throw " barretenberg/cpp/src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

### Step 2: Identify Exception Types Being Thrown

For each throw statement, identify:
- Is it a specific VM exception?
- Is it a generic `std::runtime_error` or `std::exception`?

```bash
# Find what exception types are defined
grep -rn "class.*Exception" barretenberg/cpp/src/barretenberg/vm2/ --include="*.hpp"
```

### Step 3: Find Corresponding Catch Blocks

```bash
# Find catch blocks
grep -rn "catch.*Exception\|catch.*exception\|catch.*error" barretenberg/cpp/src/barretenberg/vm2/ --include="*.cpp"
```

### Step 4: Verify Type Matching

For each throw/catch pair:
- Does the thrown type match what caller catches?
- Is there a catch-all that handles mismatches?

### Step 5: Trace Error Handling Paths

Follow the error flow:
1. Component throws exception
2. Caller catches and emits error event
3. Tracegen processes error event
4. PIL handles error case

```bash
# Find error event emissions
grep -rn "emit.*error\|error.*event\|ErrorType" barretenberg/cpp/src/barretenberg/vm2/ --include="*.cpp"
```

## Exception Hierarchy in VM2

```cpp
// Base VM exception
class VmException : public std::exception { ... };

// Specific exceptions for each component
class AddressingException : public VmException { ... };
class AluException : public VmException { ... };
class MemoryException : public VmException { ... };
class Sha256CompressionException : public VmException { ... };
class KeccakException : public VmException { ... };
class Poseidon2Exception : public VmException { ... };
class BytecodeException : public VmException { ... };
class GasException : public VmException { ... };

// Usage pattern:
try {
    component.operation();
} catch (const SpecificException& e) {
    handle_specific_error();
} catch (const VmException& e) {
    handle_general_vm_error();
} catch (const std::exception& e) {
    // Should not reach here for expected errors
    handle_unexpected_error();
}
```

## Common Mismatches to Check

| Component | Should Throw | Common Mistake |
|-----------|--------------|----------------|
| SHA256 | `Sha256CompressionException` | `std::runtime_error` |
| Keccak | `KeccakException` | `std::runtime_error` |
| ALU | `AluException` | `std::invalid_argument` |
| Memory | `MemoryException` | `std::out_of_range` |
| Addressing | `AddressingException` | `std::runtime_error` |
| Gas | `GasException` | `std::runtime_error` |

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Wrong Exception Type

```cpp
// VULNERABLE: Throwing generic exception
void Sha256Compression::compress(...) {
    if (error_condition) {
        throw std::runtime_error("SHA256 compression error");  // WRONG!
    }
}

// Caller expects specific type
try {
    sha256.compress(state, input);
} catch (const Sha256CompressionException& e) {
    // NEVER REACHED - runtime_error not caught!
    emit_error_event(ErrorType::Sha256Error);
}
// Simulation crashes instead of handling error
```

### Vulnerable Pattern: Overly Broad Catch

```cpp
// VULNERABLE: Overly broad catch hides type mismatches
try {
    component.operation();
} catch (const std::exception& e) {
    // Catches everything - masks specific error handling
    // May hide bugs where wrong exception type is thrown
}
```

### Vulnerable Pattern: Missing Catch Block

```cpp
// VULNERABLE: No try-catch around component that can throw
void process() {
    component.operation();  // What if this throws?
    // Exception propagates up, crashes simulation
}
```

### Secure Pattern: Matching Exception Types

```cpp
// SECURE: Correct exception type

// Define specific exception in header:
class Sha256CompressionException : public VmException {
public:
    explicit Sha256CompressionException(const std::string& msg)
        : VmException(msg) {}
};

// In callee:
void Sha256Compression::compress(...) {
    if (invalid_condition) {
        throw Sha256CompressionException("SHA256 compression failed");  // CORRECT!
    }
}

// In caller:
try {
    sha256.compress(input);
} catch (const Sha256CompressionException& e) {  // Now catches correctly
    handle_sha256_error(e);
}
```

### Secure Pattern: Layered Exception Handling

```cpp
// SECURE: Layered catches with safety net
try {
    operation();
} catch (const SpecificException& e) {
    handle_expected_error(e);
} catch (const VmException& e) {
    handle_vm_error(e);
} catch (const std::exception& e) {
    // Log unexpected exception type - indicates bug
    LOG_ERROR("Unexpected exception type: " << typeid(e).name());
    throw;  // Re-throw to fail loudly
}
```

## Historical Examples

### Example 1: SHA256 Compression (PR #18864)

```cpp
// BEFORE: Wrong exception type
// sha256_compression.cpp
void Sha256Compression::compress(...) {
    if (error_condition) {
        throw std::runtime_error("SHA256 compression error");
    }
}

// execution.cpp - caller expects specific type
try {
    sha256.compress(state, input);
} catch (const Sha256CompressionException& e) {
    // NEVER REACHED - runtime_error not caught!
    emit_error_event(ErrorType::Sha256Error);
}
// Simulation crashes instead of handling error gracefully

// AFTER: Correct exception type
void Sha256Compression::compress(...) {
    if (error_condition) {
        throw Sha256CompressionException("SHA256 compression error");
    }
}
```
**Impact**: Valid SHA256 error cases crash simulation.

## Audit Checklist

1. **Find all throw statements**:
   - [ ] `grep -rn "throw " simulation/`
   - [ ] Document each exception type thrown

2. **For each throw, verify exception type**:
   - [ ] Is it a specific VM exception?
   - [ ] Not generic `std::runtime_error`?
   - [ ] Not generic `std::exception`?

3. **Find corresponding catch blocks**:
   - [ ] `grep -rn "catch" simulation/`
   - [ ] Document what types are caught

4. **Verify type matching**:
   - [ ] Thrown type matches what caller catches?
   - [ ] Is there a catch-all safety net?

5. **Check exception class definitions**:
   - [ ] Exception classes properly defined?
   - [ ] Inherit from appropriate base class?

6. **Trace error handling paths**:
   - [ ] Exception thrown -> caught -> error event -> trace

## Red Flags

1. **Generic throws in component code**:
   ```cpp
   throw std::runtime_error(...);  // Should be specific type
   ```

2. **Overly broad catches**:
   ```cpp
   catch (const std::exception& e)  // May hide type mismatches
   ```

3. **Missing catch blocks**:
   ```cpp
   // No try-catch around component calls that can throw
   component.operation();  // What if this throws?
   ```

4. **Catch-and-ignore patterns**:
   ```cpp
   catch (...) {
       // Silently ignores all exceptions - hides bugs
   }
   ```

## When Generic `std::runtime_error` is Appropriate

Not all generic throws are bugs. `std::runtime_error` is **correct** for catastrophic failures that should crash simulation rather than produce an error trace:

| Appropriate Use | Why |
|-----------------|-----|
| Missing hints from data provider | Simulation cannot proceed without external data |
| Invalid merkle proofs | Would produce invalid ZK proof |
| Protocol limit violations (e.g., MAX_NULLIFIERS_PER_TX) | Transaction is fundamentally invalid |
| Internal consistency/sanity check failures | Indicates bug or corrupt data |
| Unknown opcodes | Programming error |

**Key question**: Should this error produce an error trace, or should it crash?

- **Error trace needed** → Use specific exception (e.g., `AluException`, `OutOfGasException`)
- **Crash appropriate** → `std::runtime_error` is fine

Examples of appropriate `std::runtime_error`:
```cpp
// OK: Hint not found - external data provider failure
if (it == hints.end()) {
    throw std::runtime_error("Sibling path hint not found");
}

// OK: Protocol limit exceeded - invalid transaction
if (nullifiers.size() > MAX_NULLIFIERS_PER_TX) {
    throw std::runtime_error("Too many nullifiers");
}

// OK: Explicit comment indicating intentional panic
// NOTE: Keep this a `std::runtime_error` so that the main loop panics.
throw std::runtime_error("Unknown opcode");
```

## Fix Patterns

### Fix 1: Change Exception Type

```cpp
// BEFORE:
throw std::runtime_error("Error message");

// AFTER:
throw SpecificComponentException("Error message");
```

### Fix 2: Add Missing Exception Class

```cpp
// In component_exception.hpp:
class ComponentException : public VmException {
public:
    explicit ComponentException(const std::string& msg)
        : VmException(msg) {}
};
```

### Fix 3: Update Catch Block

```cpp
// If throw type is correct but catch is wrong:
// BEFORE:
catch (const std::exception& e)

// AFTER:
catch (const SpecificException& e)
```

### Fix 4: Add Catch-All Safety Net

```cpp
try {
    operation();
} catch (const SpecificException& e) {
    handle_expected_error(e);
} catch (const VmException& e) {
    handle_vm_error(e);
} catch (const std::exception& e) {
    // Log unexpected exception type - indicates bug
    LOG_ERROR("Unexpected exception type: " << typeid(e).name());
    throw;  // Re-throw to fail loudly
}
```

## Common Locations to Audit

Exception type matching is critical in:
- **Simulation**: `barretenberg/cpp/src/barretenberg/vm2/simulation/*.cpp`
- **Tracegen**: `barretenberg/cpp/src/barretenberg/vm2/tracegen/*.cpp`
- **Exception headers**: `barretenberg/cpp/src/barretenberg/vm2/simulation/exceptions.hpp`
- **Component implementations**: SHA256, Keccak, ALU, Memory, etc.

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/23-exception-type-matching.md)
- [Optional Value Safety Skill](../vm2-audit-optional-value-safety/SKILL.md)
- [Tracegen-PIL Alignment Skill](../vm2-audit-tracegen-pil-alignment/SKILL.md)

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
| Skill | vm2-audit-exception-type-matching |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-exception-type-matching-[file]-[line]-[subtype] [SEVERITY]
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
  "skill": "vm2-audit-exception-type-matching",
  "finding_prefix": "vm2-audit-exception-type-matching",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-exception-type-matching-filename-line-subtype",
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

- Format: `vm2-audit-exception-type-matching-[filename]-[line]-[subtype]`
- Example: `vm2-audit-exception-type-matching-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
