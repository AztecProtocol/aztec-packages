# Failure Testing with MaliciousWitnessInjector

This document describes the `MaliciousWitnessInjector` utility for testing constraint violations in ROM/RAM and other circuit components.

## Overview

The `MaliciousWitnessInjector` class allows you to create circuits with "malicious" witnesses that have different values in passing vs failing proofs. This enables systematic testing that invalid witnesses correctly fail verification.

## Two Testing Approaches

### 1. CircuitChecker (Recommended for Development)

**Use for**: Identifying exactly which relation fails and at which row

**Advantages**:
- ✅ Fast (no proof construction)
- ✅ Precise error messages: "Failed Memory relation at row idx = 8"
- ✅ Identifies specific relation: Arithmetic, Memory, Elliptic, etc.
- ✅ Row-by-row validation
- ✅ Great for debugging

**Example**:
```cpp
MaliciousWitnessInjector<UltraFlavor> injector;
// ... build circuit with malicious witness ...
auto bad_builder = injector.create_faulty_builder();
EXPECT_FALSE(CircuitChecker::check(bad_builder));
// Output: "Failed Memory relation at row idx = 8"
```

### 2. Full Proof System (prove_and_verify)

**Use for**: End-to-end verification testing

**Advantages**:
- ✅ Tests complete proving system
- ✅ Catches issues in proof construction/verification
- ✅ Tests sumcheck, permutation arguments, etc.
- ✅ Closer to production usage

**Disadvantages**:
- ❌ Slower (full proof construction)
- ❌ Generic error: "Sumcheck failed!"
- ❌ No information about which relation failed

**Example**:
```cpp
MaliciousWitnessInjector<UltraFlavor> injector;
// ... build circuit ...
auto [good, bad] = injector.create_instances();
prove_and_verify(good, true);   // passes
prove_and_verify(bad, false);   // fails with "Sumcheck failed!"
```

## Complete Example

```cpp
TEST(RomFailureTest, MaliciousInitValue)
{
    using FF = bb::fr;
    MaliciousWitnessInjector<UltraFlavor> injector;

    // Create ROM with malicious initialization
    size_t rom_id = injector.builder.create_ROM_array(5);
    auto bad_init = injector.add_malicious_variable(FF(42), FF(666));
    injector.builder.set_ROM_element(rom_id, 0, bad_init);

    // Initialize remaining elements
    for (size_t i = 1; i < 5; ++i) {
        auto val = injector.builder.add_variable(FF(i));
        injector.builder.set_ROM_element(rom_id, i, val);
    }

    // Create constraint by reading
    auto index = injector.builder.put_constant_variable(0);
    injector.builder.read_ROM_array(rom_id, index);

    // Test 1: CircuitChecker for precise diagnostics
    EXPECT_TRUE(CircuitChecker::check(injector.builder));  // good passes
    auto bad_builder = injector.create_faulty_builder();
    EXPECT_FALSE(CircuitChecker::check(bad_builder));      // prints: "Failed Memory relation at row idx = X"

    // Test 2: Full system verification
    auto [good, bad] = injector.create_instances();
    prove_and_verify(good, true);   // passes
    prove_and_verify(bad, false);   // fails
}
```

## Output Comparison

### CircuitChecker Output (Detailed):
```
Failed Memory relation at row idx = 8
Failed at block idx = 5
```

### prove_and_verify Output (Generic):
```
Sumcheck failed!
```

## Best Practice: Use Both!

Combine both approaches for comprehensive testing:
1. **CircuitChecker** during development to identify issues quickly
2. **prove_and_verify** to confirm end-to-end behavior

## Fault Injection API

### `add_malicious_variable(good_val, bad_val)`
Adds a witness with different values for good vs bad proofs.

**Parameters**:
- `good_val`: Value in the passing proof
- `bad_val`: Value in the failing proof

**Returns**: Variable index (use like any normal witness)

### `create_faulty_builder()`
Creates a copy of the builder with faults injected.

**Use with**: `CircuitChecker::check()`

### `create_instances()`
Creates both good and bad ProverInstances.

**Returns**: `std::pair<good_instance, bad_instance>`

**Use with**: `prove_and_verify()`

## ROM/RAM Failure Scenarios

Potential failure modes to test:

### ROM:
- ✅ Malicious initialization value
- Uninitialized read
- Type mismatch (read pair from single-init slot)
- Out of bounds access
- Tampered record fingerprint
- Violated sorted order

### RAM:
- Write before initialization
- Timestamp tampering
- Access type mismatch (READ ↔ WRITE)
- Out-of-order operations
- Value inconsistency (read ≠ last write)

### Both:
- Selector tampering
- Tag multiset inequality
- Index witness mismatch
