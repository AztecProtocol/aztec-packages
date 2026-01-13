---
name: vm2-audit-exception-type-matching
description: Audit VM2/AVM simulation code for exception type matching issues. Completeness issue where simulation code throws a different exception type than what the caller catches, causing error handling paths to fail completely and valid error cases to crash instead of producing proper traces.
---

# VM2 Exception Type Matching Audit

## Purpose
Find C++ simulation code where thrown exception types don't match caller catch blocks, causing honest provers to crash or produce incorrect traces.

## When to Use
- Auditing VM2 simulation/tracegen C++ code
- Reviewing error handling paths
- After adding new exception-throwing code

## Severity
**Completeness issue**: Ranges from Low (unreachable) to Critical (blocks valid inputs). Bugs reachable via canonical simulation on valid inputs are **Critical**.

## Workflow

### Step 1: Map Exception Hierarchy
```bash
grep -rn "class.*Exception" barretenberg/cpp/src/barretenberg/vm2/ --include="*.hpp"
```

Expected hierarchy:
```
VmException (base)
├── AddressingException
├── AluException
├── MemoryException
├── Sha256CompressionException
├── KeccakException
├── Poseidon2Exception
├── BytecodeException
└── GasException
```

### Step 2: Find All Throw Statements
```bash
grep -rn "throw " barretenberg/cpp/src/barretenberg/vm2/simulation/ --include="*.cpp"
grep -rn "throw " barretenberg/cpp/src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

### Step 3: Find Catch Blocks
```bash
grep -rn "catch.*Exception\|catch.*exception\|catch.*error" barretenberg/cpp/src/barretenberg/vm2/ --include="*.cpp"
```

### Step 4: Verify Type Matching
For each throw/catch pair: Does the thrown type match or inherit from what caller catches?

### Step 5: Trace Error Flow
Component throws → Caller catches → Error event emitted → Tracegen processes → PIL handles

## Common Mismatches

| Component | Should Throw | Bug Pattern |
|-----------|--------------|-------------|
| SHA256 | `Sha256CompressionException` | `std::runtime_error` |
| Keccak | `KeccakException` | `std::runtime_error` |
| ALU | `AluException` | `std::invalid_argument` |
| Memory | `MemoryException` | `std::out_of_range` |
| Gas | `GasException` | `std::runtime_error` |

## Red Flags

```cpp
// BUG: Generic throw where specific type expected
throw std::runtime_error("SHA256 error");  // Caller catches Sha256CompressionException

// BUG: Overly broad catch hides mismatches
catch (const std::exception& e) { }

// BUG: Missing try-catch around throwing component
component.operation();  // Uncaught exception crashes

// BUG: Silent catch-all
catch (...) { }  // Hides all errors
```

## When `std::runtime_error` is Correct

**Key question**: Should this error produce a trace, or crash?

`std::runtime_error` is appropriate for catastrophic failures:
- Missing hints from data provider
- Invalid merkle proofs
- Protocol limit violations (e.g., MAX_NULLIFIERS_PER_TX)
- Sanity check failures (indicates bug)
- Unknown opcodes

```cpp
// OK: External data failure - should crash
throw std::runtime_error("Sibling path hint not found");

// OK: Explicit panic comment
// NOTE: Keep this a `std::runtime_error` so that the main loop panics.
throw std::runtime_error("Unknown opcode");
```

## Real Bug Example (PR #18864)

```cpp
// BEFORE: Wrong type - caller never catches it
void Sha256Compression::compress(...) {
    throw std::runtime_error("SHA256 compression error");
}
try {
    sha256.compress(state, input);
} catch (const Sha256CompressionException& e) {  // NEVER REACHED!
    emit_error_event(ErrorType::Sha256Error);
}
// Result: Valid error cases crash simulation

// AFTER: Correct type
throw Sha256CompressionException("SHA256 compression error");
```

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-exception-type-matching` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-exception-type-matching-filename-123-issue-type` (MUST use full skill name: `vm2-audit-exception-type-matching`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.cpp:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-exception-type-matching.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-exception-type-matching",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-exception-type-matching-filename-123-issue-type",
      "severity": "critical",
      "file": "path/to/file.cpp",
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
  "skill": "vm2-audit-exception-type-matching",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.