---
name: vm2-audit-exception-type-matching
description: Audit VM2/AVM simulation code for exception type matching issues. Completeness issue where simulation code throws a different exception type than what the caller catches, causing error handling paths to fail completely and valid error cases to crash instead of producing proper traces.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Exception Type Matching Audit

Audits simulation code for exception type matching issues. When code throws a different type than caller catches, error handling fails - honest provers crash or produce incorrect traces for valid error cases. This is a **completeness** issue.

## Instructions

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

## Patterns

### Vulnerable Pattern: Wrong Exception Type

```cpp
// VULNERABLE: Throwing generic exception
void Sha256Compression::compress(...) {
    if (error_condition) {
        throw std::runtime_error("SHA256 compression error");  // WRONG!
    }
}
try {
    sha256.compress(state, input);
```

### Vulnerable Pattern: Overly Broad Catch

```cpp
// VULNERABLE: Overly broad catch hides type mismatches
try {
    component.operation();
} catch (const std::exception& e) {
}
```

### Vulnerable Pattern: Missing Catch Block

```cpp
// VULNERABLE: No try-catch around component that can throw
void process() {
    component.operation();  // What if this throws?
}
```

### Secure Pattern: Matching Exception Types

```cpp
// SECURE: Correct exception type
class Sha256CompressionException : public VmException {
public:
    explicit Sha256CompressionException(const std::string& msg)
        : VmException(msg) {}
};

void Sha256Compression::compress(...) {
    if (invalid_condition) {
        throw Sha256CompressionException("SHA256 compression error");
    }
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
}
```

## Examples

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
