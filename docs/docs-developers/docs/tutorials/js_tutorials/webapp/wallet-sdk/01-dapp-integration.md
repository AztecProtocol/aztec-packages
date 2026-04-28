---
title: "1. dApp Integration"
sidebar_position: 1
description: "Connect your dApp to Aztec wallet extensions — discovery, secure channels, capabilities, and wallet usage"
---

# dApp Integration

This page covers how a dApp discovers wallet extensions, establishes an encrypted channel, requests permissions, and uses the wallet. The patterns here come from the [Pod Racing tutorial](../03-network-and-wallet.md) and [GregoSwap](https://github.com/AztecProtocol/gregoswap), a reference Aztec DEX.

## Installation

Your dApp needs two packages:

```bash
npm install @aztec/wallet-sdk @aztec/aztec.js
```

The key imports:

```typescript
import { WalletManager, type WalletProvider, type PendingConnection } from '@aztec/wallet-sdk/manager';
import { hashToEmoji } from '@aztec/wallet-sdk/crypto';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet, AppCapabilities, GrantedAccountsCapability } from '@aztec/aztec.js/wallet';
```

## Step 1: Discover Wallets

Wallet discovery broadcasts a request via `window.postMessage`. Any installed Aztec wallet extension that the user has approved responds with its info.

#include_code discover-wallets /docs/examples/webapp-tutorial/src/wallet-connection.ts typescript

`WalletManager.configure()` accepts options to filter extensions:

```typescript
const manager = WalletManager.configure({
  extensions: {
    enabled: true,
    allowList: ['my-trusted-wallet-id'],  // Optional: only allow specific wallets
    blockList: ['unwanted-wallet-id'],    // Optional: block specific wallets
  },
});
```

`getAvailableWallets()` returns a `DiscoverySession` with:
- `wallets` — an `AsyncIterable<WalletProvider>` that yields providers as they're discovered
- `cancel()` — stops discovery
- `done` — a `Promise` that resolves when the discovery timeout expires

The `onWalletDiscovered` callback fires each time a wallet extension responds. Each `WalletProvider` includes:
- `id` — unique wallet identifier
- `name` — display name (e.g., "Aztec Tutorial Wallet")
- `icon` — optional data URI or URL for the wallet icon
- `metadata` — optional version info

:::note
Discovery requires user action in the wallet extension — the wallet won't reveal itself without the user clicking "Connect" in their extension popup. This is a privacy feature: websites can't silently detect which wallets you have installed.
:::

## Step 2: Establish a Secure Channel

Once the user picks a wallet, establish an encrypted channel using ECDH key exchange:

#include_code connect-wallet /docs/examples/webapp-tutorial/src/wallet-connection.ts typescript

`establishSecureChannel()` performs the ECDH P-256 key exchange and returns a `PendingConnection` with:
- `verificationHash` — hex string that both sides compute independently
- `confirm()` — creates the encrypted `Wallet` proxy (call after user verifies emojis)
- `cancel()` — aborts the connection

## Step 3: Emoji Verification

The verification hash is converted to a 9-emoji grid using `hashToEmoji()`. Both the dApp and wallet extension compute the same emojis independently. The user visually confirms they match, defending against man-in-the-middle attacks.

```typescript
const emojis = hashToEmoji(pending.verificationHash);
// Display emojis to the user
```

Show the emojis prominently in your UI:

```tsx
{verificationEmojis && (
  <div className="emoji-verification">
    <h3>Verify Connection</h3>
    <p>Check that these emojis match what your wallet extension shows:</p>
    <div className="emoji-grid">{verificationEmojis}</div>
  </div>
)}
```

After the user confirms the emojis match in the wallet extension, call `confirm()` to create the wallet instance:

```typescript
const wallet = await confirm();
```

:::tip Trusted Origins
On subsequent visits, the wallet extension can auto-approve discovery and skip emoji verification for trusted origins. The user only goes through the full flow once per origin.
:::

## Step 4: Request Capabilities

After connecting, your dApp should declare the permissions it needs using `requestCapabilities()`. The wallet extension shows the user an approval dialog.

The `AppCapabilities` manifest describes your dApp's identity and the permissions it requires. Each capability type maps to a set of wallet operations — for example, `accounts` lets you read account addresses, `transaction` lets you send transactions, and `simulation` lets you simulate without sending. The wallet may grant all, some, or none of the requested capabilities.

#include_code app-capabilities /docs/examples/webapp-tutorial/src/wallet-connection.ts typescript

### Capability Types

| Type | What it grants | Key properties |
|------|---------------|----------------|
| `accounts` | Read accounts, create auth witnesses | `canGet`, `canCreateAuthWit` |
| `contracts` | Register contracts, query metadata | `contracts: '*' \| AztecAddress[]`, `canRegister`, `canGetMetadata` |
| `contractClasses` | Query contract class metadata | `classes: '*' \| Fr[]`, `canGetMetadata` |
| `simulation` | Simulate transactions and utilities | `transactions.scope`, `utilities.scope` |
| `transaction` | Send transactions | `scope: '*' \| ContractFunctionPattern[]` |
| `data` | Read address book, private events | `addressBook`, `privateEvents: { contracts }` |

### Checking Granted Capabilities

The wallet may deny or reduce capabilities. Check what was actually granted:

```typescript
const capabilities = await wallet.requestCapabilities(manifest);

// Check if accounts were granted
const accountsCap = capabilities.granted.find(
  (c): c is GrantedAccountsCapability => c.type === 'accounts'
);

if (!accountsCap?.accounts?.length) {
  throw new Error('No accounts granted by wallet');
}

// The wallet decides which accounts to share
const account = accountsCap.accounts[0];
console.log(`Connected as: ${account.alias} (${account.item})`);
```

The `WalletCapabilities` response includes:
- `granted` — array of capabilities the wallet approved (missing = denied)
- `wallet` — wallet name and version

## Step 5: Use the Wallet

After `confirm()`, you have a standard `Wallet` instance. All method calls are encrypted transparently — you use it like any other wallet:

```typescript
// Get accounts
const accounts = await wallet.getAccounts();

// Register a contract
await wallet.registerContract(contractInstance, contractArtifact);

// Send a transaction
const receipt = await wallet.sendTx(executionPayload, { from: account.item });

// Simulate without sending
const simulation = await wallet.simulateTx(executionPayload, { from: account.item });

// Create an auth witness
const authWit = await wallet.createAuthWit(account.item, messageHashOrIntent);

// Batch multiple calls
const results = await wallet.batch([
  { name: 'simulateTx', args: [payload1, opts1] },
  { name: 'simulateTx', args: [payload2, opts2] },
]);
```

## Disconnect Handling

The wallet can disconnect unexpectedly (extension unloaded, user disconnects from popup). Register a callback to handle this:

```typescript
// Register disconnect handler
const unsubscribe = wallet.onDisconnect(() => {
  console.log('Wallet disconnected');
  // Fall back to embedded wallet or show reconnect UI
});

// Check connection status
if (wallet.isDisconnected()) {
  // Need to reconnect
}

// Graceful disconnect
await wallet.disconnect();
```

GregoSwap uses this pattern to fall back to an embedded wallet on disconnect:

```typescript
function handleUnexpectedDisconnect() {
  // Restore embedded wallet if available
  if (embeddedWallet) {
    setWallet(embeddedWallet);
    setAddress(embeddedAddress);
  } else {
    setWallet(null);
  }
}

const unsubscribe = provider.onDisconnect(handleUnexpectedDisconnect);
```

## Complete Flow

Here's the full connection flow in a React component:

#include_code remote-connect /docs/examples/webapp-tutorial/src/components/WalletConnect.tsx typescript

## State Types

For tracking wallet discovery state in your app:

#include_code wallet-sdk-types /docs/examples/webapp-tutorial/src/wallet-connection.ts typescript

## Next steps

- [Wallet Extension Integration](./02-wallet-integration.md) — Build the other side: handle discovery, manage sessions, and extend `BaseWallet`
- [Contract Interaction](../04-contract-interaction.md) — Deploy and call contracts with the connected wallet
