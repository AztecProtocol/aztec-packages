---
title: Simulating Functions
tags: [functions, simulation]
sidebar_position: 5
description: How to simulate function calls and read contract state without creating transactions.
---

This guide shows you how to use `simulate` to execute contract functions and read their return values without creating a transaction.

## Prerequisites

- A deployed contract instance (see [How to Deploy a Contract](./how_to_deploy_contract.md))
- A wallet connection (see [How to Create an Account](./how_to_create_account.md))

## Overview

The `simulate` method executes a contract function locally and returns its result. It works with private, public, and utility functions. No transaction is created and no gas is spent.

```typescript
const result = await contract.methods.myFunction(arg1, arg2).simulate({ from: callerAddress });
```

The `from` option specifies which address context to use for the simulation. This is required for all simulations.

## Basic simulation

```typescript title="simulate_function" showLineNumbers 
const balance = await contract.methods.balance_of_public(newAccountAddress).simulate({ from: newAccountAddress });
expect(balance).toEqual(1n);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260112/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L50-L53" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L50-L53</a></sub></sup>


## Handling return values

For functions returning multiple values, destructure the result:

```typescript
const [value1, value2] = await contract.methods
  .get_multiple_values()
  .simulate({ from: callerAddress });
```

## Including metadata

Set `includeMetadata: true` to get additional information about the simulation:

```typescript
const result = await contract.methods
  .balance_of_public(address)
  .simulate({ from: callerAddress, includeMetadata: true });

// Result includes:
// - result: the function return value
// - stats: execution statistics (timing, circuit sizes)
// - offchainEffects: any offchain effects emitted
// - estimatedGas: gas limit estimates
console.log("Balance:", result.result);
console.log("Estimated gas:", result.estimatedGas);
```

## Private function considerations

When simulating private functions, the caller must have access to any private state being read. The PXE only has visibility into notes belonging to registered accounts.

```typescript
// This works if callerAddress owns the notes
const balance = await contract.methods
  .balance_of_private(callerAddress)
  .simulate({ from: callerAddress });

// This fails if callerAddress doesn't have access to otherAddress's notes
const otherBalance = await contract.methods
  .balance_of_private(otherAddress)
  .simulate({ from: callerAddress }); // Error: cannot access private state
```

:::warning
Simulation runs locally without generating proofs. No correctness guarantees are provided on the result. See [Call Types](../foundational-topics/call_types.md#simulate) for more details.
:::

## Next steps

- [Send transactions](./how_to_send_transaction.md) to modify contract state
- Learn about [call types](../foundational-topics/call_types.md) and when to use simulation vs transactions
- Explore [testing patterns](./how_to_test.md) that use simulation
