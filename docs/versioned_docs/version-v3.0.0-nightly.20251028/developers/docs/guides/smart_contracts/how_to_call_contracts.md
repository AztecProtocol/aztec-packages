---
title: Calling Other Contracts
sidebar_position: 4
tags: [functions, contracts, composability]
description: Call functions in other contracts from your Aztec smart contracts to enable composability.
---

This guide shows you how to call functions in other contracts from your Aztec smart contracts, enabling contract composability and interaction.

## Prerequisites

- An Aztec contract project with dependencies properly configured
- Access to the target contract's source code or ABI
- Understanding of Aztec contract compilation and deployment

## Add the target contract as a dependency

Add the contract you want to call to your `Nargo.toml` dependencies:

```toml
other_contract = { git="https://github.com/your-repo/", tag="v1.0.0", directory="path/to/contract" }
```

## Import the contract interface

Import the contract at the top of your contract file:

```rust
use other_contract::OtherContract;
```

## Call contract functions

Use this pattern to call functions in other contracts:

1. Specify the contract address: `Contract::at(contract_address)`
2. Call the function: `.function_name(param1, param2)`
3. Execute the call: `.call(&mut context)`

### Make private function calls

Call private functions directly using `.call()`:

```rust
OtherContract::at(contract_address).private_function(param1, param2).call(&mut context);
```

### Make public-to-public calls

Call public functions from other public functions using `.call()`:

```rust
let result = OtherContract::at(contract_address)
    .public_function(param1, param2, param3)
    .call(&mut context);
```

### Make private-to-public calls

Enqueue public functions to be executed after private execution completes:

```rust
OtherContract::at(contract_address)
    .public_function(param1, param2)
    .enqueue(&mut context);
```

:::info
Public functions always execute after private execution completes. Learn more in the [concepts overview](../../concepts/index.md).
:::

### Use other call types

Explore additional call types for specialized use cases in the [call types reference](../../concepts/call_types.md).
