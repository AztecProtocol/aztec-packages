---
name: vm2-audit-optional-value-safety
description: Audit VM2/AVM simulation code for unsafe optional value access. Completeness issue where calling .value() on empty std::optional or accessing out-of-bounds collection elements causes crashes, preventing trace generation for valid edge cases like unused protocol contract slots.
---

# VM2 Optional Value Safety Audit

## Purpose
Find unsafe `.value()` calls and collection accesses in simulation/tracegen that crash on valid edge cases.

## When to Use
- Auditing VM2 simulation code for crash bugs
- Reviewing code that handles optional returns or collection access
- After adding new lookup/query functions

## When NOT to Use
- PIL constraint audits (use constraint-focused skills)
- Non-VM2 C++ code

## Severity
**Completeness issue** - crashes prevent trace generation for valid inputs.
- **Critical**: Reachable via normal simulation on valid inputs
- **High**: Reachable via edge cases (unused slots, missing contracts)
- **Low**: Theoretical/unreachable paths

## Workflow

### 1. Find .value() Calls
```bash
grep -rn "\.value()" --include="*.cpp" --include="*.hpp" src/barretenberg/vm2/simulation/
grep -rn "\.value()" --include="*.cpp" --include="*.hpp" src/barretenberg/vm2/tracegen/
```

### 2. Analyze Each Call
For each `.value()`:
1. Is there a `.has_value()` guard?
2. Trace origin - what returns this optional?
3. When does it return `std::nullopt`?

### 3. Find Collection Accesses
```bash
grep -rn "\.at(\|\.front(\|\.back(" --include="*.cpp" --include="*.hpp" src/barretenberg/vm2/simulation/
```

### 4. Verify Bounds
- Index validated before access?
- Collection guaranteed non-empty?

## Vulnerable Patterns

```cpp
// BUG: Direct .value() without check
auto instance = lookup(address).value();  // CRASH if nullopt

// BUG: Unguarded collection access
auto first = collection.front();  // CRASH if empty
auto item = collection.at(index); // CRASH if out of bounds

// BUG: Map iterator without check
auto it = map.find(key);
auto value = it->second;  // CRASH if not found
```

## Secure Patterns

```cpp
// SAFE: Check before access
if (!maybe.has_value()) return std::nullopt;
auto value = maybe.value();

// SAFE: value_or for defaults
auto value = maybe.value_or(Default{});

// SAFE: Bounds check
if (index >= vec.size()) return error;

// SAFE: Iterator check
auto it = map.find(key);
if (it == map.end()) return error;
```

## Common Empty Optional Sources

| Source | Edge Case |
|--------|-----------|
| `get_protocol_contract(slot)` | Unused slots 7-11 |
| `get_contract(address)` | Contract not deployed |
| `get_leaf(index)` | Leaf not found |
| `get_bytecode(address)` | Contract without code |

## Real Bug: PR #19254

```cpp
// BEFORE: Protocol contracts have 11 slots, only 6 used
auto maybe = get_protocol_contract(address);
auto& instance = maybe.value();  // CRASH on slots 7-11!

// AFTER:
return ContractInstanceEvent{
    .contract_instance = maybe.value_or(ContractInstance{}),
    .exists = maybe.has_value()
};
```

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-optional-value-safety` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Finding Format
- **ID**: `vm2-audit-optional-value-safety-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.cpp:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)

```json
{
  "skill": "vm2-audit-optional-value-safety",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-optional-value-safety-file-123-unsafe-value",
    "severity": "critical",
    "file": "path/to/file.cpp",
    "line": 123,
    "description": "Brief description",
    "fix": "Suggested fix"
  }]
}
```