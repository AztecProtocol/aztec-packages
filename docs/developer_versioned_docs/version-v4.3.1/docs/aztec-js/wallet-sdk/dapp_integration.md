---
title: Connecting a dApp to a wallet
sidebar_position: 1
tags: [wallet, sdk, dapp]
description: Discover wallet extensions, establish an encrypted channel, request capabilities, and use the wallet from a dApp on Aztec.
---

This guide shows how a dApp connects to an Aztec wallet extension using `@aztec/wallet-sdk`. The flow is: discover wallets, establish a secure channel, verify with emojis, request capabilities, then use the wallet.

## Prerequisites

- A wallet extension installed in the browser that implements the Aztec wallet SDK protocol, for example [Azguard](https://azguardwallet.io/).
- An Aztec node URL the wallet can connect to. Run one locally with the [getting started on local network](../../../getting_started_on_local_network.md) guide, or use a public endpoint from [getting started on testnet](../../../getting_started_on_testnet.md).

## Install

```bash
yarn add @aztec/wallet-sdk@4.3.1 @aztec/aztec.js@4.3.1
```

Common imports:

```typescript
import {
  WalletManager,
  type WalletProvider,
  type PendingConnection,
} from '@aztec/wallet-sdk/manager';
import { hashToEmoji } from '@aztec/wallet-sdk/crypto';
import type {
  Wallet,
  AppCapabilities,
  GrantedAccountsCapability,
} from '@aztec/aztec.js/wallet';
```

## Step 1: Discover wallets

`WalletManager` is the dApp-side coordinator from `@aztec/wallet-sdk/manager` for finding wallet extensions and brokering the secure-channel handshake with the one the user picks. Configure it once per page load and reuse it for the rest of the flow.

`WalletManager.configure()` returns a manager configured for one or more provider types. `getAvailableWallets()` broadcasts a discovery request and returns a `DiscoverySession` that streams `WalletProvider` instances as users approve the request inside each extension.

`chainInfo` tells wallets which chain the dApp wants to connect to. Read it from the connected Aztec node so the values track whatever network the user is on:

```typescript
import { Fr } from '@aztec/aztec.js/fields';
import { createAztecNodeClient } from '@aztec/aztec.js/node';

const node = await createAztecNodeClient('http://localhost:8080');
const { l1ChainId, rollupVersion } = await node.getNodeInfo();

const manager = WalletManager.configure({
  extensions: { enabled: true },
});

const providers: WalletProvider[] = [];

const discovery = manager.getAvailableWallets({
  appId: 'my-app',
  chainInfo: {
    chainId: new Fr(l1ChainId),
    version: new Fr(rollupVersion),
  },
  onWalletDiscovered: (provider) => {
    providers.push(provider);
    renderWalletPicker(providers); // your UI hook
  },
});
```

Wallets are streamed via `onWalletDiscovered` as soon as the user approves the request in each extension; do not block on `discovery.done` before showing options. The default discovery timeout is 60 seconds, but you should let the user pick as soon as the first acceptable wallet arrives:

```typescript
async function onUserPicked(provider: WalletProvider) {
  discovery.cancel();
  // proceed to Step 2 with this provider
}
```

`discovery.done` is still useful if you want to wait for the timeout to elapse before declaring "no wallets found." Call `discovery.cancel()` once a wallet is selected or the user gives up.

The `extensions` config also accepts an optional `allowList` and `blockList` of wallet IDs to constrain which wallets you will accept.

Chain matching is wallet policy, not enforced by `WalletManager`. The SDK passes `chainInfo` through the discovery message, but it is up to each wallet to inspect it and decline (for example, by refusing approval in its popup) when the user's selected network does not match. Treat any wallet that responds as a candidate and re-check via `wallet.getChainInfo()` after the connection is established if you need a strong guarantee.

To discover web/iframe wallets alongside extensions, pass a `webWallets` block too. Both kinds of provider are returned in the same `DiscoverySession`:

```typescript
WalletManager.configure({
  extensions: { enabled: true },
  webWallets: { urls: ['https://wallet.example.com'] },
});
```

Each `WalletProvider` has `id`, `name`, `icon`, optional `metadata`, and the methods used in the next steps. For extension wallets, a `WalletProvider` is only emitted after the user explicitly approves the request inside the extension popup, so websites cannot silently enumerate which extension wallets the user has installed. Web/iframe wallets respond to the discovery probe automatically without a popup, so a `WalletProvider` from `webWallets` does not imply user approval; only the per-connection emoji step in Step 3 authenticates the wallet to the user. The session itself resolves when discovery times out or you call `discovery.cancel()`; a wallet that rejects the request is silent on the dApp side.

## Step 2: Establish a secure channel

Once the user picks a provider (the `provider` argument passed to `onUserPicked` above), perform the ECDH key exchange:

```typescript
const pending: PendingConnection = await provider.establishSecureChannel('my-app');

const verificationEmojis = hashToEmoji(pending.verificationHash);
// Display verificationEmojis to the user. They must match the grid the wallet shows.
```

`establishSecureChannel` returns a `PendingConnection` with:

- `verificationHash`: hex string both sides compute independently.
- `confirm()`: finalizes the connection and returns a `Wallet` proxy.
- `cancel()`: aborts the pending connection.

`establishSecureChannel` rejects if key exchange times out (default 2 seconds) or the wallet never responds. Treat any rejection as a hard reset: call `pending.cancel()` if you held onto the value, drop any `verificationHash` you displayed, and let the user retry from Step 1.

## Step 3: Emoji verification

The emoji grid is how the user confirms the dApp and the wallet completed the key exchange directly with each other, and not with an attacker in the middle. Both sides derive the grid deterministically from the shared secret, so matching emojis on the dApp screen and the wallet popup mean no third party intercepted the handshake. A mismatch means the channel is compromised and must be torn down.

Both the dApp and the wallet derive the same 9-emoji grid from the verification hash. Show the emojis prominently and let the user confirm they match before calling `confirm()`:

```typescript
const wallet: Wallet = await pending.confirm();
```

If the user reports they do not match, call `pending.cancel()` and start over.

Some wallets choose to remember origins they have approved before, and may streamline the second connection by skipping the emoji step. That is wallet policy, not part of the protocol; the dApp uses the same flow either way.

## Step 4: Request capabilities

After `confirm()` you have a `Wallet` proxy. The SDK does not enforce any permission check on it; capability negotiation is a wallet-policy convention. To play well with wallets that enforce capabilities, build an `AppCapabilities` manifest describing what your app needs and pass it to `requestCapabilities()` before calling privileged methods:

```typescript
const manifest: AppCapabilities = {
  version: '1.0',
  metadata: {
    name: 'My App',
    version: '0.1.0',
    description: 'Example dApp',
    url: 'https://example.com',
  },
  capabilities: [
    { type: 'accounts', canGet: true, canCreateAuthWit: true },
    { type: 'simulation', transactions: { scope: '*' }, utilities: { scope: '*' } },
    { type: 'transaction', scope: '*' },
  ],
};

const result = await wallet.requestCapabilities(manifest);
```

The wallet returns a `WalletCapabilities` object whose `granted` array lists the capabilities the user approved. Capabilities not in `granted` are implicitly denied.

| Capability `type` | Grants | Key fields |
|---|---|---|
| `accounts` | Reading accounts, creating auth witnesses | `canGet`, `canCreateAuthWit` |
| `contracts` | Registering contracts, querying contract metadata | `contracts: '*' \| AztecAddress[]`, `canRegister`, `canGetMetadata` |
| `contractClasses` | Querying contract class metadata | `classes: '*' \| Fr[]`, `canGetMetadata` |
| `simulation` | Simulating transactions and utility calls | `transactions.scope`, `utilities.scope` |
| `transaction` | Sending state-changing transactions | `scope: '*' \| ContractFunctionPattern[]` |
| `data` | Reading address book and private events | `addressBook`, `privateEvents.contracts` |

The wallet decides which accounts to share. Pull the granted account list from the capability response. This is the recommended way to get the connected accounts at connection time. `wallet.getAccounts()` is for later reads against an already-connected wallet:

```typescript
const accountsCap = result.granted.find(
  (c): c is GrantedAccountsCapability => c.type === 'accounts',
);

if (!accountsCap?.accounts?.length) {
  throw new Error('No accounts granted by wallet');
}

const account = accountsCap.accounts[0];
```

## Step 5: Use the wallet

The `Wallet` instance behaves like any other wallet. Every method call is encrypted in transit, but whether a given call is allowed is up to the wallet, based on what it granted (or did not grant) in step 4:

```typescript
const accounts = await wallet.getAccounts();
await wallet.registerContract(contractInstance, contractArtifact);

const receipt = await wallet.sendTx(executionPayload, { from: account.item });
const simulation = await wallet.simulateTx(executionPayload, { from: account.item });

const authWit = await wallet.createAuthWit(account.item, intent);

const results = await wallet.batch([
  { name: 'simulateTx', args: [payload1, opts1] },
  { name: 'simulateTx', args: [payload2, opts2] },
]);
```

## Disconnect handling

A wallet can disconnect unexpectedly: the extension might be unloaded, or the user may disconnect from the popup. The `WalletProvider` returned by discovery exposes the disconnect API. Keep the `provider` reference around after `confirm()` so you can register callbacks on it:

```typescript
const unsubscribe = provider.onDisconnect(() => {
  // Show a reconnect prompt or fall back to a different wallet.
});

if (provider.isDisconnected()) {
  // Handle the disconnected state.
}

await provider.disconnect();
```

## Reference

- API reference: [`@aztec/wallet-sdk` reference](pathname:///typescript-api/mainnet/wallet-sdk.md), [`@aztec/aztec.js/wallet` reference](pathname:///typescript-api/mainnet/aztec.js.md).
- Capability type definitions: [`yarn-project/aztec.js/src/wallet/capabilities.ts`](https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/yarn-project/aztec.js/src/wallet/capabilities.ts) at v4.3.1.
- `WalletManager` source: [`yarn-project/wallet-sdk/src/manager/wallet_manager.ts`](https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/yarn-project/wallet-sdk/src/manager/wallet_manager.ts) at v4.3.1.
- Reference wallet implementation: [`AztecProtocol/demo-wallet`](https://github.com/AztecProtocol/demo-wallet). End-to-end open-source wallet showing the other side of the discovery, key exchange, and capability flows described above.
