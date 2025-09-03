---
title: How to Profile and Optimize Contracts
sidebar_position: 8
tags: [contracts, profiling, optimization]
description: Step-by-step guide to profiling Aztec transactions and optimizing contract performance for efficient proof generation.
---

This guide shows you how to profile your Aztec transactions to identify bottlenecks and optimize gas usage.

## Prerequisites

- `aztec-nargo` installed ([see installation](../../../reference/environment_reference/sandbox-reference.md))
- `aztec-wallet` installed (part of Sandbox)
- Aztec contract deployed and ready to test
- Basic understanding of proving and gate counts

## Profile with aztec-wallet

### Step 1: Import test accounts

```bash
aztec-wallet import-test-accounts
```

### Step 2: Deploy your contract

```bash
aztec-wallet deploy MyContractArtifact \
  --from accounts:test0 \
  --args <constructor_args> \
  -a mycontract
```

### Step 3: Set up initial state

```bash
aztec-wallet send setup_state \
  -ca mycontract \
  --args <setup_args> \
  -f test0
```

### Step 4: Profile a transaction

Instead of `send`, use `profile` with the same parameters:

```bash
aztec-wallet profile private_function \
  -ca mycontract \
  --args <function_args> \
  -f accounts:test0
```

### Step 5: Analyze the output

```bash
Gate count per circuit:
   SchnorrAccount:entrypoint                          Gates: 21,724     Acc: 21,724
   private_kernel_init                                Gates: 45,351     Acc: 67,075
   MyContract:private_function                        Gates: 31,559     Acc: 98,634
   private_kernel_inner                               Gates: 78,452     Acc: 177,086
   private_kernel_reset                               Gates: 91,444     Acc: 268,530
   private_kernel_tail                                Gates: 31,201     Acc: 299,731

Total gates: 299,731
```

The output shows:

- Gate count per circuit component
- Accumulated gate count
- Total gates for the entire transaction

## Profile with aztec.js

### Step 1: Set up profile options

```javascript
const profileOptions = {
  profileMode: 'gates',  // 'gates' | 'execution-steps' | 'full'
  skipProofGeneration: false  // Set to true for faster profiling
};
```

### Step 2: Profile a contract interaction

```javascript
// Profile a function call
const result = await contract.methods
  .private_function(param1, param2)
  .profile(profileOptions);

// Access profiling results
console.log('Execution steps:', result.executionSteps);
console.log('Proving stats:', result.stats);
```

### Step 3: Profile contract deployment

```javascript
// Profile deployment
const deployResult = await MyContract
  .deploy(constructorArgs)
  .profile(profileOptions);
```

## Generate flamegraphs

### Step 1: Compile your contract

```bash
aztec-nargo compile
aztec-postprocess-contract
```

### Step 2: Generate a flamegraph

```bash
aztec flamegraph target/<contract_artifact>.json <function_name>
```

This creates an SVG file in the `target` directory.

### Step 3: View the flamegraph

Open the SVG in a browser, or serve it locally:

```bash
SERVE=1 aztec flamegraph target/<contract_artifact>.json <function_name>
```

Access the flamegraph at `http://localhost:8000`.

### Step 4: Analyze the flamegraph

The flamegraph shows:

- Width: Time spent in each operation
- Height: Call stack depth
- Colors: Different operation types

Focus on wide sections - these are optimization targets.

## Optimize based on profiling

### Identify bottlenecks

1. **High gate count functions** - Look for functions with disproportionate gates
2. **Kernel circuits overhead** - Check if multiple calls can be combined
3. **Repeated operations** - Identify redundant calculations

### Apply optimizations

#### Reduce function calls

```rust
// Before: Multiple function calls
#[private]
fn inefficient_transfer(amounts: [Field; 3], recipients: [AztecAddress; 3]) {
    for i in 0..3 {
        transfer_single(amounts[i], recipients[i]);
    }
}

// After: Batch processing
#[private]
fn efficient_transfer(amounts: [Field; 3], recipients: [AztecAddress; 3]) {
    // Process all transfers in one function
    for i in 0..3 {
        // Direct processing without function calls
        let note = MyNote::new(amounts[i], recipients[i]);
        storage.notes.at(recipients[i]).insert(note);
    }
}
```

#### Optimize storage access

```rust
// Before: Multiple storage reads
#[private]
fn check_multiple_conditions() {
    assert(storage.value1.get() > 0);
    assert(storage.value2.get() > 0);
    assert(storage.value3.get() > 0);
}

// After: Batch read
#[private]
fn check_conditions_optimized() {
    let values = [
        storage.value1.get(),
        storage.value2.get(),
        storage.value3.get()
    ];

    for value in values {
        assert(value > 0);
    }
}
```

#### Minimize note operations

```rust
// Before: Creating many small notes
#[private]
fn create_many_notes(values: [Field; 10], owner: AztecAddress) {
    for value in values {
        let note = MyNote::new(value, owner);
        storage.notes.insert(note);
    }
}

// After: Create combined note
#[private]
fn create_combined_note(values: [Field; 10], owner: AztecAddress) {
    let total = values.reduce(|a, b| a + b);
    let note = MyNote::new(total, owner);
    storage.notes.insert(note);
}
```

## Profile different scenarios

### Profile with different inputs

```bash
# Small values
aztec-wallet profile function -ca mycontract --args 10 -f test0

# Large values
aztec-wallet profile function -ca mycontract --args 1000000 -f test0
```

### Profile execution modes

```javascript
// Profile gates only
await contract.methods.function().profile({ profileMode: 'gates' });

// Profile execution steps
await contract.methods.function().profile({ profileMode: 'execution-steps' });

// Full profile
await contract.methods.function().profile({ profileMode: 'full' });
```

### Skip proof generation for faster iteration

```javascript
await contract.methods.function().profile({
  profileMode: 'gates',
  skipProofGeneration: true  // Faster but less accurate
});
```

## Interpret profiling results

### Gate count guidelines

- **< 50,000 gates**: Excellent performance
- **50,000 - 200,000 gates**: Acceptable for most use cases
- **200,000 - 500,000 gates**: May cause delays, consider optimizing
- **> 500,000 gates**: Requires optimization for production

### Common optimization targets

1. **private_kernel_inner** - Reduce nested function calls
2. **private_kernel_reset** - Minimize note nullifications
3. **Contract functions** - Optimize computation logic
4. **private_kernel_tail** - Reduce public function calls

## Best practices

### Development workflow

1. **Profile early** - Establish baseline metrics
2. **Profile often** - Check impact of changes
3. **Profile realistically** - Use production-like data
4. **Document findings** - Track optimization progress

### Optimization priorities

1. **User-facing functions** - Optimize most-used features first
2. **Critical paths** - Focus on transaction bottlenecks
3. **Batch operations** - Combine related operations
4. **Cache calculations** - Store reusable results

## Next steps

- Learn about [gas optimization techniques](../../../../aztec/concepts/transactions.md)
- Review [benchmarking best practices](../how_to_test_contracts.md)
