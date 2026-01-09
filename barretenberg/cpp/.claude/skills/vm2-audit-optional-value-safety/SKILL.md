---
name: vm2-audit-optional-value-safety
description: Audit VM2/AVM simulation code for unsafe optional value access. Completeness issue where calling .value() on empty std::optional or accessing out-of-bounds collection elements causes crashes, preventing trace generation for valid edge cases like unused protocol contract slots.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Optional Value Safety Audit Skill

## Overview

This skill audits VM2/AVM simulation code for unsafe access to optional values. Calling `.value()` on an empty `std::optional` throws an exception, preventing trace generation for otherwise valid executions. This is a **completeness** issue - honest provers crash before generating a trace, even for valid inputs that the PIL handles correctly.

**Bug Type**: Completeness
**Severity**: Medium
**Frequency**: Low

## Why This is Important

This is a **completeness** issue:
- Honest provers crash before generating a trace
- Valid inputs that PIL would handle correctly cause simulation failure
- Edge cases (empty slots, missing contracts) become unprocessable
- The prover cannot complete even though the execution is valid

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

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

## Vulnerable vs Secure Patterns

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

## Historical Examples

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

## Test Patterns

### Test 1: Empty Optional Handled

```cpp
TEST_F(SimulationTest, PositiveEmptyOptionalHandled)
{
    // Query unused protocol contract slot (7-11)
    auto event = contract_instance_manager.get_instance(
        Address(7)  // Reserved but unused
    );

    // Should return exists = false, not crash
    EXPECT_FALSE(event.exists);
}
```

**Interpretation**:
- **Test passes**: Empty optional handled gracefully - secure
- **Test crashes**: Unsafe .value() access - needs fix

### Test 2: Boundary Condition

```cpp
TEST_F(SimulationTest, PositiveBoundaryCondition)
{
    // Access at exact boundary
    auto result = access_at_boundary();

    // Should handle gracefully
    EXPECT_TRUE(result.is_valid_or_error());
}
```

### Test 3: Missing Database Entry

```cpp
TEST_F(SimulationTest, PositiveMissingContract)
{
    // Query non-existent contract
    auto result = lookup_contract(Address(0xDEADBEEF));

    // Should return nullopt or error, not crash
    EXPECT_FALSE(result.has_value());
}
```

### Test 4: Empty Collection Access

```cpp
TEST_F(SimulationTest, PositiveEmptyCollectionHandled)
{
    std::vector<int> empty_vec;

    // Should handle empty case, not crash
    auto result = safe_get_first(empty_vec);
    EXPECT_FALSE(result.has_value());
}
```

## Audit Checklist

1. **Find all .value() calls**:
   - [ ] `grep -rn "\.value()" simulation/`
   - [ ] Document each usage

2. **For each .value() call, check**:
   - [ ] Is there a `.has_value()` check before it?
   - [ ] Can the optional ever be empty?
   - [ ] What edge cases could cause it to be empty?

3. **Find collection accesses**:
   - [ ] `.at(index)` calls
   - [ ] `.front()` and `.back()` calls
   - [ ] Array/vector subscript `[index]`

4. **Verify bounds checks**:
   - [ ] Is the index validated?
   - [ ] Is the collection guaranteed non-empty?

5. **Test edge cases**:
   - [ ] Empty optionals
   - [ ] Out-of-bounds indices
   - [ ] Missing keys
   - [ ] Unused reserved slots

## Fix Patterns

### Fix 1: Check Before Access

```cpp
// BEFORE:
auto value = optional.value();

// AFTER:
if (!optional.has_value()) {
    return handle_missing_case();
}
auto value = optional.value();
```

### Fix 2: Use value_or

```cpp
// BEFORE:
auto value = optional.value();

// AFTER:
auto value = optional.value_or(default_value);
```

### Fix 3: Return Optional

```cpp
// BEFORE:
ContractInstance get_instance(Address addr) {
    auto maybe = lookup(addr);
    return maybe.value();  // Crash if empty
}

// AFTER:
std::optional<ContractInstance> get_instance(Address addr) {
    return lookup(addr);  // Let caller handle
}
```

### Fix 4: Bounds Check

```cpp
// BEFORE:
auto item = collection.at(index);

// AFTER:
if (index >= collection.size()) {
    return error_or_default;
}
auto item = collection.at(index);
```

### Fix 5: Safe Map Access

```cpp
// BEFORE:
auto value = map[key];  // or map.find(key)->second

// AFTER:
auto it = map.find(key);
if (it == map.end()) {
    return error_or_default;
}
auto value = it->second;
```

## Build and Test Commands

```bash
# Build VM2 tests
vmb  # or: cmake --preset build && cd build && ninja vm2_tests

# Run all VM2 tests
vmt  # or: ./build/bin/vm2_tests

# Run simulation-specific tests
vmtg "Simulation*"

# Run with address sanitizer to catch crashes
cmake --preset asan && cd build-asan && ninja vm2_tests
./bin/vm2_tests
```

## Common Locations to Audit

Optional value safety issues typically appear in:
- **Contract lookups**: `contract_instance_manager.cpp`, `contract_database.cpp`
- **Memory access**: `memory.cpp`, `storage.cpp`
- **Tree operations**: `merkle_tree.cpp`, `indexed_tree.cpp`
- **Bytecode retrieval**: `bytecode_manager.cpp`
- **State access**: `state_manager.cpp`, `world_state.cpp`

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/19-optional-value-safety.md)
- [Tracegen PIL Alignment](../../../pil/vm2/claude-skills/14-tracegen-pil-alignment.md)
