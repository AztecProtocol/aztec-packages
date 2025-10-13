---
title: "Connecting to a Wallet"
description: "Learn how to connect your Aztec application to user wallets, enabling secure authentication and transaction signing"
tags: [wallet, connection, authentication, full-stack]
sidebar_position: 3
---

After connecting to the Aztec network, the next step is integrating with user wallets. Wallets are how your users will authenticate, manage their accounts, and authorize transactions in your application.

## What You'll Learn

By the end of this section, you'll understand:

- What Aztec wallets are and how they differ from Ethereum wallets
- How to detect and connect to installed wallet extensions
- How to request account access from users
- How to handle wallet connection state in your application
- Best practices for wallet integration in production apps

## Understanding Aztec Wallets

Aztec wallets serve a similar role to MetaMask or other Web3 wallets, but with some key differences due to Aztec's privacy features:

- **PXE Integration**: Aztec wallets manage the user's Private Execution Environment (PXE), handling private key management and proof generation
- **Account Contracts**: Instead of simple key pairs, wallets manage account contracts with flexible authentication
- **Note Management**: Wallets track and decrypt private notes, maintaining the user's private state
- **Four-Key System**: Wallets handle nullifier keys, address keys, incoming viewing keys, and signing keys

## Current State of Wallet Integration

:::info Work in Progress
The Aztec wallet interface is actively being developed and standardized. The patterns and APIs for wallet integration are evolving as the ecosystem matures. This page will be updated with comprehensive guides once the wallet interface specification is finalized.

In the meantime, for development and testing purposes, you'll typically work with:

- **Sandbox accounts**: Pre-generated accounts available in your local sandbox
- **Programmatic account creation**: Creating accounts directly in your code (covered in the next section)
  :::

## Development Workflow

For now, when building full-stack Aztec applications, you'll typically:

1. **Connect to PXE**: Establish a connection to a PXE instance (sandbox or remote)
2. **Get or Create Accounts**: Use existing sandbox accounts or create new ones programmatically
3. **Create Wallets**: Instantiate wallet objects that wrap account contracts
4. **Interact with Contracts**: Use these wallets to sign and send transactions

The next section, [Creating Accounts](how_to_create_account), shows you how to create accounts programmatically, which is the current primary method for development.

<!-- TODO: add include_code for wallet page -->

## Future Wallet Integration

As the Aztec wallet ecosystem develops, you can expect:

- **Browser Extensions**: Wallet extensions similar to MetaMask for Aztec
- **Mobile Wallets**: Native mobile applications for managing Aztec accounts
- **Hardware Wallet Support**: Integration with Ledger and other hardware wallets
- **Wallet Connect**: Standardized protocols for dApp-wallet communication
- **Social Recovery**: Built-in account recovery mechanisms

For the latest information on wallet development and integration patterns, refer to:

- [Aztec Starter Repository](https://github.com/AztecProtocol/aztec-starter) - Example implementations

## Next Steps

Ready to get your hands dirty? Move on to [Creating Accounts](how_to_create_account) to learn how to create and manage accounts in your Aztec application. This is currently the primary method for development and testing.
