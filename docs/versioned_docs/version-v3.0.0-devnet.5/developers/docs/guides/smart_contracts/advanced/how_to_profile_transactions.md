---
title: Profiling and Optimizing Contracts
sidebar_position: 2
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

:::tip Profile Modes

- `gates`: Shows gate counts per circuit
- `execution-steps`: Detailed execution trace
- `full`: Complete profiling information

:::

### Step 1: Profile a transaction

```javascript
const result = await contract.methods
  .my_function(args)
  .profile({ 
    from: address,
    profileMode: 'gates',
    skipProofGeneration: false 
  });

console.log('Gate count:', result.gateCount);
```

### Step 2: Profile deployment

```javascript
const deploy = await Contract.deploy(args).profile({ from: address, profileMode: 'full' });
```

:::warning Experimental
Flamegraph generation is experimental and may not be available in all versions.
:::

## Generate flamegraphs (if available)

### Generate and view

```bash
# Compile first
aztec-nargo compile

# Generate flamegraph
aztec flamegraph target/contract.json function_name

# Serve locally
SERVE=1 aztec flamegraph target/contract.json function_name
```

:::info Reading Flamegraphs

- **Width** = Time in operation
- **Height** = Call depth
- **Wide sections** = Optimization targets

:::

## Common optimizations

:::info Key Metrics

- **Gate count**: Circuit complexity
- **Kernel overhead**: Per-function cost
- **Storage access**: Read/write operations

:::

:::tip Optimization Pattern
Batch operations to reduce kernel circuit overhead.
:::

```rust
// ❌ Multiple kernel invocations
for i in 0..3 {
    transfer_single(amounts[i], recipients[i]);
}

// ✅ Single kernel invocation
for i in 0..3 {
    let note = Note::new(amounts[i], recipients[i]);
    storage.notes.at(recipients[i]).insert(note);
}
```

:::tip Storage Optimization
Group storage reads to reduce overhead.
:::

```rust
// Read once, use multiple times
let values = [storage.v1.get(), storage.v2.get(), storage.v3.get()];
for v in values {
    assert(v > 0);
}
```

### Minimize note operations

:::tip Note Aggregation
Combine multiple small notes into fewer larger ones to reduce proving overhead.
:::

```rust
// ❌ Many small notes = high overhead
for value in values {
    storage.notes.insert(Note::new(value, owner));
}

// ✅ Single aggregated note = lower overhead
let total = values.reduce(|a, b| a + b);
storage.notes.insert(Note::new(total, owner));
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

- Learn about [gas optimization techniques](../../../concepts/transactions.md)
- Review [benchmarking best practices](../how_to_test_contracts.md)
