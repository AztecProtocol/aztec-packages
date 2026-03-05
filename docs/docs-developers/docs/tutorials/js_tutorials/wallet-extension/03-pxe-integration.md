---
title: "3. PXE Integration"
description: Running the Private eXecution Environment in a browser extension and extending BaseWallet
sidebar_position: 3
---

# PXE Integration

The Private eXecution Environment (PXE) is the core of any Aztec wallet. It handles private state, note management, and proof generation. This section shows how to run a PXE in the extension's offscreen document.

## Why PXE in Extensions?

Every Aztec wallet needs a PXE to:

- **Sync private state** - Download and decrypt notes belonging to the user
- **Generate proofs** - Create zero-knowledge proofs for private functions
- **Manage contracts** - Register and track contract artifacts
- **Compute witnesses** - Provide private inputs for transaction execution

The PXE is stateful and long-running, which is why the extension uses an offscreen document instead of the service worker.

## Initializing PXE

The offscreen document initializes PXE lazily on first use with deduplication to prevent multiple initializations:

#include_code pxe-instance docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

Key configuration:
- `l1Contracts` - Required for the PXE to verify L1 state
- `proverEnabled` - Enables client-side proof generation

SponsoredFPC is registered lazily when the wallet's `completeFeeOptions()` is first called, rather than at PXE initialization time.

## The Wallet Implementation

The extension has two wallet-related classes with distinct responsibilities:

1. **`ExtensionWalletManager`** (in `wallet-impl.ts`) - A static utility class that handles secret generation, address computation, and encrypted storage. It does **not** extend `BaseWallet`.

2. **`OffscreenWallet`** (in `offscreen.ts`) - A `BaseWallet` subclass defined inline inside the `getWallet()` function that handles actual wallet operations.

The `OffscreenWallet` extends `BaseWallet` from the wallet SDK:

#include_code wallet-instance docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

By extending `BaseWallet`, you inherit:
- `sendTx()` - Transaction submission with proof generation
- `simulateTx()` - Transaction simulation
- `createAuthWit()` - Authorization witness creation
- `registerContract()` - Contract registration
- `getChainInfo()` - Network information
- And more...

You implement:
- `getAccountFromAddress()` - Return the Account object for signing
- `getAccounts()` - List available accounts
- `completeFeeOptions()` - Configure fee payment (the SponsoredFPC override)
- `sendTx()` - Override with automatic auth witness extraction

## SponsoredFPC Fee Payment

The key override is `completeFeeOptions()`, which lazily registers the SponsoredFPC contract on first use:

#include_code complete-fee-options docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

This ensures that by default:
1. If the payload already has a `feePayer` (e.g., during account deployment), the wallet respects it
2. Otherwise, the wallet injects `SponsoredFeePaymentMethod` so users don't need fee tokens to transact

The `SponsoredFeePaymentMethod` creates an execution payload that:
- Calls the SponsoredFPC contract's fee payment function
- Gets merged with the user's transaction payload
- Results in SponsoredFPC paying the fee

## Message Handling

The offscreen document receives messages from the background via a persistent port. When the background connects with `chrome.runtime.connect({ name: 'offscreen' })`, the offscreen stores the port and listens for messages. Each message includes a `messageId` for request/response correlation:

#include_code message-handler docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

Each message type maps to a handler:
- `INIT_PXE` - Ensures PXE is ready
- `GET_ACCOUNTS` - Lists stored accounts
- `CREATE_ACCOUNT` - Creates a new account
- `DEPLOY_ACCOUNT` - Deploys an account contract
- `WALLET_METHOD` - Handles dApp wallet calls
- `SETUP_PASSWORD` - Sets master password on first use
- `UNLOCK_WALLET` - Verifies password and registers accounts
- `EXPORT_WALLET` / `IMPORT_WALLET_ACCOUNTS` - Wallet backup and restore

## Wallet Method Dispatch

For wallet methods from dApps, the handler dispatches based on method name. The handler uses `WalletSchema` to parse incoming JSON arguments back into proper Aztec types (`AztecAddress`, `Fr`, `ExecutionPayload`, etc.), and `jsonStringify` to serialize results before returning through Chrome messaging:

#include_code wallet-method-handler docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

This generic dispatch means any method on the `BaseWallet` interface (e.g., `getAccounts`, `sendTx`, `simulateTx`, `createAuthWit`, `getChainInfo`) is automatically available to dApps through the wallet SDK protocol.

## Error Handling

The port message handler wraps each operation in try/catch and posts the result back with the same `messageId` for correlation:

```typescript
port.onMessage.addListener((message) => {
  handleMessage(message)
    .then((result) => {
      port.postMessage({ messageId: message.messageId, success: true, result });
    })
    .catch((error) => {
      port.postMessage({ messageId: message.messageId, success: false, error: error.message });
    });
});
```

Errors are serialized and sent back to the background, which can:
- Show them in the popup
- Return them to the dApp as wallet errors

## PXE State Persistence

The PXE uses IndexedDB for persistence (via `@aztec/kv-store`). This means:
- Synced notes persist across extension restarts
- Registered contracts are remembered
- Account registrations survive restarts

However, the `OffscreenWallet.accounts` Map is in-memory and needs reloading when the user unlocks the wallet. This is handled by `handleUnlockWallet()`, which verifies the password, derives a `CryptoKey`, initializes PXE, and registers all stored accounts. See [Account Management](./04-accounts.md) for details.

## Integration with BaseWallet

The `BaseWallet` base class does the heavy lifting for transactions:

```typescript
// In BaseWallet (inherited)
async sendTx(executionPayload, opts) {
  // 1. Complete fee options (our override uses SponsoredFPC)
  const feeOptions = await this.completeFeeOptions(...);

  // 2. Create execution request
  const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(...);

  // 3. Generate proof (WASM, can take time)
  const provenTx = await this.pxe.proveTx(txRequest);

  // 4. Submit to node
  const tx = await provenTx.toTx();
  await this.aztecNode.sendTx(tx);

  // 5. Optionally wait for confirmation
  if (opts.wait !== NO_WAIT) {
    return await waitForTx(this.aztecNode, txHash, waitOpts);
  }
  return txHash;
}
```

Our `OffscreenWallet` also overrides `sendTx()` to automatically extract authorization witnesses from offchain effects. This means dApps don't need to explicitly create auth witnesses - the wallet handles it by simulating with a stub account, collecting `CallAuthorizationRequest` objects, and signing them before the real transaction.

## Next Steps

Now that PXE is running, let's implement [Account Management](./04-accounts.md) - creating, storing, and managing user accounts with encrypted keys.
