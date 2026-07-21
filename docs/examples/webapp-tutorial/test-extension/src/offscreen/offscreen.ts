/** Offscreen document for the Aztec Tutorial Wallet. */

// CRITICAL: console-intercept MUST be the very first import.
// Pino (used by PXE) captures `console.info` at logger-creation time.
// By overriding it in a separate module imported first, ES module execution
// order guarantees the override is in place before any pino logger is created.
import { onConsoleInfo } from './console-intercept';

import { NODE_URL, MessageTypes, AZTEC_PACKAGES_VERSION, log } from '../config';
import type { WalletExportData } from '../shared-types';
import {
  createAccount,
  getAccounts,
  getAccountSecret,
  markDeployed,
  storeAccount,
  getActiveAccount,
  setActiveAccount,
} from '../wallet/wallet-impl';
import type { PXE } from '@aztec/pxe/client/lazy';
import type { Account } from '@aztec/aztec.js/account';
import type { AztecNode } from '@aztec/aztec.js/node';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getPXEConfig } from '@aztec/pxe/config';
import { createPXE } from '@aztec/pxe/client/lazy';

// ============================================================================
// CRITICAL: Enable SharedArrayBuffer support for Barretenberg WASM
// ============================================================================
//
// Chrome extensions have SharedArrayBuffer available but crossOriginIsolated=false.
// bb.js checks crossOriginIsolated to decide which WASM binary to load and
// whether to create shared WebAssembly.Memory.
//
// This patches the main thread. Worker files are patched at build time by the
// patchWorkersCrossOriginIsolated Vite plugin (see vite.extension.config.ts).
// ============================================================================
if (typeof SharedArrayBuffer !== 'undefined' && !(globalThis as any).crossOriginIsolated) {
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: true,
    writable: false,
    configurable: true,
  });
}

import { getChromeRuntime, getErrorMessage } from '../utils';
import { getAztecCore, getAztecWallet, getAztecDeploy } from '../aztec-imports';
import { instantiateAccount } from '../account-utils';

const chromeRuntime = getChromeRuntime();
log.debug('[offscreen] Offscreen document loaded. Storage proxied through background. Barretenberg enabled via crossOriginIsolated patch.');

/**
 * Port connection from the background script.
 * Set when the background connects via chrome.runtime.connect({ name: 'offscreen' }).
 */
let backgroundPort: chrome.runtime.Port | null = null;

/**
 * Sends a progress update to the background script for display in the popup.
 * Fire-and-forget — uses the persistent port instead of broadcast sendMessage.
 */
function reportProgress(stage: string) {
  log.debug('[offscreen] Progress:', stage);
  backgroundPort?.postMessage({ type: 'task-progress', stage });
}

/**
 * PXE log matchers — match pino browser log messages and relay as progress updates.
 *
 * Pino browser mode with `asObject: false` calls:
 *   console.info(bindingsObj, dataObj, messageString)
 * where bindingsObj contains `{ module: 'pxe:service' }` etc.
 *
 * The interception is set up in console-intercept.ts (imported first) so that
 * pino captures our wrapped console.info, not the original.
 */
const PXE_STAGE_MATCHERS: Array<{ module: string; pattern: RegExp; stage: string }> = [
  { module: 'pxe:service', pattern: /^Simulating transaction/, stage: 'Simulating transaction...' },
  { module: 'pxe:service', pattern: /^Simulation completed/, stage: 'Simulation complete, proving...' },
  { module: 'pxe:private-kernel-execution-prover', pattern: /^Private kernel witness generation/, stage: 'Kernel witness generated, creating proof...' },
  { module: 'pxe:bb:wasm:bundle', pattern: /^Generating ClientIVC proof/, stage: 'Generating ZK proof (this takes a while)...' },
  { module: 'pxe:bb:wasm:bundle', pattern: /^Generated ClientIVC proof/, stage: 'Proof generated, sending...' },
  { module: 'wallet-sdk:base_wallet', pattern: /^Sent transaction/, stage: 'Transaction sent, awaiting confirmation...' },
];

onConsoleInfo((args) => {
  const bindings = args.find((a) => typeof a === 'object' && a !== null && typeof a.module === 'string');
  const message = [...args].reverse().find((a) => typeof a === 'string');

  if (bindings && message) {
    for (const matcher of PXE_STAGE_MATCHERS) {
      if (bindings.module === matcher.module && matcher.pattern.test(message)) {
        reportProgress(matcher.stage);
        break;
      }
    }
  }
});

/**
 * Master CryptoKey — cached in memory after unlock. (#2)
 *
 * This is a non-extractable AES-GCM CryptoKey derived from the user's password
 * via PBKDF2. The raw password string is NEVER stored; only this opaque key
 * object is kept in memory. Even if an attacker gets a reference to this object,
 * they cannot extract the underlying key material (WebCrypto enforces this).
 */
let cachedMasterKey: CryptoKey | null = null;

function getCachedMasterKey(): CryptoKey {
  if (!cachedMasterKey) {
    throw new Error('Wallet is locked. Please unlock first.');
  }
  return cachedMasterKey;
}

/** Clear the cached key (used for auto-lock). */
export function clearCachedKey(): void {
  cachedMasterKey = null;
}

// docs:start:pxe-instance
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
// docs:end:pxe-instance

// docs:start:wallet-instance
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

    // docs:start:complete-fee-options
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
    // docs:end:complete-fee-options

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
// docs:end:wallet-instance

// docs:start:message-handler
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
// docs:end:message-handler

async function handleGetAccounts() {
  return getAccounts();
}

async function handleMarkDeployed(address: string) {
  await markDeployed(address);
  return { success: true };
}

// docs:start:wallet-method-handler
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
// docs:end:wallet-method-handler

/**
 * Sets the master password for the first time. (#1, #2)
 * Returns the CryptoKey (which we cache), never stores the password.
 */
async function handleSetupPassword(password: string) {
  log.debug('[offscreen] Setting up master password');
  const { setupPassword, hasPassword: checkHasPassword } = await import('../wallet/storage');
  const exists = await checkHasPassword();
  if (exists) {
    throw new Error('Master password already set');
  }
  cachedMasterKey = await setupPassword(password);
  // password string goes out of scope here — only the CryptoKey survives
  return { success: true };
}

/**
 * Creates an account using the cached master CryptoKey. (#2, #3)
 */
async function handleCreateAccount(alias: string) {
  const masterKey = getCachedMasterKey();
  log.debug('[offscreen] Creating account with alias:', alias);
  const result = await createAccount(masterKey, alias);
  log.debug('[offscreen] Account created:', result.address);
  return { address: result.address };
}

// docs:start:deploy-account
/**
 * Deploys an account contract onchain using SponsoredFPC for fee payment.
 * Uses the cached master CryptoKey to decrypt the account secret. (#2, #4)
 */
async function handleDeployAccount(address: string) {
  const masterKey = getCachedMasterKey();
  log.debug('[offscreen] Deploying account:', address);

  // 1. Decrypt the account secret
  reportProgress('Decrypting account secret...');
  const secretData = await getAccountSecret(address, masterKey);
  if (!secretData) {
    throw new Error(`Account not found: ${address}`);
  }

  // 2. Ensure PXE is initialized (needed by the wallet)
  reportProgress('Connecting to PXE...');
  await ensurePXE();

  // 3. Register account with PXE and wallet (shared with unlock flow)
  reportProgress('Registering account contract...');
  const { accountManager } = await registerAccountInWallet(address, secretData.secret, secretData.salt);

  // 4. Register SponsoredFPC contract with PXE (shared helper)
  reportProgress('Registering fee payment contract...');
  const { AztecAddress, SponsoredFeePaymentMethod, SponsoredFPCContract } = await getAztecDeploy();
  const sponsoredFPCInstance = await getSponsoredFPCInstance();
  const wallet = await getWallet();
  await wallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);

  // 5. Deploy with SponsoredFPC fee payment.
  //    PXE log matchers (PXE_STAGE_MATCHERS) provide granular progress updates
  //    (simulating → proving → proof generated → sending → awaiting confirmation).
  reportProgress('Starting deploy tx...');

  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPCInstance.address);
  const deployMethod = await accountManager.getDeployMethod();
  const receipt = await deployMethod.send({
    from: AztecAddress.ZERO,
    fee: { paymentMethod },
    wait: { timeout: 2400 },
  });

  // 6. Mark deployed in storage
  await markDeployed(address);
  reportProgress('Deploy complete!');

  log.debug('[offscreen] Account deployed:', address, 'txHash:', receipt.txHash?.toString());
  return { success: true, txHash: receipt.txHash?.toString() };
}
// docs:end:deploy-account

// docs:start:load-accounts
/**
 * Unlocks the wallet: verifies password, caches CryptoKey, initializes PXE,
 * registers all stored accounts. (#1, #2)
 *
 * After unlock:
 * - cachedMasterKey holds the non-extractable CryptoKey
 * - The password string is discarded (goes out of scope)
 * - All accounts are registered with PXE and the BaseWallet
 */
async function handleUnlockWallet(password: string) {
  log.debug('[offscreen] Unlocking wallet...');

  reportProgress('Verifying password...');
  const { verifyAndDeriveMasterKey, hasPassword: checkHasPassword } = await import('../wallet/storage');

  if (await checkHasPassword()) {
    const masterKey = await verifyAndDeriveMasterKey(password);
    if (!masterKey) {
      throw new Error('Incorrect password');
    }
    cachedMasterKey = masterKey;
    // password string goes out of scope — only the CryptoKey survives
  } else {
    throw new Error('No password set. Please set up your wallet first.');
  }

  // Initialize PXE
  reportProgress('Initializing PXE (loading WASM)...');
  await ensurePXE();
  log.debug('[offscreen] PXE initialized for unlock');

  // Register all stored accounts
  const storedAccounts = await getAccounts();
  reportProgress(`Registering ${storedAccounts.length} account(s)...`);
  log.debug('[offscreen] Registering', storedAccounts.length, 'accounts with PXE');

  const failedAccounts: string[] = [];
  for (const account of storedAccounts) {
    try {
      const secretData = await getAccountSecret(account.address, cachedMasterKey);
      if (secretData) {
        await registerAccountInWallet(account.address, secretData.secret, secretData.salt);
        log.debug('[offscreen] Registered account:', account.address);
      }
    } catch (err: any) {
      log.error('[offscreen] Failed to register account:', account.address, err.message);
      failedAccounts.push(account.address);
      // Continue with remaining accounts — partial unlock is better than full lockout
    }
  }

  if (failedAccounts.length === storedAccounts.length && storedAccounts.length > 0) {
    // ALL accounts failed — password is likely wrong
    cachedMasterKey = null;
    throw new Error('Failed to unlock: wrong password or corrupted data');
  }
  if (failedAccounts.length > 0) {
    log.warn('[offscreen] Partial unlock:', failedAccounts.length, 'account(s) failed to register');
  }

  log.debug('[offscreen] Wallet unlocked,', storedAccounts.length - failedAccounts.length, 'of', storedAccounts.length, 'accounts registered');
  return { success: true };
}
// docs:end:load-accounts

/**
 * Registers an account with both PXE and the BaseWallet.
 * Returns the AccountManager so callers (e.g. deploy) can use it for further operations.
 */
async function registerAccountInWallet(address: string, secret: string, salt: string) {
  const { secretFr, saltFr, accountContract, artifact, instance } =
    await instantiateAccount(secret, salt);

  const { AccountManager } = await getAztecCore();

  const wallet = await getWallet();
  await wallet.registerContract(instance, artifact, secretFr);

  const accountManager = await AccountManager.create(wallet, secretFr, accountContract, saltFr);
  const account = await accountManager.getAccount();
  wallet.registerAccount(address, account);

  log.debug('[offscreen] Account registered in PXE and wallet:', address);
  return { success: true, address, accountManager };
}

async function handleRegisterAccount(address: string, secret: string, salt: string) {
  return registerAccountInWallet(address, secret, salt);
}

/**
 * Exports the entire wallet: decrypts all account secrets and builds a WalletExportData object.
 */
async function handleExportWallet(): Promise<WalletExportData> {
  const masterKey = getCachedMasterKey();
  const allAccounts = await getAccounts();
  const activeAddr = await getActiveAccount();

  reportProgress(`Decrypting ${allAccounts.length} account(s)...`);

  const exportedAccounts: WalletExportData['accounts'] = [];
  for (const account of allAccounts) {
    const secretData = await getAccountSecret(account.address, masterKey);
    if (!secretData) {
      throw new Error(`Failed to decrypt account: ${account.address}`);
    }
    exportedAccounts.push({
      address: account.address,
      secret: secretData.secret,
      salt: secretData.salt,
      alias: account.alias,
      isDeployed: account.isDeployed,
    });
  }

  return {
    version: 1,
    aztecPackagesVersion: AZTEC_PACKAGES_VERSION,
    exportedAt: new Date().toISOString(),
    accounts: exportedAccounts,
    activeAccount: activeAddr,
  };
}

/**
 * Imports accounts into the wallet: re-encrypts each account with the new master key,
 * stores them, marks deployed ones, sets active account, and registers all with PXE.
 */
async function handleImportWalletAccounts(
  accounts: WalletExportData['accounts'],
  activeAccount: string | null,
): Promise<{ success: true }> {
  const masterKey = getCachedMasterKey();

  reportProgress(`Importing ${accounts.length} account(s)...`);

  for (const account of accounts) {
    await storeAccount(
      account.address,
      account.secret,
      account.salt,
      masterKey,
      account.alias,
    );
    if (account.isDeployed) {
      await markDeployed(account.address);
    }
  }

  if (activeAccount) {
    await setActiveAccount(activeAccount);
  }

  // Initialize PXE and register all accounts
  reportProgress('Initializing PXE...');
  await ensurePXE();

  for (const account of accounts) {
    reportProgress(`Registering ${account.alias || account.address.slice(0, 10)}...`);
    await registerAccountInWallet(account.address, account.secret, account.salt);
  }

  reportProgress('Import complete!');
  return { success: true };
}

async function handleInitPXE(nodeUrl?: string) {
  await ensurePXE(nodeUrl);
  return { success: true };
}
