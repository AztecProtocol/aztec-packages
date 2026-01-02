---
title: Enabling Authentication Witnesses
description: Enable contracts to execute actions on behalf of user accounts using authentication witnesses.
tags: [accounts, authwit]
sidebar_position: 11
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

```rust title="transfer_in_private" showLineNumbers 
#[authorize_once("from", "authwit_nonce")]
#[external("private")]
fn transfer_in_private(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    authwit_nonce: Field,
) {
    self.storage.balances.at(from).sub(amount).deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
    self.storage.balances.at(to).add(amount).deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260102/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L304-L318" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L304-L318</a></sub></sup>


### Public function example

```rust title="transfer_in_public" showLineNumbers 
#[authorize_once("from", "authwit_nonce")]
#[external("public")]
fn transfer_in_public(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    authwit_nonce: Field,
) {
    let from_balance = self.storage.public_balances.at(from).read().sub(amount);
    self.storage.public_balances.at(from).write(from_balance);
    let to_balance = self.storage.public_balances.at(to).read().add(amount);
    self.storage.public_balances.at(to).write(to_balance);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260102/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L164-L178" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L164-L178</a></sub></sup>


The macro parameters specify:

- `"from"` - the parameter name containing the address that must have authorized the call
- `"authwit_nonce"` - the parameter name containing the nonce for replay protection

## Setting authorization from contracts

When a contract needs to authorize another contract to act on its behalf, use `set_authorized` to update the auth registry. This is common in bridge contracts where contract A authorizes contract B to perform actions.

```rust title="authwit_uniswap_set" showLineNumbers 
// This helper method approves the bridge to burn this contract's funds and exits the input asset to L1
// Assumes contract already has funds.
// Assume `token` relates to `token_bridge` (ie token_bridge.token == token)
// Note that private can't read public return values so created an `only_self` public that handles everything
// this method is used for both private and public swaps.
#[external("public")]
#[only_self]
fn _approve_bridge_and_exit_input_asset_to_L1(
    token: AztecAddress,
    token_bridge: AztecAddress,
    amount: u128,
) {
    // Since we will authorize and instantly spend the funds, all in public, we can use the same nonce
    // every interaction. In practice, the authwit should be squashed, so this is also cheap!
    let authwit_nonce = 0xdeadbeef;

    let selector = FunctionSelector::from_signature("burn_public((Field),u128,Field)");
    let message_hash = compute_authwit_message_hash_from_call(
        token_bridge,
        token,
        self.context.chain_id(),
        self.context.version(),
        selector,
        [self.address.to_field(), amount as Field, authwit_nonce],
    );

    // We need to make a call to update it.
    set_authorized(self.context, message_hash, true);

    let this_portal_address = self.storage.portal_address.read();
    // Exit to L1 Uniswap Portal !
    self.call(TokenBridge::at(token_bridge).exit_to_l1_public(
        this_portal_address,
        amount,
        this_portal_address,
        authwit_nonce,
    ));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260102/noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L180-L219" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L180-L219</a></sub></sup>


Key steps:

1. Compute the message hash using `compute_authwit_message_hash_from_call`
2. Call `set_authorized` to store the approval in the registry
3. Execute the authorized action

When authorization and consumption happen in the same transaction, state changes are squashed, saving gas.

## Canceling authwits

Users can revoke an authwit before it's used by emitting its nullifier:

```rust title="cancel_authwit" showLineNumbers 
#[external("private")]
fn cancel_authwit(inner_hash: Field) {
    let on_behalf_of = self.msg_sender().unwrap();
    let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
    self.context.push_nullifier(nullifier);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260102/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L295-L302" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L295-L302</a></sub></sup>


:::note
The cancel transaction must be finalized before any transaction attempts to use the authwit. If both are pending simultaneously, the outcome depends on which the sequencer includes first.
:::

## Next steps

- [Using authwits in aztec.js](../../aztec-js/how_to_use_authwit.md) - Create and manage authwits from your client application
- [Authentication Witnesses concepts](../../foundational-topics/advanced/authwit.md) - Deeper explanation of the authwit mechanism
