---
title: Wallets
description: Explore Aztec wallets, their unique responsibilities, and hardware wallet support.
displayed_sidebar: participateSidebar
references: ["yarn-project/stdlib/src/keys/*", "yarn-project/cli-wallet/src/*"]
---

# Wallets on Aztec

Wallets on Aztec do more than just store your keys. This page covers what wallets are available, what makes them different, and the future of hardware wallet support.

## Available wallets

### Azguard

[Azguard](https://azguardwallet.io/) is a browser extension wallet for Aztec, and currently the wallet to use if you want to interact with Aztec applications from your browser. It connects to Aztec apps the same way MetaMask connects to Ethereum apps: a website requests a connection, and you approve it in the extension.

With Azguard you can:

- Create and manage Aztec accounts
- Connect to Aztec applications, such as the [Shield](https://shield.human.tech/) bridge for [getting Fee Juice](/participate/basics/fees#how-to-get-fee-juice)
- Sign and send transactions, with proofs generated on your device

### Other wallets

Ecosystem teams are building more wallets for everyday users, and availability changes quickly at this stage. Check the Wallets category of the [Aztec ecosystem page](https://aztec.network/projects) for the current list.

:::caution Install from official sources only
Fake wallet extensions and apps are a common scam. Open wallet download pages from the [ecosystem page](https://aztec.network/projects) or the wallet team's official channels, never from search ads or links sent to you in chat. See [Staying safe](/participate/safety).
:::

### Aztec CLI Wallet

The Aztec CLI wallet is the reference wallet packaged and maintained by the Aztec team. It is a command-line tool that handles account creation, transaction signing, and private state management. It is aimed at developers and advanced users.

:::note
More third-party wallets are expected to become available as the ecosystem grows.
:::

### Developer Wallets

For testing and development, the Aztec sandbox includes built-in wallet functionality that developers can use to test their applications.

## What Makes Aztec Wallets Different

Aztec wallets have additional responsibilities compared to traditional crypto wallets:

### Private State Management

Unlike public blockchains where anyone can see your balance, Aztec keeps your private data encrypted. Your wallet must:

- Track your private notes (like UTXOs)
- Decrypt incoming transfers
- Maintain a local database of your private state

### Client-Side Proving

On Aztec, transactions are proven on your device before being sent to the network. This means:

- Your wallet generates zero-knowledge proofs
- Proof generation happens locally
- Only the proof (not your private data) is shared with the network

### Key Management

Aztec accounts use multiple key types for different purposes:

- **Nullifier keys** - Spend your private notes by creating nullifiers that mark notes as consumed
- **Incoming viewing keys** - Decrypt notes that others send to you
- **Outgoing viewing keys** - Decrypt records of notes you've sent to others
- **Tagging keys** - Help your wallet efficiently find and index your private notes

Your wallet derives all of these from your master seed and manages them securely. For transaction authorization, Aztec uses its native account abstraction—your account contract defines its own authentication logic, which may use one of these keys or a separate signing mechanism.

## Hardware Wallet Support

### Current Status

Hardware wallet support for Aztec is **planned but not yet available**. This is a high priority for the ecosystem.

### How It Would Work

When hardware wallets are supported, they would:

1. **Store authentication keys securely** - Keys used for transaction authorization never leave the hardware device
2. **Authorize transactions** - Approve transactions with physical confirmation
3. **Work with viewing keys** - Some viewing functionality may need to remain on software wallets for practicality

### Challenges

Supporting hardware wallets with Aztec's privacy model presents unique challenges:

- **Proof generation** - Zero-knowledge proofs require significant computation, which hardware wallets can't perform
- **Key types** - Aztec uses multiple key types that need different handling
- **Privacy trade-offs** - Balancing hardware security with the need to view private state

### Expected Support

The Aztec team is working on hardware wallet integration. Ledger and Trezor support is planned for future releases. Check the [Aztec forum](https://forum.aztec.network/) for updates.

## Choosing a Wallet

When comparing the wallets listed on the [ecosystem page](https://aztec.network/projects), consider:

| Factor | What to Look For |
|--------|------------------|
| **Security** | Open source, audited code |
| **Backup** | Seed phrase or key export options |
| **Compatibility** | Support for the applications you use |
| **Device support** | Browser extension, mobile, or desktop |

## Security Best Practices

- **Back up your keys** - Write down your recovery phrase and store it securely
- **Use separate accounts** - Keep large holdings in accounts you don't use for daily transactions
- **Verify addresses** - Always double-check addresses before sending
- **Keep software updated** - Use the latest wallet versions for security fixes

---

:::tip Ready to set one up?
The [Get started guide](/participate/get-started) walks through wallet setup, funding your account, and your first transaction.
:::

:::tip For developers
Learn about building wallet integrations in the [Wallets documentation](/developers/docs/foundational-topics/wallets).
:::
