---
title: Enabling Authentication Witnesses
description: Enable contracts to execute actions on behalf of user accounts using authentication witnesses.
tags: [accounts, authwit]
sidebar_position: 7
---

Authentication witnesses (authwit) allow other contracts to execute actions on behalf of your account. This guide shows you how to implement and use authwits in your Aztec smart contracts.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of private and public functions in Aztec
- Access to the `authwit` library in your contract

For conceptual background, see [Authentication Witnesses](../../../aztec/concepts/advanced/authwit.md). For JavaScript integration, see the [Aztec.js authwit guide](../js_apps/authwit.md).

## Set up the authwit library

Add the `authwit` library to your `Nargo.toml` file:

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
```

Import the authwit library in your contract:

```rust
use aztec::authwit::auth::compute_authwit_nullifier;
```

## Implement authwit in private functions

### Validate authentication in a private function

Check if the current call is authenticated using `assert_current_call_valid_authwit`:

```rust
// docs:start:authorize_once
#[authorize_once("from", "authwit_nonce")]
// docs:end:authorize_once
#[private]
fn execute_private_action(
    from: AztecAddress,
    to: AztecAddress,
    value: u128,
    authwit_nonce: Field,
) {
    // docs:start:modify_private_state
    storage.values.at(from).sub(from, value).emit(encode_and_encrypt_note(&mut context, from));
    // docs:end:modify_private_state
    storage.values.at(to).add(to, value).emit(encode_and_encrypt_note(&mut context, to));
}
```

### Create the authentication witness in TypeScript

Generate and add the authentication witness using Aztec.js:

```typescript
const action = myContract
  .withWallet(account1)
  .methods.execute_private_action(adminAddress, account1Address, value, authwitNonce);

const witness = await admin.createAuthWit({ caller: account1Address, action });
expect(await admin.lookupValidity(adminAddress, { caller: account1Address, action }, witness)).toEqual({
  isValidInPrivate: true,
  isValidInPublic: false,
});
```

## Implement authwit in public functions

### Validate authentication in a public function

Use `assert_current_call_valid_authwit_public` for public function authentication:

```rust
#[authorize_once("from", "authwit_nonce")]
#[public]
fn execute_public_action(
    from: AztecAddress,
    to: AztecAddress,
    value: u128,
    authwit_nonce: Field,
) {
    let from_value = storage.public_values.at(from).read().sub(value);
    storage.public_values.at(from).write(from_value);
    let to_value = storage.public_values.at(to).read().add(value);
    storage.public_values.at(to).write(to_value);
}
```

### Create the authentication witness for public functions

Set the authentication flag in the public registry:

```typescript
const action = myContract
  .withWallet(account1)
  .methods.execute_public_action(adminAddress, account1Address, value, authwitNonce);

const validateActionInteraction = await admin.setPublicAuthWit({ caller: account1Address, action }, true);
await validateActionInteraction.send({ from: adminAddress }).wait();
```

## Set approval state from contracts

Enable contracts to approve actions on their behalf by updating the public auth registry:

1. Compute the message hash using `compute_authwit_message_hash_from_call`
2. Set the authorization using `set_authorized`

```rust
// This helper method approves another contract to execute an action on this contract's behalf
// Assumes contract already has the required state.
// Generic pattern for contract-to-contract authorization
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
