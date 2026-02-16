import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub';
import { type Account, type AccountContract, SignerlessAccount } from '@aztec/aztec.js/account';
import {
  type CallIntent,
  type ContractFunctionInteractionCallIntent,
  type IntentInnerHash,
  SetPublicAuthwitContractInteraction,
  computeInnerAuthWitHashFromAction,
  isContractFunctionInteractionCallIntent,
  lookupValidity,
} from '@aztec/aztec.js/authorization';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AccountManager, type SendOptions } from '@aztec/aztec.js/wallet';
import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/config';
import { PXE, type PXECreationOptions, createPXE } from '@aztec/pxe/server';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import type { NoteDao, NotesFilter } from '@aztec/stdlib/note';
import type { BlockHeader, TxHash, TxReceipt, TxSimulationResult } from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';
import { BaseWallet, type FeeOptions } from '@aztec/wallet-sdk/base-wallet';

import { AztecNodeProxy, ProvenTx } from './utils.js';

/**
 * Data for generating an account.
 */
export interface AccountData {
  secret: Fr;
  salt: Fr;
  contract: AccountContract;
}

/**
 * Wallet implementation that stores accounts in memory and provides extra debugging
 * utilities
 * It is intended to be used in e2e tests.
 */
export class TestWallet extends BaseWallet {
  constructor(
    pxe: PXE,
    private readonly nodeRef: AztecNodeProxy,
  ) {
    super(pxe, nodeRef);
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
    return new TestWallet(pxe, nodeRef);
  }

  /**
   * Updates the underlying node that this wallet and its PXE communicate with.
   * @param node - The new AztecNode to forward all calls to.
   */
  updateNode(node: AztecNode): void {
    this.nodeRef.updateTargetNode(node);
  }

  createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq): Promise<AccountManager> {
    signingKey = signingKey ?? deriveSigningKey(secret);
    const accountData = {
      secret,
      salt,
      contract: new SchnorrAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaRAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaKAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  async getFakeAccountDataFor(address: AztecAddress) {
    const originalAccount = await this.getAccountFromAddress(address);
    if (originalAccount instanceof SignerlessAccount) {
      throw new Error(`Cannot create fake account data for SignerlessAccount at address: ${address}`);
    }
    const originalAddress = (originalAccount as Account).getCompleteAddress();
    const contractInstance = await this.pxe.getContractInstance(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const stubAccount = createStubAccount(originalAddress);
    const instance = await getContractInstanceFromInstantiationParams(StubAccountContractArtifact, {
      salt: Fr.random(),
    });
    return {
      account: stubAccount,
      instance,
      artifact: StubAccountContractArtifact,
    };
  }
  protected accounts: Map<string, Account> = new Map();

  /**
   * Toggle for running "simulated simulations" when calling simulateTx.
   *
   * When this flag is true, simulateViaEntrypoint constructs a request using a fake account
   * (and accepts contract overrides on the input) and the PXE emulates kernel effects without
   * generating kernel witnesses. When false, simulateViaEntrypoint defers to the standard
   * simulation path via the real account entrypoint.
   */
  private simulatedSimulations = false;

  enableSimulatedSimulations() {
    this.simulatedSimulations = true;
  }

  disableSimulatedSimulations() {
    this.simulatedSimulations = false;
  }

  setMinFeePadding(value?: number) {
    this.minFeePadding = value ?? 0.5;
  }

  protected getAccountFromAddress(address: AztecAddress): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      account = new SignerlessAccount();
    } else {
      account = this.accounts.get(address?.toString() ?? '');
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return Promise.resolve(account);
  }

  getAccounts() {
    return Promise.resolve(Array.from(this.accounts.values()).map(acc => ({ alias: '', item: acc.getAddress() })));
  }

  async createAccount(accountData?: AccountData): Promise<AccountManager> {
    const secret = accountData?.secret ?? Fr.random();
    const salt = accountData?.salt ?? Fr.random();
    const contract = accountData?.contract ?? new SchnorrAccountContract(GrumpkinScalar.random());

    const accountManager = await AccountManager.create(this, secret, contract, salt);

    const instance = accountManager.getInstance();
    const artifact = await contract.getContractArtifact();

    await this.registerContract(instance, artifact, secret);

    this.accounts.set(accountManager.address.toString(), await accountManager.getAccount());

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

  /**
   * Override simulateViaEntrypoint to use fake accounts for kernelless simulation
   * when simulatedSimulations is enabled. Otherwise falls through to the real entrypoint path.
   */
  protected override async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    from: AztecAddress,
    feeOptions: FeeOptions,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
  ): Promise<TxSimulationResult> {
    if (!this.simulatedSimulations) {
      return super.simulateViaEntrypoint(executionPayload, from, feeOptions, skipTxValidation, skipFeeEnforcement);
    }

    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const executionOptions: DefaultAccountEntrypointOptions = {
      txNonce: Fr.random(),
      cancellable: this.cancellableTransactions,
      feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions,
    };
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const { account: fromAccount, instance, artifact } = await this.getFakeAccountDataFor(from);
    const chainInfo = await this.getChainInfo();
    const txRequest = await fromAccount.createTxExecutionRequest(
      finalExecutionPayload,
      feeOptions.gasSettings,
      chainInfo,
      executionOptions,
    );
    const contractOverrides = {
      [from.toString()]: { instance, artifact },
    };
    return this.pxe.simulateTx(txRequest, {
      simulatePublic: true,
      skipFeeEnforcement: true,
      skipTxValidation: true,
      overrides: { contracts: contractOverrides },
    });
  }

  async proveTx(exec: ExecutionPayload, opts: Omit<SendOptions, 'wait'>): Promise<ProvenTx> {
    const fee = await this.completeFeeOptions(opts.from, exec.feePayer, opts.fee?.gasSettings);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(exec, opts.from, fee);
    const txProvingResult = await this.pxe.proveTx(txRequest);
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
    return this.pxe.debug.sync();
  }

  stop(): Promise<void> {
    return this.pxe.stop();
  }
}
