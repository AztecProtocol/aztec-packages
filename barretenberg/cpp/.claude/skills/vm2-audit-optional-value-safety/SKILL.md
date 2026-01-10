---
name: vm2-audit-optional-value-safety
description: Audit VM2/AVM simulation code for unsafe optional value access. Completeness issue where calling .value() on empty std::optional or accessing out-of-bounds collection elements causes crashes, preventing trace generation for valid edge cases like unused protocol contract slots.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Optional Value Safety Audit

Audits for unsafe `.value()` access on optionals. **Completeness issue** - crashes for valid edge cases (empty slots, missing contracts) that PIL handles correctly.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All .value() Calls

```bash
# Find all .value() calls in simulation code
grep -rn "\.value()" --include="*.cpp" --include="*.hpp" barretenberg/cpp/src/barretenberg/vm2/simulation/

# Also check tracegen
grep -rn "\.value()" --include="*.cpp" --include="*.hpp" barretenberg/cpp/src/barretenberg/vm2/tracegen/
```

### Step 2: Check Each .value() Call

For each `.value()` call found:

1. **Is there a `.has_value()` check before it?**
   ```cpp
   // SAFE: Check before access
   if (optional.has_value()) {
       auto value = optional.value();
   }
   ```

2. **Can the optional ever be empty?**
   - Trace back to where the optional is created
   - What function returns it?
   - Under what conditions does it return `std::nullopt`?

3. **What edge cases could cause it to be empty?**
   - Missing database entries
   - Unused reserved slots
   - Out-of-bounds access
   - Failed lookups

### Step 3: Find Collection Accesses

```bash
# Find potentially unsafe collection accesses
grep -rn "\.at(" --include="*.cpp" --include="*.hpp" barretenberg/cpp/src/barretenberg/vm2/simulation/
grep -rn "\.front(" --include="*.cpp" --include="*.hpp" barretenberg/cpp/src/barretenberg/vm2/simulation/
grep -rn "\.back(" --include="*.cpp" --include="*.hpp" barretenberg/cpp/src/barretenberg/vm2/simulation/
grep -rn "\[.*\]" --include="*.cpp" --include="*.hpp" barretenberg/cpp/src/barretenberg/vm2/simulation/
```

### Step 4: Verify Bounds Checks

For each collection access:
- Is the index validated before access?
- Is the collection guaranteed non-empty?
- What happens at boundary conditions?

### Step 5: Identify Common Sources of Empty Optionals

| Source | Example | Edge Case |
|--------|---------|-----------|
| Database lookup | `get_contract(address)` | Contract not deployed |
| Protocol contracts | `get_protocol_contract(slot)` | Unused reserved slots (7-11) |
| Tree operations | `get_leaf(index)` | Leaf not found |
| Memory access | `read_memory(address)` | Uninitialized address |
| Bytecode retrieval | `get_bytecode(address)` | Contract without code |
| Map lookup | `map.find(key)` | Missing key |

## Patterns

### Vulnerable Pattern: Direct .value() Access

```cpp
// VULNERABLE: Direct .value() access without check
std::optional<ContractInstance> maybe_instance = lookup(address);
const ContractInstance& instance = maybe_instance.value();  // CRASH if nullopt!
return instance;
```

### Vulnerable Pattern: Assuming Collection Has Elements

```cpp
// VULNERABLE: Assuming collection always has elements
auto result = collection.at(index);  // Throws if index out of bounds
// VULNERABLE: Assuming non-empty
auto first = collection.front();  // Crash if empty
```

### Vulnerable Pattern: Assuming Map Lookup Succeeds

```cpp
// VULNERABLE: Using operator[] on map
auto value = map[key];  // Creates default if missing (may not be desired)
// VULNERABLE: Assuming find succeeds
auto it = map.find(key);
auto value = it->second;  // Crash if key not found
```

### Secure Pattern: Check Before Access

```cpp
// SECURE: Check before access
std::optional<ContractInstance> maybe_instance = lookup(address);
if (!maybe_instance.has_value()) {
    return std::nullopt;  // Or handle appropriately
}
const ContractInstance& instance = maybe_instance.value();
return instance;
```

### Secure Pattern: Use value_or

```cpp
// SECURE: Use value_or for safe default
auto instance = maybe_instance.value_or(ContractInstance{});
return instance;
```

### Secure Pattern: Return Optional Directly

```cpp
// SECURE: Return the optional directly
std::optional<ContractInstance> maybe_instance = lookup(address);
return maybe_instance;  // Let caller handle empty case
```

### Secure Pattern: Bounds Check

```cpp
// SECURE: Check collection bounds
if (index >= collection.size()) {
    return error_or_default;
}
auto result = collection.at(index);
```

### Secure Pattern: Safe Map Access

```cpp
// SECURE: Check iterator before use
auto it = map.find(key);
if (it == map.end()) {
    return error_or_default;
}
auto value = it->second;
```

## Examples

### Example 1: Contract Instance Manager (PR #19254)

```cpp
// BEFORE: Crash on empty protocol slot
// Protocol contracts have 11 reserved slots, but only 6 are used.
// Querying addresses 7-11 returns nullopt.
std::optional<ContractInstance> maybe_instance = get_protocol_contract(address);
const ContractInstance& instance = maybe_instance.value();  // CRASH!
return ContractInstanceEvent{
    .contract_instance = instance,
    .exists = true
};

// AFTER: Safe handling
auto maybe_instance = get_protocol_contract(address);
return ContractInstanceEvent{
    .contract_instance = maybe_instance.value_or(ContractInstance{}),
    .exists = maybe_instance.has_value()
};
```
**Impact**: Querying unused protocol contract slot crashes simulation.

### Example 2: General Optional Misuse

```cpp
// Pattern that appears in various places
auto result = compute_something();  // Returns optional
do_something_with(result.value());  // Crash if empty!
```

## Edge Cases to Consider

1. **Reserved but unused slots**: Protocol contracts, precomputed tables
2. **Empty collections**: Zero-length arrays, empty maps
3. **Missing lookups**: Addresses not in database, unknown keys
4. **Boundary conditions**: Index at exact boundary
5. **Uninitialized state**: First access to memory/storage
6. **Failed operations**: Computations that may not produce results

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
