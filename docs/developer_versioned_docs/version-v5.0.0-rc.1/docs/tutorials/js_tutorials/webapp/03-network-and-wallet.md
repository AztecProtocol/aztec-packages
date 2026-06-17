---
title: "3. Network & Wallet"
sidebar_position: 3
description: "Connect to Aztec using an embedded wallet for local dev or the wallet SDK for browser extensions"
---

# Network & Wallet

This section covers connecting your webapp to the Aztec network and setting up a wallet. You'll walk through three source files (`config.ts`, `embedded-wallet.ts`, `wallet-connection.ts`) plus shared fee utilities and UI components.

## Key concepts

Before looking at code, it helps to understand two pieces of infrastructure that every Aztec app relies on:

**[PXE (Private eXecution Environment)](../../../foundational-topics/pxe/index.md)** is a client-side runtime that runs in the browser as WASM. It stores your private notes, manages your encryption keys, executes private functions, and generates zero-knowledge proofs. Because PXE runs locally, your private data never leaves the browser.

Every Aztec app needs a PXE — either one it creates itself or one provided by a wallet extension.

**Aztec node** is the server-side component that maintains the network's public state and sequences transactions into blocks. Your PXE connects to a node (a local network during development, or a remote node in production) to sync state and submit transactions. The node never sees your private data — it only receives proofs and encrypted outputs.

The relationship is straightforward: PXE handles everything private (notes, keys, proofs), the node handles everything public (state, blocks, sequencing), and they communicate over a standard RPC interface.

## Network configuration

Open `src/config.ts`. This determines which Aztec node to connect to and provides a helper for creating an in-browser PXE:

```typescript title="config" showLineNumbers 
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getPXEConfig } from '@aztec/pxe/config';
import { createPXE } from '@aztec/pxe/client/lazy';


export type NetworkType = 'local' | 'remote';

export function getNodeUrl(network: NetworkType): string {
  if (network === 'local') {
    return process.env.AZTEC_NODE_URL || 'http://localhost:8080';
  }
  // For remote networks, the wallet extension manages the node connection
  return process.env.AZTEC_NODE_URL || 'http://localhost:8080';
}

/**
 * Creates an in-browser PXE instance connected to an Aztec node.
 * PXE (Private eXecution Environment) runs locally and handles
 * private state, note discovery, and transaction creation.
 */
export async function createLocalPXE(nodeUrl: string) {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const config = getPXEConfig();
  config.rollupAddress = (await aztecNode.getL1ContractAddresses()).rollupAddress;
  const isLocal = nodeUrl.includes('localhost') || nodeUrl.includes('127.0.0.1');
  config.proverEnabled = !isLocal;
  const pxe = await createPXE(aztecNode, config, {});
  console.log('PXE connected to node at:', nodeUrl);

  return { pxe, aztecNode };
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/config.ts#L1-L33" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/config.ts#L1-L33</a></sub></sup>


`createLocalPXE` sets up PXE in three steps:

1. `createAztecNodeClient` — opens an RPC connection to the Aztec node so PXE can sync public state and submit transactions.
2. `getPXEConfig` + `getL1ContractAddresses` — fetches protocol configuration from the node, including L1 contract addresses and network parameters that PXE needs to construct valid proofs.
3. `createPXE` — starts a full PXE instance in the browser. From this point on, all private execution happens locally.

## Wallet modes

Aztec supports two wallet modes, and the app implements both:

- **Embedded wallet** — your app creates PXE and manages accounts directly. Best for local development with the local network.
- **Wallet SDK** — your app connects to an external browser extension that owns PXE and accounts. Required for production.

Both modes produce the same `Wallet` interface, so the rest of your app doesn't need to know which one is in use.

## Embedded wallet (local development)

For local development, the app uses a custom `EmbeddedWallet` class that extends the official `EmbeddedWallet` from `@aztec/wallets/embedded`. The official wallet already provides account creation and persistence, transaction sending with gas estimation, automatic authwitness generation, and stub-account simulation. The tutorial subclass adds one thing: **SponsoredFPC fee payment** so users don't need to hold fee tokens.

Open `src/embedded-wallet.ts`:

### Imports

```typescript title="embedded-wallet-imports" showLineNumbers 
import { type NoFrom, NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { AccountFeePaymentMethodOptions } from '@aztec/entrypoints/account';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { type CompleteFeeOptionsConfig, type FeeOptions } from '@aztec/wallet-sdk/base-wallet';
import { EmbeddedWallet as BaseEmbeddedWallet } from '@aztec/wallets/embedded';
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/embedded-wallet.ts#L1-L13" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/embedded-wallet.ts#L1-L13</a></sub></sup>


### Initialization

```typescript title="initialize" showLineNumbers 
/**
 * Creates a new EmbeddedWallet connected to the given Aztec node URL.
 * Sets up an in-browser PXE and registers the SponsoredFPC contract.
 */
static async initialize(nodeUrl: string): Promise<EmbeddedWallet> {
  const isLocal =
    nodeUrl.includes('localhost') || nodeUrl.includes('127.0.0.1');
  const wallet = await EmbeddedWallet.create<EmbeddedWallet>(nodeUrl, {
    ephemeral: true,
    pxeConfig: { proverEnabled: !isLocal },
  });

  // Register SponsoredFPC so we can pay fees
  const fpc = await EmbeddedWallet.#getSponsoredFPCContract();
  await wallet.registerContract(fpc.instance, fpc.artifact);

  return wallet;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/embedded-wallet.ts#L53-L72" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/embedded-wallet.ts#L53-L72</a></sub></sup>


The `initialize` factory calls the inherited `create()` method, which sets up an in-browser PXE and account storage. It then registers the SponsoredFPC contract with PXE so that fee payment works out of the box.

### Connecting a test account

The local network ships with pre-deployed test accounts. These are Schnorr-signature accounts that are already registered and funded, so you can use them immediately without deploying a new account contract. The inherited `createSchnorrAccount` handles account creation, contract registration with PXE, and persistence in the wallet database. You select one by index (0, 1, 2, etc.).

```typescript title="connect-test-account" showLineNumbers 
/**
 * Connects one of the pre-deployed test accounts available on the local network.
 * Uses the inherited createSchnorrAccount which handles account creation,
 * contract registration, and WalletDB persistence.
 */
async connectTestAccount(index: number) {
  const testAccounts = await getInitialTestAccountsData();
  const accountData = testAccounts[index];

  const accountManager = await this.createSchnorrAccount(
    accountData.secret,
    accountData.salt,
    accountData.signingKey,
  );

  this.connectedAccount = accountManager.address;
  return this.connectedAccount;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/embedded-wallet.ts#L89-L108" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/embedded-wallet.ts#L89-L108</a></sub></sup>


### Fee payment

Every Aztec transaction must pay a fee (similar to gas on Ethereum). Rather than requiring users to hold fee tokens during development, the embedded wallet overrides `completeFeeOptions` to inject SponsoredFPC as the default fee payer for every transaction. Callers never need to pass fee options manually.

:::note
SponsoredFPC only works on the local network. Production Aztec networks deployed to Ethereum mainnet require an alternative fee payment strategy.
:::

```typescript title="fee-options" showLineNumbers 
/**
 * Uses SponsoredFPC for fee payment by default, so users
 * don't need to hold fee tokens.
 */
override async completeFeeOptions(config: CompleteFeeOptionsConfig): Promise<FeeOptions> {
  const base = await super.completeFeeOptions(config);

  if (config.feePayer) {
    return base;
  }

  const fpc = await EmbeddedWallet.#getSponsoredFPCContract();

  return {
    ...base,
    walletFeePaymentMethod: new SponsoredFeePaymentMethod(fpc.instance.address),
    accountFeePaymentMethodOptions:
      config.from !== NO_FROM ? AccountFeePaymentMethodOptions.EXTERNAL : base.accountFeePaymentMethodOptions,
  };
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/embedded-wallet.ts#L30-L51" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/embedded-wallet.ts#L30-L51</a></sub></sup>


### Full class

The complete `EmbeddedWallet` — most of the heavy lifting (simulation, proving, gas estimation) is inherited from the official wallet:

```typescript title="embedded-wallet-class" showLineNumbers 
/**
 * A tutorial wallet for local development.
 * Extends the official EmbeddedWallet to add SponsoredFPC fee payment
 * so users don't need to hold fee tokens.
 *
 * Inherits from the SDK's EmbeddedWallet which provides:
 * - Account creation and persistence via WalletDB
 * - Pre-simulation with gas estimation in sendTx
 * - Automatic authwitness generation
 * - Stub-account simulation (no expensive kernel proving)
 */
export class EmbeddedWallet extends BaseEmbeddedWallet {
  connectedAccount: AztecAddress | null = null;

  /**
   * Uses SponsoredFPC for fee payment by default, so users
   * don't need to hold fee tokens.
   */
  override async completeFeeOptions(config: CompleteFeeOptionsConfig): Promise<FeeOptions> {
    const base = await super.completeFeeOptions(config);

    if (config.feePayer) {
      return base;
    }

    const fpc = await EmbeddedWallet.#getSponsoredFPCContract();

    return {
      ...base,
      walletFeePaymentMethod: new SponsoredFeePaymentMethod(fpc.instance.address),
      accountFeePaymentMethodOptions:
        config.from !== NO_FROM ? AccountFeePaymentMethodOptions.EXTERNAL : base.accountFeePaymentMethodOptions,
    };
  }

  /**
   * Creates a new EmbeddedWallet connected to the given Aztec node URL.
   * Sets up an in-browser PXE and registers the SponsoredFPC contract.
   */
  static async initialize(nodeUrl: string): Promise<EmbeddedWallet> {
    const isLocal =
      nodeUrl.includes('localhost') || nodeUrl.includes('127.0.0.1');
    const wallet = await EmbeddedWallet.create<EmbeddedWallet>(nodeUrl, {
      ephemeral: true,
      pxeConfig: { proverEnabled: !isLocal },
    });

    // Register SponsoredFPC so we can pay fees
    const fpc = await EmbeddedWallet.#getSponsoredFPCContract();
    await wallet.registerContract(fpc.instance, fpc.artifact);

    return wallet;
  }

  static async #getSponsoredFPCContract() {
    const { SponsoredFPCContractArtifact } = await import(
      '@aztec/noir-contracts.js/SponsoredFPC'
    );
    const instance = await getContractInstanceFromInstantiationParams(
      SponsoredFPCContractArtifact,
      { salt: new Fr(SPONSORED_FPC_SALT) },
    );
    return { instance, artifact: SponsoredFPCContractArtifact };
  }

  getConnectedAccount() {
    return this.connectedAccount;
  }

  /**
   * Connects one of the pre-deployed test accounts available on the local network.
   * Uses the inherited createSchnorrAccount which handles account creation,
   * contract registration, and WalletDB persistence.
   */
  async connectTestAccount(index: number) {
    const testAccounts = await getInitialTestAccountsData();
    const accountData = testAccounts[index];

    const accountManager = await this.createSchnorrAccount(
      accountData.secret,
      accountData.salt,
      accountData.signingKey,
    );

    this.connectedAccount = accountManager.address;
    return this.connectedAccount;
  }

  /**
   * Fetches a contract instance from the Aztec node (onchain) and registers it
   * with this wallet's PXE. Required before calling private functions on contracts
   * deployed by another wallet/PXE.
   */
  async registerContractFromNode(
    address: AztecAddress,
    artifact: ContractArtifact,
  ) {
    const instance = await this.aztecNode.getContract(address);
    if (!instance) {
      throw new Error(`Contract not found onchain at ${address}`);
    }
    await this.registerContract(instance, artifact);
  }
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/embedded-wallet.ts#L15-L125" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/embedded-wallet.ts#L15-L125</a></sub></sup>


## Wallet SDK (browser extension)

Users may connect via a browser extension wallet (like MetaMask on Ethereum). The wallet extension owns the PXE, manages keys, and signs transactions. Your app communicates with it through the **wallet SDK**, which handles discovery, secure channel setup, and verification.

### Testing with the tutorial wallet extension

The tutorial includes a fully functional wallet extension in `test-extension/`. Unlike a mock extension, this wallet can:

- Create and store encrypted accounts
- Deploy account contracts using SponsoredFPC (no fee tokens needed)
- Sign and submit real transactions
- Show approval popups for connections and transactions

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

3. Set up the wallet:
   - Click the extension icon
   - Create a master password on the setup screen
   - Create your first account (enter an alias)
   - Click "Deploy" to deploy the account contract

4. After making changes to the extension source, rebuild and click the refresh icon in `chrome://extensions/`

:::tip Learn How It Works
Want to build your own wallet extension? The [Wallet Extension Tutorial](../wallet-extension/index.md) explains the architecture and implementation in detail, covering service workers, offscreen documents, encrypted storage, and approval flows.
:::

Open `src/wallet-connection.ts`:

### Step 1: Discover available wallets

Your app needs to find which wallet extensions the user has installed. The SDK does this through a `window.postMessage`-based discovery protocol: your app broadcasts a discovery request, and any installed wallet extension responds with its provider info (name, icon, supported chain).

The `discoverWallets` function starts this process and calls your `onUpdate` callback each time a new wallet extension responds. You use the resulting list to show users a "pick your wallet" UI.

```typescript title="discover-wallets" showLineNumbers 
/**
 * Starts discovering available wallet extensions.
 * Wallet extensions broadcast their availability via window.postMessage.
 * Returns a cancel function and calls onUpdate with each discovered wallet.
 */
export function discoverWallets(
  chainId: number,
  appId: string,
  onUpdate: (providers: WalletProvider[]) => void
): { cancel: () => void; done: Promise<void> } {
  const manager = WalletManager.configure({
    extensions: { enabled: true },
  });

  const providers: WalletProvider[] = [];

  const discovery = manager.getAvailableWallets({
    chainInfo: {
      chainId: new Fr(chainId),
      version: new Fr(1),
    },
    appId,
    onWalletDiscovered: (provider) => {
      // Deduplicate by wallet ID (StrictMode or remounts can cause duplicate discoveries)
      if (providers.some(p => p.id === provider.id)) {
        return;
      }
      providers.push(provider);
      onUpdate([...providers]);
    },
  });

  return {
    cancel: () => discovery.cancel(),
    done: discovery.done,
  };
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/wallet-connection.ts#L26-L64" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/wallet-connection.ts#L26-L64</a></sub></sup>


### Step 2: Connect and verify

Once the user picks a wallet, you need to establish a secure communication channel. This is important because `window.postMessage` is visible to every script on the page — without encryption, a malicious script could intercept private data flowing between your app and the wallet.

The connection uses an **ECDH key exchange**: your app and the wallet extension each generate an ephemeral key pair and derive a shared secret. All subsequent messages are encrypted with this shared secret.

To guard against man-in-the-middle attacks (where a malicious script intercepts the key exchange and substitutes its own keys), the SDK produces a verification hash that gets converted to a short **emoji string**. Your app displays these emojis, and the user checks that their wallet extension shows the same emojis. If they match, the channel is secure. If they don't, the connection should be rejected.

After the user confirms the emojis match, calling `confirm()` completes the handshake and returns a `Wallet` instance connected to the extension.

```typescript title="connect-wallet" showLineNumbers 
/**
 * Connects to a discovered wallet provider.
 * This establishes a secure encrypted channel using ECDH key exchange.
 * The returned emojis should be shown to the user for verification.
 */
export async function connectToProvider(
  provider: WalletProvider,
  appId: string
): Promise<{
  emojis: string;
  confirm: () => Promise<Wallet>;
  cancel: () => void;
}> {
  console.log('[wallet-connection] Calling establishSecureChannel for provider:', provider.name);
  const pending = await provider.establishSecureChannel(appId);
  console.log('[wallet-connection] Secure channel established, verificationHash:', pending.verificationHash);
  const emojis = hashToEmoji(pending.verificationHash);
  console.log('[wallet-connection] Emojis:', emojis);

  return {
    emojis,
    confirm: () => pending.confirm(),
    cancel: () => pending.cancel(),
  };
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/wallet-connection.ts#L66-L92" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/wallet-connection.ts#L66-L92</a></sub></sup>


## Fee payment helpers

Both wallet modes need access to the SponsoredFPC contract. **SponsoredFPC** (Fee Payment Contract) is a special contract deployed at a well-known deterministic address that agrees to pay transaction fees on behalf of any caller. It's available on the local network, making it useful for onboarding users who don't yet have fee tokens.

Open `src/fees.ts`:

```typescript title="get-sponsored-fpc" showLineNumbers 
/**
 * Returns the SponsoredFPC contract details.
 * The SponsoredFPC (Fee Payment Contract) pays transaction fees on behalf of users.
 * This is deployed at a well-known address derived from a fixed salt.
 */
export async function getSponsoredFPCContract() {
  const { SponsoredFPCContractArtifact } = await import(
    '@aztec/noir-contracts.js/SponsoredFPC'
  );
  const instance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContractArtifact,
    { salt: new Fr(SPONSORED_FPC_SALT) }
  );
  return { instance, artifact: SponsoredFPCContractArtifact };
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/fees.ts#L8-L24" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/fees.ts#L8-L24</a></sub></sup>


PXE needs the SponsoredFPC artifact registered so it can include fee payment logic when constructing transaction proofs. Without this registration, PXE wouldn't know how to interact with the fee contract:

```typescript title="register-fpc" showLineNumbers 
/**
 * Registers the SponsoredFPC contract with PXE so it can be used for fee payment.
 * This must be called before sending any transactions.
 */
export async function registerSponsoredFPC(pxe: PXE) {
  const contract = await getSponsoredFPCContract();
  await pxe.registerContract(contract);
  return contract.instance.address;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/fees.ts#L26-L36" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/fees.ts#L26-L36</a></sub></sup>


## Components

With the wallet logic in place, three UI components wire it together.

### Network picker (`src/components/NetworkPicker.tsx`)

Lets the user choose between "Local" (embedded wallet) and "Browser Wallet" (wallet extension). Calls `onNetworkChange` with the selected `NetworkType`, which determines which wallet mode the app uses.

```typescript title="network-picker" showLineNumbers 
import React from 'react';
import type { NetworkType } from '../config';

interface NetworkPickerProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
  disabled?: boolean;
}

/**
 * Toggle between local network (uses EmbeddedWallet) and remote (uses wallet extension).
 */
export function NetworkPicker({ network, onNetworkChange, disabled }: NetworkPickerProps) {
  return (
    <div className="network-picker">
      <label>Network:</label>
      <select
        value={network}
        onChange={(e) => onNetworkChange(e.target.value as NetworkType)}
        disabled={disabled}
      >
        <option value="local">Local (localhost:8080)</option>
        <option value="remote">Browser Wallet</option>
      </select>
    </div>
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/components/NetworkPicker.tsx#L1-L29" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/components/NetworkPicker.tsx#L1-L29</a></sub></sup>


### Wallet connect (`src/components/WalletConnect.tsx`)

Handles both wallet modes in a single component. For local networks it shows the embedded wallet flow (pick a test account, connect). For the browser wallet it runs the SDK discovery and verification flow. Once connected, it calls `onWalletConnected` with the `Wallet` instance.

Open `src/components/WalletConnect.tsx`:

```typescript title="wallet-connect-imports" showLineNumbers 
import React, { useState, useEffect } from 'react';
import type { Wallet, GrantedAccountsCapability } from '@aztec/aztec.js/wallet';
import type { WalletProvider } from '@aztec/wallet-sdk/manager';
import type { NetworkType } from '../config';
import { EmbeddedWallet } from '../embedded-wallet';
import { discoverWallets, connectToProvider, getAppCapabilities } from '../wallet-connection';
import { getNodeUrl } from '../config';
import { useTransactionLog } from './TransactionLog';

interface WalletConnectProps {
  network: NetworkType;
  onWalletConnected: (wallet: Wallet | EmbeddedWallet) => void;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/components/WalletConnect.tsx#L1-L15" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/components/WalletConnect.tsx#L1-L15</a></sub></sup>


```typescript title="wallet-connect-component" showLineNumbers 
export function WalletConnect({ network, onWalletConnected }: WalletConnectProps) {
  const [status, setStatus] = useState<string>('');
  const [providers, setProviders] = useState<WalletProvider[]>([]);
  const [verificationEmojis, setVerificationEmojis] = useState<string | null>(null);
  const [testAccountIndex, setTestAccountIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [discoveryDone, setDiscoveryDone] = useState(false);
  const { addLog } = useTransactionLog();

  /** Connect using the embedded wallet with a pre-deployed test account */
  async function connectLocal() {
    setLoading(true);
    setStatus('Initializing PXE (this may take a moment)...');
    addLog('Initializing local PXE client...', 'pending');
    try {
      const nodeUrl = getNodeUrl('local');
      addLog(`Connecting to node at ${nodeUrl}`, 'info');
      const wallet = await EmbeddedWallet.initialize(nodeUrl);
      addLog('PXE initialized successfully', 'success');

      setStatus('Connecting test account...');
      addLog(`Connecting test account #${testAccountIndex + 1}...`, 'pending');
      await wallet.connectTestAccount(testAccountIndex);
      addLog(`Test account #${testAccountIndex + 1} connected`, 'success');

      setStatus('Connected!');
      onWalletConnected(wallet);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      addLog(`Connection error: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  /** Discover and connect to a browser extension wallet */
  useEffect(() => {
    if (network !== 'remote') return;

    setStatus('Discovering wallet extensions...');
    setDiscoveryDone(false);
    const { cancel, done } = discoverWallets(31337, 'pod-racing', (found) => {
      setProviders(found);
      setStatus(`Found ${found.length} wallet(s)`);
    });

    let isMounted = true;
    done.then(() => {
      if (isMounted) setDiscoveryDone(true);
    }).catch((err) => {
      if (isMounted) setStatus(`Discovery error: ${err.message}`);
    });

    return () => {
      isMounted = false;
      cancel();
    };
  }, [network]);

  async function connectExtension(provider: WalletProvider) {
    setLoading(true);
    setStatus('Establishing secure channel...');
    try {
      const { emojis, confirm } = await connectToProvider(
        provider,
        'pod-racing'
      );

      // Show emojis for reference — the wallet extension is the authority
      // that verifies the emojis match. confirm() is a local operation
      // that creates the ExtensionWallet proxy (no message sent to extension).
      setVerificationEmojis(emojis);
      setStatus('Verify these emojis match in the wallet extension, then approve there.');

      const wallet = await confirm();

      // Request capabilities — the dApp declares all permissions it needs upfront.
      // The extension shows an approval dialog; this call blocks until the user approves.
      setStatus('Requesting permissions from wallet extension...');
      const manifest = getAppCapabilities();

      const capabilities = await wallet.requestCapabilities(manifest);
      setVerificationEmojis(null);
      console.log('[WalletConnect] Granted capabilities:', capabilities);

      // Check if accounts were granted
      const accountsCap = capabilities.granted.find(
        (c): c is GrantedAccountsCapability => c.type === 'accounts'
      );

      if (!accountsCap?.accounts?.length) {
        setStatus('No accounts granted. Please approve the capabilities request in the wallet extension.');
        setLoading(false);
        return;
      }

      setConnected(true);
      setStatus('Connected!');
      addLog('Connected to extension wallet', 'success');
      onWalletConnected(wallet);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      addLog(`Connection error: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="wallet-connect">
      <h2>Connect Wallet</h2>
      {status && <p className="status">{status}</p>}

      {network === 'local' && (
        <div className="local-connect">
          <label>
            Test Account:
            <select
              value={testAccountIndex}
              onChange={(e) => setTestAccountIndex(Number(e.target.value))}
              disabled={loading}
            >
              {[0, 1, 2].map((i) => (
                <option key={i} value={i}>Account {i + 1}</option>
              ))}
            </select>
          </label>
          <button onClick={connectLocal} disabled={loading}>
            {loading ? 'Connecting...' : 'Connect Test Account'}
          </button>
        </div>
      )}

      {network === 'remote' && !verificationEmojis && !connected && (
        <div className="extension-list">
          {providers.length === 0 && (
            discoveryDone
              ? <p>No wallet extensions found. Install an Aztec wallet extension.</p>
              : <p>Looking for wallet extensions...</p>
          )}
          {providers.map((provider, i) => (
            <button
              key={i}
              onClick={() => connectExtension(provider)}
              disabled={loading}
              className="provider-button"
            >
              {provider.icon && (
                <img src={provider.icon} alt="" className="provider-icon" />
              )}
              <span>
                Connect to {provider.name}
                {provider.metadata?.version != null && (
                  <small style={{ opacity: 0.7, marginLeft: '4px' }}>
                    v{String(provider.metadata.version)}
                  </small>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {verificationEmojis && (
        <div className="emoji-verification">
          <h3>Verify Connection</h3>
          <p>Check that these emojis match what your wallet extension shows, then approve there:</p>
          <div className="emoji-grid">{verificationEmojis}</div>
        </div>
      )}

    </div>
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/components/WalletConnect.tsx#L17-L198" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/components/WalletConnect.tsx#L17-L198</a></sub></sup>


### Account info (`src/components/AccountInfo.tsx`)

Displays the connected account's address. Takes the wallet as a prop.

```typescript title="account-info" showLineNumbers 
import React from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';

interface AccountInfoProps {
  address: AztecAddress;
}

/**
 * Displays the connected account address (truncated).
 */
export function AccountInfo({ address }: AccountInfoProps) {
  const addr = address.toString();
  const display = `${addr.slice(0, 10)}...${addr.slice(-6)}`;

  return (
    <div className="account-info">
      <span className="account-label">Connected:</span>
      <span className="account-address" title={addr}>{display}</span>
    </div>
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/components/AccountInfo.tsx#L1-L23" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/components/AccountInfo.tsx#L1-L23</a></sub></sup>


## Next steps

With a wallet connected, you can now [deploy and interact with the Pod Racing contract from the webapp](./04-contract-interaction.md).
