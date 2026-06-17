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

```typescript title="pxe-instance" showLineNumbers 
/**
 * PXE + node — lazily initialized as a pair, with dedup on the inflight promise.
 */
let pxeState: { pxe: PXE; node: AztecNode } | null = null;
let pxeInitializing: Promise<{ pxe: PXE; node: AztecNode }> | null = null;

async function ensurePXE(nodeUrl: string = NODE_URL): Promise<{ pxe: PXE; node: AztecNode }> {
  if (pxeState) return pxeState;
  if (pxeInitializing) return pxeInitializing;

  log.debug('[offscreen] Initializing PXE with node:', nodeUrl);
  pxeInitializing = (async () => {
    try {
      const node = createAztecNodeClient(nodeUrl);
      const config = getPXEConfig();
      config.rollupAddress = (await node.getL1ContractAddresses()).rollupAddress;
      const isLocal = nodeUrl.includes('localhost') || nodeUrl.includes('127.0.0.1');
      config.proverEnabled = !isLocal;

      const pxe = await createPXE(node, config, {});
      log.debug('[offscreen] PXE initialized, connected to node at:', nodeUrl);

      pxeState = { pxe, node };
      return pxeState;
    } finally {
      pxeInitializing = null; // Always clear so a retry can re-attempt
    }
  })();

  return pxeInitializing;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L123-L155" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L123-L155</a></sub></sup>


Key configuration:
- `l1Contracts` - Required for the PXE to verify L1 state
- `proverEnabled` - Enables client-side proof generation

SponsoredFPC is registered lazily when the wallet's `completeFeeOptions()` is first called, rather than at PXE initialization time.

## The Wallet Implementation

The extension has two wallet-related classes with distinct responsibilities:

1. **`ExtensionWalletManager`** (in `wallet-impl.ts`) - A static utility class that handles secret generation, address computation, and encrypted storage. It does **not** extend `BaseWallet`.

2. **`OffscreenWallet`** (in `offscreen.ts`) - A `BaseWallet` subclass defined inline inside the `getWallet()` function that handles actual wallet operations.

The `OffscreenWallet` extends `BaseWallet` from the wallet SDK:

```typescript title="wallet-instance" showLineNumbers 
/** Single wallet class used for all operations. (#18, #20) */

import type { BaseWallet } from '@aztec/wallet-sdk/base-wallet';

/**
 * The wallet instance holds a BaseWallet subclass with an additional
 * registerAccount method for tracking which accounts we can sign for.
 * BaseWallet is dynamically imported at runtime; using `import type` gives
 * us the type without a runtime dependency. (#20)
 */
type OffscreenWalletType = BaseWallet & { registerAccount(address: string, account: Account): void };

let walletInstance: OffscreenWalletType | null = null;

/**
 * Creates a SponsoredFPC contract instance from its artifact and well-known salt.
 * Shared between OffscreenWallet.ensureSponsoredFPC() and handleDeployAccount().
 */
async function getSponsoredFPCInstance() {
  const { Fr, SponsoredFPCContract, SPONSORED_FPC_SALT, getContractInstanceFromInstantiationParams } = await getAztecDeploy();
  return getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(SPONSORED_FPC_SALT) },
  );
}

async function getWallet() {
  if (walletInstance) return walletInstance;

  const { BaseWallet, AztecAddress, SignerlessAccount } = await getAztecWallet();
  const { pxe, node } = await ensurePXE();

  // AccountFeePaymentMethodOptions.EXTERNAL = 0 — fee is paid by an external FPC
  const EXTERNAL_FEE_PAYMENT = 0;

  class OffscreenWallet extends BaseWallet {
    protected minFeePadding = 1.0; // 100% padding for fee estimation variance
    private accounts: Map<string, Account> = new Map();
    private sponsoredFPCAddress: any | null = null;

    constructor(pxeInstance: PXE, aztecNode: AztecNode) {
      super(pxeInstance, aztecNode);
    }

    registerAccount(address: string, account: Account) {
      this.accounts.set(address, account);
    }

    protected async getAccountFromAddress(address: any): Promise<Account> {
      if (address.equals(AztecAddress.ZERO)) {
        return new SignerlessAccount();
      }
      const key = address.toString();
      const account = this.accounts.get(key);
      if (!account) {
        throw new Error(`Account not found for address: ${key}`);
      }
      return account;
    }

    async getAccounts() {
      return Array.from(this.accounts.entries()).map(([, acc]) => ({
        alias: '',
        item: acc.getAddress(),
      }));
    }

    /** Lazily registers the SponsoredFPC contract and caches its address. */
    private async ensureSponsoredFPC() {
      if (this.sponsoredFPCAddress) return this.sponsoredFPCAddress;
      const { SponsoredFPCContract } = await getAztecDeploy();
      const sponsoredFPCInstance = await getSponsoredFPCInstance();
      await this.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
      this.sponsoredFPCAddress = sponsoredFPCInstance.address;
      return this.sponsoredFPCAddress;
    }

    /**
     * Always uses SponsoredFPC for fee payment, mirroring the deployment flow.
     * The tutorial wallet doesn't hold fee juice, so every tx is sponsor-paid.
     *
     * If the execution payload already has a feePayer (e.g. DeployAccountMethod
     * embeds SponsoredFPC in its own payload), we skip injecting a wallet-level
     * payment method to avoid calling sponsor_unconditionally() twice, which
     * would trigger "Cannot enter the revertible phase twice".
     */
    protected async completeFeeOptions(config: any) {
      const base = await super.completeFeeOptions(config);
      // If the payload already includes a fee payer, don't inject another one
      if (config.feePayer) {
        return {
          ...base,
          accountFeePaymentMethodOptions: EXTERNAL_FEE_PAYMENT,
        };
      }
      const address = await this.ensureSponsoredFPC();
      const { SponsoredFeePaymentMethod } = await getAztecDeploy();
      return {
        ...base,
        walletFeePaymentMethod: new SponsoredFeePaymentMethod(address),
        accountFeePaymentMethodOptions: config.from ? EXTERNAL_FEE_PAYMENT : base.accountFeePaymentMethodOptions,
      };
    }

    /**
     * Overrides sendTx to auto-extract auth witnesses from offchain effects.
     *
     * dApps like gregoswap don't explicitly create auth witnesses. Instead, they
     * expect the wallet to handle it: simulate with a stub account (which passes
     * all auth checks), extract the authorization requests emitted by
     * `#[authorize_once]` in Noir contracts, sign them, and include them in the
     * real transaction.
     */
    async sendTx(executionPayload: any, opts: any): Promise<any> {
      if (executionPayload.authWitnesses.length === 0 && opts.from && !opts.from.equals(AztecAddress.ZERO)) {
        try {
          await this.extractAndInjectAuthWitnesses(executionPayload, opts.from, opts.fee?.gasSettings);
        } catch (err: any) {
          log.error('[offscreen] Auth witness extraction failed, proceeding without:', err.message, err.stack);
        }
      }
      return super.sendTx(executionPayload, opts);
    }

    /**
     * Simulates the tx with a stub account to collect offchain effects,
     * parses CallAuthorizationRequest objects, and creates real auth witnesses.
     */
    private async extractAndInjectAuthWitnesses(executionPayload: any, from: any, feeGasSettings?: any) {
      const { Fr, getContractInstanceFromInstantiationParams } = await getAztecCore();

      // Step 1: Create a stub account that passes all auth checks unconditionally
      log.info('[offscreen] Step 1: Loading stub account module...');
      const realAccount = await this.getAccountFromAddress(from);
      const originalAddress = realAccount.getCompleteAddress();
      log.info('[offscreen] Got complete address:', originalAddress.address.toString());

      const { createStubAccount, getStubAccountContractArtifact } = await import('@aztec/accounts/stub/lazy');
      log.info('[offscreen] Loaded @aztec/accounts/stub/lazy');

      const stubArtifact = await getStubAccountContractArtifact();
      log.info('[offscreen] Loaded stub artifact:', stubArtifact.name);

      const stubAccount = createStubAccount(originalAddress);
      const stubInstance = await getContractInstanceFromInstantiationParams(stubArtifact, { salt: Fr.random() });
      log.info('[offscreen] Created stub account and instance');

      // Step 2: Simulate with the stub account swapped in via PXE overrides
      log.info('[offscreen] Step 2: Simulating tx with stub account...');
      const feeOptions = await this.completeFeeOptions({
        from,
        feePayer: executionPayload.feePayer,
        gasSettings: feeGasSettings,
      });
      const chainInfo = await this.getChainInfo();
      const txRequest = await stubAccount.createTxExecutionRequest(
        executionPayload,
        feeOptions.gasSettings,
        chainInfo,
        { txNonce: Fr.random(), cancellable: false, feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions },
      );
      log.info('[offscreen] Created tx execution request, simulating...');

      const simResult = await this.pxe.simulateTx(txRequest, {
        simulatePublic: true,
        skipTxValidation: true,
        skipFeeEnforcement: true,
        overrides: { contracts: { [from.toString()]: { instance: stubInstance, artifact: stubArtifact } } },
        scopes: [from],
      });
      log.info('[offscreen] Simulation succeeded');

      // Step 3: Extract auth witness requests from offchain effects
      log.info('[offscreen] Step 3: Extracting offchain effects...');
      const { collectOffchainEffects } = await import('@aztec/stdlib/tx');
      const { CallAuthorizationRequest } = await import('@aztec/aztec.js/authorization');

      if (!simResult.privateExecutionResult) {
        log.warn('[offscreen] No privateExecutionResult in simulation result');
        return;
      }

      const effects = collectOffchainEffects(simResult.privateExecutionResult);
      log.info(`[offscreen] Found ${effects.length} offchain effect(s)`);

      // Pre-filter by CallAuthorizationRequest selector (matching e2e test pattern)
      const callAuthSelector = await CallAuthorizationRequest.getSelector();
      const authEffects = effects.filter((e: any) =>
        e.data.length > 0 && e.data[0].equals(callAuthSelector.toField()),
      );
      log.info(`[offscreen] ${authEffects.length} are CallAuthorizationRequest(s)`);

      // Step 4: Create auth witnesses from parsed authorization requests
      let count = 0;
      for (const effect of authEffects) {
        const authRequest = await CallAuthorizationRequest.fromFields(effect.data);
        log.info(`[offscreen] Auth request: consumer=${effect.contractAddress.toString()}, innerHash=${authRequest.innerHash.toString()}`);
        const wit = await this.createAuthWit(from, {
          consumer: effect.contractAddress,
          innerHash: authRequest.innerHash,
        });
        executionPayload.authWitnesses.push(wit);
        count++;
        log.info(`[offscreen] Created auth witness #${count}: messageHash=${wit.requestHash.toString()}`);
      }

      log.info(`[offscreen] Auth witness extraction complete: ${count} witness(es) from ${effects.length} effect(s)`);
    }
  }

  walletInstance = new OffscreenWallet(pxe, node);
  return walletInstance;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L157-L373" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L157-L373</a></sub></sup>


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

```typescript title="complete-fee-options" showLineNumbers 
/**
 * Always uses SponsoredFPC for fee payment, mirroring the deployment flow.
 * The tutorial wallet doesn't hold fee juice, so every tx is sponsor-paid.
 *
 * If the execution payload already has a feePayer (e.g. DeployAccountMethod
 * embeds SponsoredFPC in its own payload), we skip injecting a wallet-level
 * payment method to avoid calling sponsor_unconditionally() twice, which
 * would trigger "Cannot enter the revertible phase twice".
 */
protected async completeFeeOptions(config: any) {
  const base = await super.completeFeeOptions(config);
  // If the payload already includes a fee payer, don't inject another one
  if (config.feePayer) {
    return {
      ...base,
      accountFeePaymentMethodOptions: EXTERNAL_FEE_PAYMENT,
    };
  }
  const address = await this.ensureSponsoredFPC();
  const { SponsoredFeePaymentMethod } = await getAztecDeploy();
  return {
    ...base,
    walletFeePaymentMethod: new SponsoredFeePaymentMethod(address),
    accountFeePaymentMethodOptions: config.from ? EXTERNAL_FEE_PAYMENT : base.accountFeePaymentMethodOptions,
  };
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L235-L262" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L235-L262</a></sub></sup>


This ensures that by default:
1. If the payload already has a `feePayer` (e.g., during account deployment), the wallet respects it
2. Otherwise, the wallet injects `SponsoredFeePaymentMethod` so users don't need fee tokens to transact

The `SponsoredFeePaymentMethod` creates an execution payload that:
- Calls the SponsoredFPC contract's fee payment function
- Gets merged with the user's transaction payload
- Results in SponsoredFPC paying the fee

## Message Handling

The offscreen document receives messages from the background via a persistent port. When the background connects with `chrome.runtime.connect({ name: 'offscreen' })`, the offscreen stores the port and listens for messages. Each message includes a `messageId` for request/response correlation:

```typescript title="message-handler" showLineNumbers 
/**
 * Handles messages from the background script via a persistent port.
 * The background connects with chrome.runtime.connect({ name: 'offscreen' }).
 * Each message includes a messageId for request/response correlation.
 */
chromeRuntime.runtime.onConnect.addListener((port: chrome.runtime.Port) => {
  if (port.name !== 'offscreen') return;

  log.debug('[offscreen] Background port connected');
  backgroundPort = port;

  port.onMessage.addListener((message: any) => {
    log.debug('[offscreen] Received message:', message.type);

    handleMessage(message)
      .then((result) => {
        log.debug('[offscreen] Sending response for:', message.type);
        port.postMessage({ messageId: message.messageId, success: true, result });
      })
      .catch((error: unknown) => {
        const msg = getErrorMessage(error);
        log.error('[offscreen] Error:', msg, error);
        port.postMessage({ messageId: message.messageId, success: false, error: msg });
      });
  });

  port.onDisconnect.addListener(() => {
    log.debug('[offscreen] Background port disconnected');
    backgroundPort = null;
  });
});

async function handleMessage(message: any): Promise<any> {
  switch (message.type) {
    case MessageTypes.GET_ACCOUNTS:
      return handleGetAccounts();

    case MessageTypes.MARK_DEPLOYED:
      return handleMarkDeployed(message.address);

    case MessageTypes.WALLET_METHOD:
      return handleWalletMethod(message.method, message.args);

    case MessageTypes.SETUP_PASSWORD:
      return handleSetupPassword(message.password);

    case MessageTypes.CREATE_ACCOUNT:
      return handleCreateAccount(message.alias);

    case MessageTypes.DEPLOY_ACCOUNT:
      return handleDeployAccount(message.address);

    case MessageTypes.UNLOCK_WALLET:
      return handleUnlockWallet(message.password);

    case MessageTypes.INIT_PXE:
      return handleInitPXE(message.nodeUrl);

    case MessageTypes.REGISTER_ACCOUNT:
      return handleRegisterAccount(message.address, message.secret, message.salt);

    case MessageTypes.EXPORT_WALLET:
      return handleExportWallet();

    case MessageTypes.IMPORT_WALLET_ACCOUNTS:
      return handleImportWalletAccounts(message.accounts, message.activeAccount);

    // Lock the wallet (clear cached key) — used by auto-lock (#28)
    case MessageTypes.LOCK_WALLET:
      cachedMasterKey = null;
      walletInstance = null;
      return { success: true };

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L375-L453" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L375-L453</a></sub></sup>


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

```typescript title="wallet-method-handler" showLineNumbers 
/**
 * Handles wallet method calls from the ExtensionWallet proxy via the SDK protocol.
 *
 * Serialization notes:
 * 1. ARGS: Arrive as plain JSON. We use WalletSchema to parse them back into
 *    proper Aztec types (AztecAddress, Fr, ExecutionPayload, etc.).
 * 2. RESULT: Contains class instances that lose prototypes through Chrome messaging.
 *    We serialize with jsonStringify before returning.
 */
async function handleWalletMethod(method: string, args: any[]): Promise<any> {
  log.debug('[offscreen] Handling wallet method:', method);

  const wallet = await getWallet();

  // Dynamic dispatch: the wallet protocol sends method names as strings.
  // Cast to Record for dynamic access since TypeScript can't know the method at compile time.
  const walletObj = wallet as unknown as Record<string, (...args: any[]) => any>;
  if (typeof walletObj[method] !== 'function') {
    throw new Error(`Unknown wallet method: ${method}`);
  }

  const { WalletSchema, jsonStringify, schemaHasMethod } = await getAztecWallet();

  // Parse args through WalletSchema to reconstruct proper Aztec types (Buffer, Fr, etc.)
  // from their JSON representations. The schema's .parameters() returns a zod tuple that
  // requires all positional elements even if some are optional. Pad with undefined so the
  // tuple length matches and the parse succeeds.
  let parsedArgs: any[] = args || [];
  if (schemaHasMethod(WalletSchema, method)) {
    const schema = WalletSchema[method as keyof typeof WalletSchema];
    const paramSchema = schema.parameters();
    const expectedLength = (paramSchema as any)?._def?.items?.length ?? 0;
    const paddedArgs = [...(args || [])];
    while (paddedArgs.length < expectedLength) {
      paddedArgs.push(undefined);
    }
    try {
      parsedArgs = await paramSchema.parseAsync(paddedArgs);
    } catch (parseErr: any) {
      log.warn('[offscreen] Args parse warning for', method, ':', parseErr.message);
      parsedArgs = args || [];
    }
  }

  // Report initial progress for long-running methods so the popup shows something
  // before the PXE log matchers kick in
  const longRunningMethods = ['sendTx', 'simulateTx', 'profileTx'];
  if (longRunningMethods.includes(method)) {
    reportProgress(`Starting ${method}...`);
  }

  const result = await walletObj[method](...parsedArgs);

  // Serialize to JSON-safe format before returning through Chrome messaging
  const jsonSafe = JSON.parse(jsonStringify(result));
  log.debug('[offscreen] Wallet method completed:', method);
  return jsonSafe;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L464-L523" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L464-L523</a></sub></sup>


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
