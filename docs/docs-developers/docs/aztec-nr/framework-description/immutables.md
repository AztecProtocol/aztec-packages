---
title: Immutables via Salt
sidebar_position: 4
tags: [contracts, storage, immutables, optimization]
description: Commit immutable values into a contract's address salt, eliminating initialization transactions.
---

Aztec contracts can commit immutable values directly into the contract's address by encoding them into the deployment salt, removing the need for a separate initialization transaction.

## Overview

Rather than storing immutables in private storage (which requires an initializer function and an extra transaction), the [aztec-immutables-macro](https://github.com/defi-wonderland/aztec-immutables-macro/tree/dev) library encodes them into the contract's salt:

```
salt = poseidon2_hash([actual_salt, constant_0, constant_1, ...])
```

Since the salt is part of the address derivation, the immutable values become cryptographically bound to the contract's address itself.

## Key benefits

- **No initialization transaction** — immutables are committed at deployment time, not in a separate setup call
- **Runtime verification** — at execution time, capsule data is loaded and verified against the stored salt, ensuring data integrity
- **Persistent storage** — immutables are persisted to the PXE's [CapsuleStore](./advanced/how_to_use_capsules.md) after deployment, so capsules don't need to be attached to every transaction
- **Compatible with standard storage** — works alongside `#[storage]` and initializers when needed

## Performance

Initialization cost is completely eliminated (no constructor transaction). The per-transaction overhead is approximately 1,098 gates (+0.2%) in the account entrypoint.

## Getting started

For installation instructions, usage examples, and a reference implementation of an initializerless Schnorr account contract, see the [aztec-immutables-macro README](https://github.com/defi-wonderland/aztec-immutables-macro/tree/dev).

The protocol ships a built-in account contract using the same pattern: see [account deployment](../../foundational-topics/accounts/deployment.md) for how initializerless accounts work and [creating accounts](../../aztec-js/how_to_create_account.md#create-an-initializerless-account) for using them from Aztec.js.
