---
title: Building a Wallet Extension
description: Learn how to build a Chrome extension wallet for Aztec with encrypted key storage, SponsoredFPC fee payment, and transaction approval flows
sidebar_position: 3
---

# Building a Wallet Extension for Aztec

In this tutorial, you'll build a fully functional Chrome extension wallet that can:

- Create and store encrypted accounts
- Deploy account contracts using SponsoredFPC (no fee tokens needed)
- Connect to dApps using the Aztec wallet SDK protocol
- Approve and sign transactions with a popup UI

This is a **standalone tutorial** that complements the [Webapp Tutorial](../webapp/index.md). While the webapp tutorial uses an embedded wallet for simplicity, this tutorial shows how to build a real browser extension wallet like MetaMask or Rabby.

## What You'll Learn

1. **Extension Architecture** - Service workers, offscreen documents, and message passing
2. **Wallet SDK Protocol** - Discovery, ECDH key exchange, and secure messaging
3. **PXE Integration** - Running a Private eXecution Environment in a browser extension
4. **Account Management** - Key derivation, encrypted storage, and Schnorr signatures
5. **Transaction Handling** - Signing, proofs, and SponsoredFPC fee payment
6. **Approval UIs** - React popups for connection and transaction approval

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│  Content Script                                              │
│  - Injected into every page                                  │
│  - Relays messages between page and background               │
└──────────────────────┬──────────────────────────────────────┘
                       │ chrome.runtime messages
┌──────────────────────▼──────────────────────────────────────┐
│  Service Worker (Background)                                 │
│  - Handles wallet SDK protocol                               │
│  - Routes wallet method calls to offscreen document          │
│  - Manages popup for user approvals                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ chrome.runtime messages
┌──────────────────────▼──────────────────────────────────────┐
│  Offscreen Document                                          │
│  - Runs PXE instance (long-lived, supports WASM)             │
│  - Implements wallet methods with SponsoredFPC               │
│  - Manages account creation and signing                      │
└──────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

**Service workers** in Manifest V3 have a 5-minute inactivity timeout and limited WASM support. Since the PXE needs persistent state and long-running proof generation, the extension uses an **offscreen document** that:

- Runs longer than service workers
- Supports IndexedDB for PXE storage
- Handles WASM-based proof generation
- Maintains state across requests

The **service worker** handles the lightweight protocol layer (discovery, key exchange) and routes heavier operations to the offscreen document.

## Prerequisites

Before starting, you should be familiar with:

- TypeScript and React basics
- Chrome extension development (Manifest V3)
- The Aztec concepts (accounts, transactions, PXE)

You'll also need:

- Node.js 22+
- Chrome browser
- A local Aztec network running (`aztec start --local-network`)
- The [webapp-tutorial project set up](../webapp/index.md#clone-the-example) (for testing)

## Project Structure

We'll build on the existing `test-extension/` in the webapp tutorial:

```text
test-extension/
├── manifest.json              # Chrome extension manifest
├── popup/
│   ├── popup.html            # Popup UI HTML
│   └── popup.css             # Popup styles
├── src/
│   ├── background.ts         # Service worker - protocol + routing
│   ├── content-script.ts     # Page <-> background relay
│   ├── config.ts             # Constants and configuration
│   ├── account-utils.ts      # Shared account instantiation logic
│   ├── aztec-imports.ts      # Lazy import caching for Aztec modules
│   ├── utils.ts              # Chrome runtime helpers and utilities
│   ├── offscreen/
│   │   ├── offscreen.html    # Offscreen document HTML
│   │   └── offscreen.ts      # PXE host + OffscreenWallet (BaseWallet subclass)
│   ├── popup/
│   │   └── popup.tsx         # React popup component
│   └── wallet/
│       ├── wallet-impl.ts    # ExtensionWalletManager - secret generation and encrypted storage
│       └── storage.ts        # Encrypted key storage with CryptoKey pattern
└── dist/                      # Compiled output
```

## Tutorial Sections

1. [**Architecture**](./01-architecture.md) - Understanding service worker limitations and offscreen documents
2. [**Wallet Protocol**](./02-wallet-protocol.md) - Implementing discovery, key exchange, and secure messaging
3. [**PXE Integration**](./03-pxe-integration.md) - Running PXE in an extension and extending BaseWallet
4. [**Account Management**](./04-accounts.md) - Key derivation, encrypted storage, and SchnorrAccountContract
5. [**Transaction Handling**](./05-transactions.md) - The sendTx flow, proofs, and SponsoredFPC
6. [**Approval UI**](./06-approval-ui.md) - Building React popups for user confirmations
7. [**Testing**](./07-testing.md) - Loading the extension and testing with the Pod Racing dApp

## Quick Start

If you want to try the completed wallet before reading the tutorial:

```bash
git clone https://github.com/AztecProtocol/aztec-packages.git
cd aztec-packages
git checkout v5.0.0
cd docs/examples/webapp-tutorial
./setup.sh
node esbuild.extension.mjs
```

Then load it in Chrome:

1. Make sure your local Aztec network is running (`aztec start --local-network`)
2. Open `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked** and select the `test-extension` folder
5. Start the dApp with `yarn dev` and open `http://localhost:5173`
6. Select "Browser Wallet" to connect

## Key Differences from Embedded Wallet

| Feature | Embedded Wallet | Extension Wallet |
|---------|----------------|------------------|
| **Location** | Runs in dApp's page | Runs in extension context |
| **Storage** | localStorage (accessible to dApp) | chrome.storage (isolated) |
| **Security** | Keys visible to dApp | Keys encrypted, never exposed |
| **UX** | No approval needed | Popup for approvals |
| **Setup** | Just import library | User installs extension |
| **Network** | Local development | Local network (or any network) |

## Next Steps

Start with [Architecture](./01-architecture.md) to understand why this multi-component design is needed, then work through each section to build your wallet.

:::tip Related Resources
- [Webapp Tutorial](../webapp/index.md) - Build a dApp that connects to this wallet
- [BaseWallet Source](https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/yarn-project/wallet-sdk/src/base-wallet/base_wallet.ts) - The class you extend
:::
