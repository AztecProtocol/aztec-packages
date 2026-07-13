---
title: Account Deployment
tags: [accounts]
description: How Aztec accounts come into existence, from the standard initializer plus deployment flow to initializerless accounts that need no onchain transaction at all.
references:
  [
    "noir-projects/noir-contracts/contracts/account/schnorr_initializerless_account_contract/src/main.nr",
    "noir-projects/noir-contracts/contracts/account/schnorr_account_contract/src/main.nr",
  ]
---

## How accounts come into existence

Every account in Aztec is a [contract instance](../contract_creation.md), and its address is computed deterministically from its instantiation parameters. There are two ways to make an account usable:

1. **The standard flow**: create the account locally, then send a deployment transaction that runs its initializer.
2. **The initializerless flow**: create the account locally, and that is it. No deployment transaction is ever sent.

This page explains both flows and when to choose each.

## The standard flow: initialize and deploy

A regular account contract (for example the default Schnorr account) stores its signing public key in private state. Writing that state requires running the contract's constructor, a [private initializer function](../../aztec-nr/framework-description/functions/attributes.md#initializer-functions-initializer), which in turn requires sending a transaction to the network and paying [fees](../fees.md) for it.

The address commits to that pending initialization: the constructor call's selector and arguments are hashed into the instance's `initialization_hash`, which is folded into the address derivation. This is why the address can be computed, shared, and even receive funds before the deployment transaction is sent, and why the account only becomes able to send transactions after it.

## Initializerless accounts

An initializerless account removes the deployment transaction entirely. Instead of storing the signing key in private state through an initializer, the key is committed directly into the address: the instance's `immutables_hash` field is set to the hash of the signing public key, and `immutables_hash` participates in address derivation just like `initialization_hash` does.

Since the address itself is the commitment to the signing key, there is no onchain state to create:

- The account contract has no initializer. Its `constructor` is an unconstrained utility function that runs only in the PXE: it checks that the provided public key hashes to the instance's `immutables_hash` and stores the key in the PXE's local store.
- When the account later authorizes a transaction, its entrypoint loads the key from the local store and proves in the private kernel that the key's hash matches the `immutables_hash` committed in the address. Tampering with the local key is not possible without changing the address.

Creating an initializerless account is therefore a purely local operation: the wallet computes the address, registers the contract instance in the PXE, and runs the utility constructor through a simulation. No transaction is sent, no fee is paid, and the account can start transacting as soon as it has a way to pay for its first real transaction (for example a [Sponsored FPC](../fees.md#payment-methods) or a Fee Juice balance at its address).

The genesis-funded test accounts in the local network are initializerless Schnorr accounts: their addresses receive Fee Juice at genesis, and wallets materialize them locally without any deployment.

## Trade-offs

Initializerless accounts are a good default when the account's authorization logic only depends on parameters that never change:

- **No deployment cost or delay.** The account is usable the moment it is created, which makes onboarding flows and receive-only addresses cheap.
- **The signing key is fixed forever.** The key is baked into the address, so there is no way to rotate it. A new key means a new address. The default Schnorr account offers no key rotation either, but account contracts that keep keys in state can be designed to support it.
- **Local setup is still required per PXE.** A fresh PXE does not know about the account until the wallet registers the instance and runs the utility constructor again. This is a purely offline step with no fee, but it must happen in every new environment before the account can be used.
- **There is no deployment method.** Calling `getDeployMethod()` on an initializerless account throws, since there is nothing to deploy.

Use the standard flow when the account contract needs an initializer: for example when it takes arbitrary constructor arguments or stores its authorization material in private notes.

## Using initializerless accounts

- In Aztec.js, call `createSchnorrInitializerlessAccount(secret, salt)` on your wallet. See [creating accounts](../../aztec-js/how_to_create_account.md#create-an-initializerless-account).
- In the CLI, pass the account type: `aztec-wallet create-account -t schnorr_initializerless`. The command registers the account locally and returns immediately, with no deployment transaction.
- In Aztec.nr, the same address-immutables pattern can be applied to your own contracts. See [immutables](../../aztec-nr/framework-description/immutables.md).

## Next steps

- [Create an account in Aztec.js](../../aztec-js/how_to_create_account.md)
- [Understand fees and payment methods](../fees.md)
- [Contract creation and address derivation](../contract_creation.md)
