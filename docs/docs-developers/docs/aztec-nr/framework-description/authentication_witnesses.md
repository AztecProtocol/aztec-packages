---
title: Authentication Witnesses
description: Enable contracts to execute actions on behalf of user accounts using authentication witnesses.
tags: [accounts, authwit]
sidebar_position: 11
references: ["noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr", "noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr"]
---

Authentication witnesses (authwit) allow other contracts to execute actions on behalf of your account. This guide shows you how to implement and use authwits in your Aztec smart contracts.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of private and public functions in Aztec

For conceptual background, see [Authentication Witnesses](../../foundational-topics/advanced/authwit.md).

## Import the authwit library

The `aztec` library includes authwit functionality. Import the necessary components:

```rust
use aztec::{
    authwit::auth::{compute_authwit_message_hash_from_call, set_authorized},
    macros::functions::authorize_once,
};
```

## Using the `authorize_once` macro

The `#[authorize_once]` macro validates that a caller has authorization from the `from` address. It handles authwit verification and nullifier emission automatically.

### Private function example

#include_code transfer_in_private noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

### Public function example

#include_code transfer_in_public noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

The macro parameters specify:

- `"from"` - the parameter name containing the address that must have authorized the call
- `"authwit_nonce"` - the parameter name containing the nonce for replay protection

## Setting authorization from contracts

When a contract needs to authorize another contract to act on its behalf, use `set_authorized` to update the auth registry. This is common in bridge contracts where contract A authorizes contract B to perform actions.

#include_code authwit_uniswap_set noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr rust

Key steps:

1. Compute the message hash using `compute_authwit_message_hash_from_call`
2. Call `set_authorized` to store the approval in the registry
3. Execute the authorized action

When authorization and consumption happen in the same transaction, state changes are squashed, saving gas.

## Canceling authwits

Users can revoke an authwit before it's used by emitting its nullifier:

#include_code cancel_authwit noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

:::note
The cancel transaction must be finalized before any transaction attempts to use the authwit. If both are pending simultaneously, the outcome depends on which the sequencer includes first.
:::

## Next steps

- [Using authwits in aztec.js](../../aztec-js/how_to_use_authwit.md) - Create and manage authwits from your client application
- [Authentication Witnesses concepts](../../foundational-topics/advanced/authwit.md) - Deeper explanation of the authwit mechanism
