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
token = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v4.0.0-nightly.20260202", directory="noir-projects/noir-contracts/contracts/app/token_contract" }
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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260202/noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L248-L250" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L248-L250</a></sub></sup>


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
