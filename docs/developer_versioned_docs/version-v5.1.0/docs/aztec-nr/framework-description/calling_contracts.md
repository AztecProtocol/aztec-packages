---
title: Calling Other Contracts
sidebar_position: 5
tags: [functions, contracts, composability]
description: Call functions in other contracts from your Aztec smart contracts to enable composability.
references: ["noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr"]
---

This guide shows you how to call functions in other contracts from your Aztec smart contracts.

## Add the target contract as a dependency

Add the contract you want to call to your `Nargo.toml` dependencies:

```toml
[dependencies]
token = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v5.1.0", directory="noir-projects/noir-contracts/contracts/app/token_contract" }
```

Then import the contract interface at the top of your contract file:

```rust
use token::Token;
```

## Call contract functions

Use `self.call()` to call functions on other contracts:

```rust
self.call(Token::at(token_address).transfer(recipient, amount));
```

The pattern is:

1. Form the call: `Contract::at(address).function_name(args)`
2. Execute it: `self.call(...)` or `self.view(...)` for read-only calls

### Private-to-private calls

```rust title="private_call" showLineNumbers 
let _ = self.call(Token::at(stable_coin).burn_private(from, amount, authwit_nonce));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L218-L220" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L218-L220</a></sub></sup>


### Public-to-public calls

From a public function, call other public functions directly:

```rust
self.call(Token::at(token_address).transfer_in_public(recipient, amount));
```

Capture return values by assigning the result:

```rust
let balance = self.view(Token::at(token_address).balance_of_public(account));
```

Use `self.view()` for read-only calls that cannot modify state.

### Private-to-public calls

From a private function, enqueue public function calls for later execution:

```rust
self.enqueue(Token::at(token_address).mint_to_public(recipient, amount));
```

:::info
Public functions execute after all private execution completes. Return values are not available in the private context. Learn more about [call types](../../foundational-topics/call_types.md).
:::

## Utility calls

Utility functions can call other utility functions. These calls run entirely offchain in PXE and are never proven, so no guarantees are made on the correctness of their results.

### Utility-to-utility calls

From a utility function, use `self.call()` as with other call types:

```rust
let balance = self.call(Token::at(token_address).get_balance_of(owner));
```

To call a utility function of your own contract, use the `self.call_self` stubs instead:

```rust
self.call_self.my_utility_function(args)
```

### Private-to-utility calls

Private functions can also call utility functions, through `self.utility`. The call executes unconstrained code, so it must be wrapped in `unsafe`, and its result is not proven: use it to inform logic, never as an input to a constrained assertion without validating it first.

```rust
// Safety: result is unconstrained
let balance = unsafe { self.utility.call(Token::at(token_address).get_balance_of(owner)) };
```

The same-contract stubs are available here as `self.utility.call_self`:

```rust
unsafe { self.utility.call_self.my_utility_function(args) }
```

Public functions cannot call utility functions: they run on the sequencer, which has no access to private state or PXE.

### Cross-contract authorization

A utility call to the calling contract itself always succeeds. A call to a _different_ contract can expose that contract's private state to the caller, so PXE asks the wallet to authorize it before proceeding. If the wallet denies the call, or no `authorizeUtilityCall` hook is configured, the simulation fails with `Cross-contract utility call denied`. See [execution hooks](../../foundational-topics/pxe/execution_hooks.md#authorizeutilitycall) for how wallets handle these requests, and for authorizing targets in Noir tests with `with_authorized_utility_call_targets`.

### `msg_sender` in nested utility calls

A utility function called from another contract can read the calling contract's address via `self.msg_sender()`, mirroring private and public functions. A utility function invoked directly by an application has no caller: `self.msg_sender()` panics, and `self.context.maybe_msg_sender()` returns `Option::none()`. Within a simulation PXE takes this value from the actual call graph, but utility execution as a whole is unconstrained, so contracts must not rely on it as a security guarantee.
