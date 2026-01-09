---
title: Profiling Transactions
sidebar_position: 2
tags: [contracts, profiling]
description: How to profile Aztec transactions and identify performance bottlenecks.
---

This guide shows you how to profile Aztec transactions to understand gate counts and identify optimization opportunities.

## Prerequisites

- `aztec` command installed ([see installation](../../../../getting_started_on_local_network.md))
- `aztec-wallet` installed
- Aztec contract deployed and ready to test
- Basic understanding of proving and gate counts

## Profile with aztec-wallet

Use the `profile` command instead of `send` to get detailed gate counts:

```bash
# Import test accounts
aztec-wallet import-test-accounts

# Deploy your contract
aztec-wallet deploy MyContractArtifact \
  --from accounts:test0 \
  --args [CONSTRUCTOR_ARGS] \
  -a mycontract

# Profile a function call
aztec-wallet profile my_function \
  -ca mycontract \
  --args [FUNCTION_ARGS] \
  -f accounts:test0
```

### Reading the output

The profile command outputs a per-circuit breakdown:

```text
Per circuit breakdown:

  Function name                          Time           Gates         Subtotal
--------------------------------------------------------------------------------
 - SchnorrAccount:entrypoint            12.34ms         21,724         21,724
 - private_kernel_init                  23.45ms         45,351         67,075
 - MyContract:my_function               15.67ms         31,559         98,634
 - private_kernel_inner                 34.56ms         78,452        177,086

Total gates: 177,086 (Biggest circuit: private_kernel_inner -> 78,452)
```

Key metrics:

- **Gates**: Circuit complexity for each function
- **Subtotal**: Accumulated gate count
- **Time**: Execution time per circuit

## Profile with aztec.js

```typescript
const result = await contract.methods.my_function(args).profile({
  from: walletAddress,
  profileMode: "full",
  skipProofGeneration: true,
});

// Access gate counts from execution steps
for (const step of result.executionSteps) {
  console.log(`${step.functionName}: ${step.gateCount} gates`);
}

// Access timing information
console.log("Total time:", result.stats.timings.total, "ms");
```

### Profile modes

- `gates`: Gate counts per circuit
- `execution-steps`: Detailed execution trace with bytecode and witnesses
- `full`: Complete profiling information (gates + execution steps)

Set `skipProofGeneration: true` for faster iteration when you only need gate counts.

## Generate flamegraphs with noir-profiler

For deeper analysis of individual contract functions, use the Noir profiler to generate interactive flamegraphs. The profiler is installed automatically with Nargo (starting noirup v0.1.4).

```bash
# Compile your contract first
aztec compile

# Generate a gates flamegraph (requires bb backend)
noir-profiler gates \
  --artifact-path ./target/my_contract-MyContract.json \
  --backend-path bb \
  --output ./target

# Generate an ACIR opcodes flamegraph
noir-profiler opcodes \
  --artifact-path ./target/my_contract-MyContract.json \
  --output ./target
```

Open the generated `.svg` file in a browser for an interactive view where:

- **Width** represents gate count or opcode count
- **Height** represents call stack depth
- **Wide sections** indicate optimization targets

For detailed usage, see the [Noir profiler documentation](https://noir-lang.org/docs/tooling/profiler).

## Gate count guidelines

| Gate Count        | Assessment            |
| ----------------- | --------------------- |
| < 50,000          | Excellent             |
| 50,000 - 200,000  | Acceptable            |
| 200,000 - 500,000 | Consider optimizing   |
| > 500,000         | Requires optimization |

## Next steps

- [Writing efficient contracts](./writing_efficient_contracts.md) - optimization strategies and examples
- [Transaction lifecycle](../../../foundational-topics/transactions.md)
- [Testing contracts](../../how_to_test_contracts.md)
