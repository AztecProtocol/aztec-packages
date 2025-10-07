---
title: Enabling Authentication Witnesses
description: Enable contracts to execute actions on behalf of user accounts using authentication witnesses.
tags: [accounts, authwit]
sidebar_position: 6
---

Authentication witnesses (authwit) allow other contracts to execute actions on behalf of your account. This guide shows you how to implement and use authwits in your Aztec smart contracts.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of private and public functions in Aztec
- Access to the `authwit` library in your contract

For conceptual background, see [Authentication Witnesses](../../concepts/advanced/authwit.md).

## Set up the authwit library

Add the `authwit` library to your `Nargo.toml` file:

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v3.0.0-nightly.20251007", directory="noir-projects/smart-contracts/aztec" }
```

Import the authwit library in your contract:

```rust
use aztec::authwit::auth::compute_authwit_nullifier;
```

## Implement authwit in private functions

### Validate authentication in a private function

Check if the current call is authenticated using the `authorize_once` macro:

```rust
#[authorize_once("from", "authwit_nonce")]
#[private]
fn execute_private_action(
    from: AztecAddress,
    to: AztecAddress,
    value: u128,
    authwit_nonce: Field,
) {
    storage.values.at(from).sub(from, value).emit(encode_and_encrypt_note(&mut context, from));
    storage.values.at(to).add(to, value).emit(encode_and_encrypt_note(&mut context, to));
}
```

This allows anyone with a valid authwit (created by `from`) to execute an action on its behalf.

## Set approval state from contracts

Enable contracts to approve actions on their behalf by updating the public auth registry:

1. Compute the message hash using `compute_authwit_message_hash_from_call`
2. Set the authorization using `set_authorized`

This pattern is commonly used in bridge contracts (like the [uniswap example contract](https://github.com/AztecProtocol/aztec-packages/tree/next/noir-projects/noir-contracts/contracts/app/uniswap_contract)) where one contract needs to authorize another to perform actions on its behalf:

```rust
#[public]
#[internal]
fn _approve_and_execute_action(
    target_contract: AztecAddress,
    bridge_contract: AztecAddress,
    value: u128,
) {
    // Since we will authorize and instantly execute the action, all in public, we can use the same nonce
    // every interaction. In practice, the authwit should be squashed, so this is also cheap!
    let authwit_nonce = 0xdeadbeef;

    let selector = FunctionSelector::from_signature("execute_action((Field),u128,Field)");
    let message_hash = compute_authwit_message_hash_from_call(
        bridge_contract,
        target_contract,
        context.chain_id(),
        context.version(),
        selector,
        [context.this_address().to_field(), value as Field, authwit_nonce],
    );

    // We need to make a call to update it.
    set_authorized(&mut context, message_hash, true);

    let this_address = storage.my_address.read();
    // Execute the action!
    OtherContract::at(bridge_contract)
        .execute_external_action(this_address, value, this_address, authwit_nonce)
        .call(&mut context)
}
```
