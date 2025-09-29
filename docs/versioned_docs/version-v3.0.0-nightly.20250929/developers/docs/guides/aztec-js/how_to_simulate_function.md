---
title: Simulating Functions
tags: [functions, view, simulation]
sidebar_position: 5
description: Step-by-step guide to simulating function calls and reading state from Aztec contracts.
---

This guide shows you how to simulate function calls to read contract state.

## Prerequisites

- Deployed contract address and ABI
- Wallet or PXE connection
- Understanding of [contract functions](../smart_contracts/how_to_define_functions.md)

## Connect to a contract

Let's say you've connected to a contract, for example:

```typescript
import { Contract } from "@aztec/aztec.js";

const contract = await Contract.at(contractAddress, artifact, wallet);
```

or

```typescript
import { MyContract } from './artifacts/MyContract';

const contract = await MyContract.at(contractAddress, wallet);
```

## Simulate public functions

### Step 1: Call a public view function

```typescript
const result = await contract.methods.get_public_value(param1)
    .simulate({ from: callerAddress }); // assuming callerAddress is already registered on the wallet, i.e. wallet.createSchnorrAccount(caller.secret, caller.salt)

console.log('Public value:', result);
```

### Step 2: Handle return values

```typescript
const result = await contract.methods
    .get_multiple_values()
    .simulate({ from: callerAddress });

// Destructure if returning multiple values
const [value1, value2] = result;
```

## Simulate private functions

### Step 1: Call a private view function

```typescript
const privateResult = await contract.methods.get_private_balance(ownerAddress)
    .simulate({ from: ownerAddress });
```

### Step 2: Access private notes

```typescript
// Private functions can access the caller's private state
const notes = await contract.methods.get_my_notes()
    .simulate({ from: ownerAddress });
```

:::warning
Private simulations only work if the caller has access to the private state being queried.
:::

## Simulate utility functions

### Step 1: Call utility function

```typescript
const result = await contract.methods.compute_value(input1, input2)
    .simulate({ from: account.address });

console.log('Computed value:', result);
```

### Step 2: Use utility functions for complex queries

```typescript
const aggregatedData = await contract.methods.get_aggregated_stats(
    startBlock,
    endBlock
).simulate({ from: account.address });

// Returns structured data based on function signature
console.log('Stats:', aggregatedData);
```

## Simulate with different contexts

### Simulate from different addresses

```typescript
// Simulate as different users to test access control
const asOwner = await contract.methods.admin_function()
    .simulate({ from: ownerAddress });

try {
    const asUser = await contract.methods.admin_function()
        .simulate({ from: userAddress });
} catch (error) {
    console.log('User cannot access admin function');
}
```

## Next steps

- [Send transactions](./how_to_send_transaction.md) to modify contract state
- Learn about [private and public functions](../smart_contracts/how_to_define_functions.md)
- Explore [testing patterns](./how_to_test.md) for simulations
- Understand [state management](../smart_contracts/how_to_define_storage.md)

