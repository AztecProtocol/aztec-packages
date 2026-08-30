import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { StubEcdsaAccountContractArtifact, createStubEcdsaAccount } from '@aztec/accounts/ecdsa/stub';
import { SchnorrAccountContract, SchnorrInitializerlessAccountContract } from '@aztec/accounts/schnorr';
import { StubSchnorrAccountContractArtifact, createStubSchnorrAccount } from '@aztec/accounts/schnorr/stub';
import { type Account, type AccountContract, NO_FROM } from '@aztec/aztec.js/account';
import type { CompleteAddress } from '@aztec/aztec.js/addresses';
import {
  type CallIntent,
  type ContractFunctionInteractionCallIntent,
  type IntentInnerHash,
  SetPublicAuthwitContractInteraction,
  computeInnerAuthWitHashFromAction,
  isContractFunctionInteractionCallIntent,
  lookupValidity,
} from '@aztec/aztec.js/authorization';
import { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AccountManager, type SendOptions } from '@aztec/aztec.js/wallet';
import { TxSimulationResultWithAppOffset } from '@aztec/aztec.js/wallet';
import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { NotesFilter } from '@aztec/pxe/client/lazy';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/config';
import { PXE, type PXECreationOptions, type TaggingSecretSource, createPXE } from '@aztec/pxe/server';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { NoteDao } from '@aztec/stdlib/note';
import {
  type BlockHeader,
  type ContractOverrides,
  SimulationOverrides,
  type TxExecutionRequest,
  type TxHash,
  type TxReceipt,
} from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';
import { BaseWallet, type SimulateViaEntrypointOptions } from '@aztec/wallet-sdk/base-wallet';
import type { AccountType } from '@aztec/wallets/embedded';

import { DEFAULT_MIN_FEE_PADDING } from '../fixtures/fixtures.js';
import { AztecNodeProxy, ProvenTx } from './utils.js';

/**
 * Data for generating an account.
 */
export interface AccountData {
  secret: Fr;
  salt: Fr;
  type?: AccountType;
  contract: AccountContract;
}

/**
 * Wallet implementation that stores accounts in memory and provides extra debugging
 * utilities
 * It is intended to be used in e2e tests.
 */
/**
 * Poll interval (in seconds) for in-process TestWallet tx waits. In-process nodes reach CHECKPOINTED synchronously
 * under automine and cheaply otherwise, so a sub-second cadence removes almost-pure dead time from every send().wait().
 * Spartan tests run against remote JSON-RPC nodes and restore the 1s default via setDefaultWaitInterval.
 */
export const IN_PROCESS_WAIT_INTERVAL_SECONDS = 0.25;

export class TestWallet extends BaseWallet {
  constructor(
    pxe: PXE,
    private readonly nodeRef: AztecNodeProxy,
  ) {
    super(pxe, nodeRef);
    this.minFeePadding = DEFAULT_MIN_FEE_PADDING;
    this.defaultWaitInterval = IN_PROCESS_WAIT_INTERVAL_SECONDS;
  }

  /**
   * Overrides the poll interval (in seconds) used when a send().wait() caller does not specify one. Pass `undefined`
   * to fall back to the DefaultWaitOpts cadence. Spartan tests set this to 1 so they do not hammer remote nodes.
   */
  setDefaultWaitInterval(interval?: number): void {
    this.defaultWaitInterval = interval;
  }

  static async create(
    node: AztecNode,
    overridePXEConfig?: Partial<PXEConfig>,
    options: PXECreationOptions = { loggers: {} },
  ): Promise<TestWallet> {
    const nodeRef = new AztecNodeProxy(node);
    const pxeConfig = Object.assign(getPXEConfig(), {
      proverEnabled: overridePXEConfig?.proverEnabled ?? false,
      ...overridePXEConfig,
    });
    const pxe = await createPXE(nodeRef, pxeConfig, options);
    const wallet = new TestWallet(pxe, nodeRef);
    await wallet.initStubClasses();
    return wallet;
  }

  /**
   * Updates the underlying node that this wallet and its PXE communicate with.
   * @param node - The new AztecNode to forward all calls to.
   */
  updateNode(node: AztecNode): void {
    this.nodeRef.updateTargetNode(node);
  }

  createSchnorrAccount(secret: Fr, salt: Fr, signingKey: Fq): Promise<AccountManager> {
    return this.createAccount({ secret, salt, type: 'schnorr', contract: new SchnorrAccountContract(signingKey) });
  }

  createSchnorrInitializerlessAccount(secret: Fr, salt: Fr, signingKey: Fq): Promise<AccountManager> {
    return this.createAccount({
      secret,
      salt,
      type: 'schnorr_initializerless',
      contract: new SchnorrInitializerlessAccountContract(signingKey),
    });
  }

  createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    return this.createAccount({
      secret,
      salt,
      type: 'ecdsasecp256r1',
      contract: new EcdsaRAccountContract(signingKey),
    });
  }

  createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    return this.createAccount({
      secret,
      salt,
      type: 'ecdsasecp256k1',
      contract: new EcdsaKAccountContract(signingKey),
    });
  }

  // Stub class ids, populated on wallet startup
  // to avoid redundant work per simulation
  private stubClassIds = new Map<AccountType, Fr>();

  /**
   * Hashes and registers the stub class for every supported account type with PXE, populating
   * stubClassIds. Called on wallet initialization.
   */
  private async initStubClasses(): Promise<void> {
    const { id: schnorrClassId } = await getContractClassFromArtifact(StubSchnorrAccountContractArtifact);
    await this.pxe.registerContractClass(StubSchnorrAccountContractArtifact);

    // ecdsa stubs share the same class id
    const { id: ecdsaClassId } = await getContractClassFromArtifact(StubEcdsaAccountContractArtifact);
    await this.pxe.registerContractClass(StubEcdsaAccountContractArtifact);

    this.stubClassIds.set('schnorr', schnorrClassId);
    // Initializerless accounts share the schnorr stub class for kernelless simulation.
    this.stubClassIds.set('schnorr_initializerless', schnorrClassId);
    this.stubClassIds.set('ecdsasecp256k1', ecdsaClassId);
    this.stubClassIds.set('ecdsasecp256r1', ecdsaClassId);
  }

  /**
   * Builds contract overrides for all provided addresses by replacing their account contracts with stub implementations.
   */
  protected async buildAccountOverrides(addresses: AztecAddress[]): Promise<ContractOverrides> {
    const accounts = await this.getAccounts();
    const contracts: ContractOverrides = {};

    const filtered = accounts.filter(acc => addresses.some(addr => addr.equals(acc.item)));

    for (const account of filtered) {
      const address = account.item;
      const originalAccount = await this.getAccountFromAddress(address);
      const completeAddress = originalAccount.getCompleteAddress();
      const contractInstance = await this.pxe.getContractInstance(completeAddress.address);
      if (!contractInstance) {
        throw new Error(
          `No contract instance found for address: ${completeAddress.address} during account override building. This is a bug!`,
        );
      }

      const type = this.getTypeFor(address);
      const stubClassId = this.stubClassIds.get(type);
      if (!stubClassId) {
        throw new Error(
          `Stub class for account type '${type}' was not registered at wallet init. This is a bug — initStubClasses should cover every supported AccountType.`,
        );
      }

      contracts[address.toString()] = {
        instance: { ...contractInstance, currentContractClassId: stubClassId },
      };
    }

    return contracts;
  }

  protected accounts: Map<string, { account: Account; type: AccountType }> = new Map();

  private getTypeFor(address: AztecAddress): AccountType {
    return this.accounts.get(address.toString())?.type ?? 'schnorr';
  }

  private getStubAccountFor(address: AztecAddress, completeAddress: CompleteAddress) {
    const type = this.getTypeFor(address);
    return type === 'schnorr' || type === 'schnorr_initializerless'
      ? createStubSchnorrAccount(completeAddress)
      : createStubEcdsaAccount(completeAddress);
  }

  /**
   * Controls how the test wallet simulates transactions:
   * - `kernelless`: Skips kernel circuits but uses the real account contract. Default.
   * - `kernelless-override`: Skips kernels and replaces the account with a stub that doesn't do authwit validation.
   * - `full`: Uses real kernel circuits and real account contracts. Slow!
   */
  private simulationMode: 'kernelless' | 'kernelless-override' | 'full' = 'kernelless';

  setSimulationMode(mode: 'kernelless' | 'kernelless-override' | 'full') {
    this.simulationMode = mode;
  }

  setMinFeePadding(value?: number) {
    this.minFeePadding = value ?? DEFAULT_MIN_FEE_PADDING;
  }

  protected getAccountFromAddress(address: AztecAddress): Promise<Account> {
    const entry = this.accounts.get(address?.toString() ?? '');

    if (!entry) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return Promise.resolve(entry.account);
  }

  getAccounts() {
    return Promise.resolve(
      Array.from(this.accounts.values()).map(entry => ({ alias: '', item: entry.account.getAddress() })),
    );
  }

  async createAccount(accountData?: AccountData): Promise<AccountManager> {
    const secret = accountData?.secret ?? Fr.random();
    const salt = accountData?.salt ?? Fr.random();
    const type = accountData?.type ?? 'schnorr';
    const contract = accountData?.contract ?? new SchnorrAccountContract(GrumpkinScalar.random());

    // Initializerless accounts have no deployment tx: the address commits to the signing public key
    // (via the contract's immutablesHash, resolved by AccountManager.create) and the constructor's
    // storage writes are materialized locally via a simulated "store" call below.
    // Mirrors EmbeddedWallet.createAccountInternal.
    const accountManager = await AccountManager.create(this, secret, contract, { salt });

    const instance = accountManager.getInstance();
    const artifact = await contract.getContractArtifact();

    await this.registerContract(instance, artifact, secret);

    const address = accountManager.address.toString();
    this.accounts.set(address, { account: await accountManager.getAccount(), type });

    if (contract instanceof SchnorrInitializerlessAccountContract) {
      const constructorAbi = artifact.functions.find(f => f.name === 'constructor');
      if (!constructorAbi) {
        throw new Error('Could not create SchnorrInitializerlessAccount: constructor ABI not found');
      }
      const { x, y } = await contract.getSigningPublicKey();
      const storeCall = new ContractFunctionInteraction(this, instance.address, constructorAbi, [x, y]);
      await storeCall.simulate({ from: instance.address });
    }

    return accountManager;
  }

  lookupValidity(
    onBehalfOf: AztecAddress,
    intent: IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
    witness: AuthWitness,
  ): Promise<{
    isValidInPrivate: boolean;
    isValidInPublic: boolean;
  }> {
    return lookupValidity(this, onBehalfOf, intent, witness);
  }

  public setPublicAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
    authorized: boolean,
  ): Promise<SetPublicAuthwitContractInteraction> {
    return SetPublicAuthwitContractInteraction.create(this, from, messageHashOrIntent, authorized);
  }

  public override async createAuthWit(
    from: AztecAddress,
    intent: IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
  ): Promise<AuthWitness> {
    const account = await this.getAccountFromAddress(from);
    const chainInfo = await this.getChainInfo();
    let intentInnerHash: IntentInnerHash;
    if ('caller' in intent) {
      const call = isContractFunctionInteractionCallIntent(intent)
        ? await intent.action.getFunctionCall()
        : intent.call;
      const innerHash = await computeInnerAuthWitHashFromAction(intent.caller, call);
      intentInnerHash = { innerHash, consumer: call.to };
    } else {
      intentInnerHash = intent;
    }
    return account.createAuthWit(intentInnerHash, chainInfo);
  }

  protected override async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    opts: SimulateViaEntrypointOptions,
  ): Promise<TxSimulationResultWithAppOffset> {
    const { from, feeOptions, additionalScopes, skipTxValidation, skipFeeEnforcement, sendMessagesAs } = opts;
    const scopes = this.scopesFrom(from, additionalScopes ?? [], sendMessagesAs);
    const skipKernels = this.simulationMode !== 'full';
    const useOverride = this.simulationMode === 'kernelless-override';

    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const chainInfo = await this.getChainInfo();

    let overrides = opts.overrides;
    let txRequest: TxExecutionRequest;
    if (useOverride) {
      const accountOverrides = await this.buildAccountOverrides(scopes);
      overrides = new SimulationOverrides({
        publicStorage: overrides?.publicStorage,
        contracts: { ...overrides?.contracts, ...accountOverrides },
      });
    }

    if (from === NO_FROM) {
      const entrypoint = new DefaultEntrypoint();
      txRequest = await entrypoint.createTxExecutionRequest(finalExecutionPayload, feeOptions.gasSettings, chainInfo);
    } else {
      let fromAccount: Account;
      if (useOverride) {
        const originalAccount = await this.getAccountFromAddress(from);
        fromAccount = this.getStubAccountFor(from, originalAccount.getCompleteAddress());
      } else {
        fromAccount = await this.getAccountFromAddress(from);
      }
      const executionOptions: DefaultAccountEntrypointOptions = {
        txNonce: Fr.random(),
        cancellable: this.cancellableTransactions,
        // If from is an address, feeOptions include the way the account contract should handle the fee payment
        feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions!,
      };
      txRequest = await fromAccount.createTxExecutionRequest(
        finalExecutionPayload,
        feeOptions.gasSettings,
        chainInfo,
        executionOptions,
      );
    }

    const result = await this.pxe.simulateTx(txRequest, {
      simulatePublic: true,
      skipKernels,
      skipFeeEnforcement,
      skipTxValidation,
      overrides,
      scopes,
      senderForTags: this.senderForTagsFrom(from, sendMessagesAs),
    });
    const appCallOffset = await this.computeAppCallOffset(from, feeOptions);
    return TxSimulationResultWithAppOffset.fromResultAndOffset(result, appCallOffset);
  }

  async proveTx(exec: ExecutionPayload, opts: Omit<SendOptions, 'wait'>): Promise<ProvenTx> {
    const fee = await this.completeFeeOptions({
      from: opts.from,
      feePayer: exec.feePayer,
      gasSettings: opts.fee?.gasSettings,
    });
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(exec, opts.from, fee);
    const txProvingResult = await this.pxe.proveTx(txRequest, {
      scopes: this.scopesFrom(opts.from, opts.additionalScopes ?? [], opts.sendMessagesAs),
      senderForTags: this.senderForTagsFrom(opts.from, opts.sendMessagesAs),
    });
    return new ProvenTx(
      this.aztecNode,
      await txProvingResult.toTx(),
      txProvingResult.getOffchainEffects(),
      txProvingResult.stats,
    );
  }

  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return this.aztecNode.getTxReceipt(txHash);
  }

  getNotes(filter: NotesFilter): Promise<NoteDao[]> {
    return this.pxe.debug.getNotes(filter);
  }

  getSyncedBlockHeader(): Promise<BlockHeader> {
    return this.pxe.getSyncedBlockHeader();
  }

  sync(): Promise<void> {
    return this.pxe.sync();
  }

  /**
   * Registers a non-sender tagging-secret source (e.g. a raw out-of-band shared secret) so this PXE discovers messages
   * tagged with it. Test-only surface over {@link PXE.registerTaggingSecretSource}, which the base `Wallet` does not
   * expose. The `address-derived` (sender) variant is excluded: use {@link Wallet.registerSender} for that.
   */
  registerTaggingSecretSource(source: Exclude<TaggingSecretSource, { kind: 'address-derived' }>): Promise<void> {
    return this.pxe.registerTaggingSecretSource(source);
  }

  /**
   * Retrieves the accounts registered on this wallet's PXE. Test-only surface over
   * {@link PXE.getRegisteredAccounts}; together with {@link registerTaggingSecretSource} it lets the wallet satisfy
   * the delivery helpers' structural PXE parameter without exposing the PXE itself.
   */
  getRegisteredAccounts(): Promise<CompleteAddress[]> {
    return this.pxe.getRegisteredAccounts();
  }

  stop(): Promise<void> {
    return this.pxe.stop();
  }
}
