---
title: Addresses
description: Learn how addresses work on Aztec - from smart contract accounts to deterministic address derivation.
displayed_sidebar: participateSidebar
---

# Addresses on Aztec

Addresses on Aztec work differently from traditional blockchains. This page explains how they're created and why they enable powerful privacy features.

## Every account is a smart contract

On Ethereum, you have two types of accounts: externally owned accounts (EOAs) controlled by private keys, and smart contract accounts. On Aztec, **every account is a smart contract**. This is called "native account abstraction."

This design means your account can have custom rules for:
- **Authentication** - How you prove ownership (single key, multisig, biometrics)
- **Recovery** - How you regain access if you lose your keys
- **Permissions** - What actions are allowed and when

## Deterministic addresses

One of Aztec's unique features is that addresses can be calculated before the account contract is deployed. Your address is derived from:

1. **Your public keys** - The cryptographic keys associated with your account
2. **Contract information** - The code and parameters of your account contract

This has practical benefits:
- **Receive funds first** - Someone can send you tokens before your account even exists
- **Predictable addresses** - You know your address as soon as you generate your keys
- **Flexible deployment** - Deploy your account only when you need to send transactions

## The complete address

An Aztec address is derived from a "complete address," which bundles together all the information needed to interact with an account:

- All your public keys (for encryption and privacy features)
- The partial address (a hash committing to the account contract's code and deployment parameters)

The address itself is a hash of this complete address. To send someone a private transaction, you need their complete address - not just the address hash - because you need their public keys to encrypt data for them.

## Privacy considerations

Aztec addresses are designed with privacy in mind:

- **Addresses don't reveal activity** - Unlike Ethereum where all transactions associated with an address are visible on chain, Aztec's privacy features keep your transaction history hidden
- **Multiple accounts are easy** - Create as many accounts as you need for different purposes

## How this differs from Ethereum

| Aspect | Ethereum | Aztec |
|--------|----------|-------|
| Account types | EOAs and smart contracts | Only smart contracts (native account abstraction) |
| Address derivation | From public key (EOA) or CREATE/CREATE2 (Ethereum's contract-creation opcodes) | Deterministically from complete address (keys + contract code) |
| Custom auth logic | Requires smart contract wallet (e.g. ERC-4337) | Built in - every account defines its own auth |
| Sending to someone | Just need their address | Need their complete address (includes public keys for encryption) |

---

:::tip For developers
Learn how to work with accounts programmatically in the [Accounts documentation](/developers/docs/foundational-topics/accounts).
:::
