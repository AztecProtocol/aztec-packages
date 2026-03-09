---
title: "2. Network & Wallet"
sidebar_position: 2
description: "Connect to Aztec using an embedded wallet for local dev or the wallet SDK for devnet"
---

# Network & Wallet

This section covers connecting your webapp to the Aztec network and setting up a wallet. You'll create three source files (`config.ts`, `embedded-wallet.ts`, `wallet-connection.ts`) plus shared fee utilities and UI components.

## Key concepts

Before writing any code, it helps to understand two pieces of infrastructure that every Aztec app relies on:

**PXE (Private eXecution Environment)** is a client-side runtime that runs in the browser as WASM. It stores your private notes, manages your encryption keys, executes private functions, and generates zero-knowledge proofs. Because PXE runs locally, your private data never leaves the browser. Every Aztec app needs a PXE — either one it creates itself or one provided by a wallet extension.

**Aztec node** is the server-side component that maintains the network's public state and sequences transactions into blocks. Your PXE connects to a node (a local sandbox during development, or a remote devnet/mainnet node in production) to sync state and submit transactions. The node never sees your private data — it only receives proofs and encrypted outputs.

The relationship is straightforward: PXE handles everything private (notes, keys, proofs), the node handles everything public (state, blocks, sequencing), and they communicate over a standard RPC interface.

## Network configuration

Create `src/config.ts` to determine which Aztec node to connect to and to provide a helper for creating an in-browser PXE:

#include_code config /docs/examples/webapp-tutorial/src/config.ts typescript

`createLocalPXE` sets up PXE in three steps:

1. `createAztecNodeClient` — opens an RPC connection to the Aztec node so PXE can sync public state and submit transactions.
2. `getPXEConfig` + `getL1ContractAddresses` — fetches protocol configuration from the node, including L1 contract addresses and network parameters that PXE needs to construct valid proofs.
3. `createPXE` — starts a full PXE instance in the browser. From this point on, all private execution happens locally.

## Wallet modes

Aztec supports two wallet modes, and you'll implement both:

- **Embedded wallet** — your app creates PXE and manages accounts directly. Best for local development with the sandbox.
- **Wallet SDK** — your app connects to an external browser extension that owns PXE and accounts. Required for devnet and production.

Both modes produce the same `Wallet` interface, so the rest of your app doesn't need to know which one is in use.

## Embedded wallet (local development)

For local development, you'll create an `EmbeddedWallet` class that extends `BaseWallet` from the Aztec wallet SDK. `BaseWallet` provides account abstraction, transaction signing, and fee handling — your subclass just needs to supply initialization logic, account management, and a fee payment strategy.

Create `src/embedded-wallet.ts`:

### Initialization

#include_code initialize /docs/examples/webapp-tutorial/src/embedded-wallet.ts typescript

This is similar to `createLocalPXE` from `config.ts`, but additionally registers the SponsoredFPC contract with PXE so that fee payment works out of the box.

### Connecting a test account

The local sandbox ships with pre-deployed test accounts. These are Schnorr-signature accounts that are already registered and funded on the sandbox, so you can use them immediately without deploying a new account contract. You select one by index (0, 1, 2, etc.).

#include_code connect-test-account /docs/examples/webapp-tutorial/src/embedded-wallet.ts typescript

### Fee payment

Every Aztec transaction must pay a fee (similar to gas on Ethereum). Rather than requiring users to hold fee tokens during development, the embedded wallet overrides `completeFeeOptions` to inject SponsoredFPC as the default fee payer for every transaction. Callers never need to pass fee options manually.

#include_code fee-options /docs/examples/webapp-tutorial/src/embedded-wallet.ts typescript

### Full class

The complete `EmbeddedWallet` puts these pieces together:

#include_code embedded-wallet-class /docs/examples/webapp-tutorial/src/embedded-wallet.ts typescript

## Wallet SDK (devnet / production)

On devnet and production, users connect via a browser extension wallet (like MetaMask on Ethereum). The wallet extension owns the PXE, manages keys, and signs transactions. Your app communicates with it through the **wallet SDK**, which handles discovery, secure channel setup, and verification.

### Testing with the test wallet extension

The tutorial includes a minimal test wallet extension in `test-extension/` for testing the wallet SDK flow without installing a real wallet. This extension auto-approves all connection requests and returns a mock account — useful for development and E2E testing.

To use it:

1. Build the extension (from the `webapp-tutorial` directory):
   ```bash
   node esbuild.extension.mjs
   ```

2. Load it in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `test-extension/` folder

3. After making changes to the extension source, rebuild and click the refresh icon in `chrome://extensions/`

The test extension responds to `getAccounts()` with a hardcoded test account. It won't sign real transactions, but it's enough to verify your wallet connection UI works correctly before testing with a real wallet.

Create `src/wallet-connection.ts`:

### Step 1: Discover available wallets

Your app needs to find which wallet extensions the user has installed. The SDK does this through a `window.postMessage`-based discovery protocol: your app broadcasts a discovery request, and any installed wallet extension responds with its provider info (name, icon, supported chain).

The `discoverWallets` function starts this process and calls your `onUpdate` callback each time a new wallet extension responds. You use the resulting list to show users a "pick your wallet" UI.

#include_code discover-wallets /docs/examples/webapp-tutorial/src/wallet-connection.ts typescript

### Step 2: Connect and verify

Once the user picks a wallet, you need to establish a secure communication channel. This is important because `window.postMessage` is visible to every script on the page — without encryption, a malicious script could intercept private data flowing between your app and the wallet.

The connection uses an **ECDH key exchange**: your app and the wallet extension each generate an ephemeral key pair and derive a shared secret. All subsequent messages are encrypted with this shared secret.

To guard against man-in-the-middle attacks (where a malicious script intercepts the key exchange and substitutes its own keys), the SDK produces a verification hash that gets converted to a short **emoji string**. Your app displays these emojis, and the user checks that their wallet extension shows the same emojis. If they match, the channel is secure. If they don't, the connection should be rejected.

After the user confirms the emojis match, calling `confirm()` completes the handshake and returns a `Wallet` instance connected to the extension.

#include_code connect-wallet /docs/examples/webapp-tutorial/src/wallet-connection.ts typescript

## Fee payment helpers

Both wallet modes need access to the SponsoredFPC contract. **SponsoredFPC** (Fee Payment Contract) is a special contract deployed at a well-known deterministic address that agrees to pay transaction fees on behalf of any caller. It's available on the local sandbox and devnet, making it useful for onboarding users who don't yet have fee tokens.

Create `src/fees.ts` with shared utilities:

#include_code get-sponsored-fpc /docs/examples/webapp-tutorial/src/fees.ts typescript

PXE needs the SponsoredFPC artifact registered so it can include fee payment logic when constructing transaction proofs. Without this registration, PXE wouldn't know how to interact with the fee contract:

#include_code register-fpc /docs/examples/webapp-tutorial/src/fees.ts typescript

## Components

With the wallet logic in place, you need three UI components to wire it together.

### Network picker (`src/components/NetworkPicker.tsx`)

Lets the user choose between "Local" (sandbox) and "Devnet". Calls `onNetworkChange` with the selected `NetworkType`, which determines which wallet mode the app uses.

#include_code network-picker /docs/examples/webapp-tutorial/src/components/NetworkPicker.tsx typescript

### Wallet connect (`src/components/WalletConnect.tsx`)

Handles both wallet modes in a single component. For local networks it shows the embedded wallet flow (pick a test account, connect). For devnet it runs the SDK discovery and verification flow. Once connected, it calls `onWalletConnected` with the `Wallet` instance.

#include_code wallet-connect-component /docs/examples/webapp-tutorial/src/components/WalletConnect.tsx typescript

### Account info (`src/components/AccountInfo.tsx`)

Displays the connected account's address. Takes the wallet as a prop.

#include_code account-info /docs/examples/webapp-tutorial/src/components/AccountInfo.tsx typescript

## Next steps

With a wallet connected, let's [deploy and interact with the Pod Racing contract](./03-contract-interaction.md).
