import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub';
import { type Account, type AccountContract, NO_FROM } from '@aztec/aztec.js/account';
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
import { TxSimulationResultWithAppOffset } from '@aztec/aztec.js/wallet';
import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { NotesFilter } from '@aztec/pxe/client/lazy';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/config';
import { PXE, type PXECreationOptions, createPXE } from '@aztec/pxe/server';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { deriveSigningKey } from '@aztec/stdlib/keys';
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

      const stubInstance = await getContractInstanceFromInstantiationParams(StubAccountContractArtifact, {
        salt: Fr.random(),
      });

      contracts[address.toString()] = {
        instance: stubInstance,
        artifact: StubAccountContractArtifact,
      };
    }

    return contracts;
  }

  protected accounts: Map<string, Account> = new Map();

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
    this.minFeePadding = value ?? 0.5;
  }

  protected getAccountFromAddress(address: AztecAddress): Promise<Account> {
    const account = this.accounts.get(address?.toString() ?? '');

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

  protected override async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    opts: SimulateViaEntrypointOptions,
  ): Promise<TxSimulationResultWithAppOffset> {
    const { from, feeOptions, scopes, skipTxValidation, skipFeeEnforcement } = opts;
    const skipKernels = this.simulationMode !== 'full';
    const useOverride = this.simulationMode === 'kernelless-override';

    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const chainInfo = await this.getChainInfo();

    let overrides: SimulationOverrides | undefined;
    let txRequest: TxExecutionRequest;
    if (useOverride) {
      const accountOverrides = await this.buildAccountOverrides(this.scopesFrom(from, opts.additionalScopes));
      overrides = new SimulationOverrides(accountOverrides);
    }

    if (from === NO_FROM) {
      const entrypoint = new DefaultEntrypoint();
      txRequest = await entrypoint.createTxExecutionRequest(finalExecutionPayload, feeOptions.gasSettings, chainInfo);
    } else {
      let fromAccount: Account;
      if (useOverride) {
        const originalAccount = await this.getAccountFromAddress(from);
        const completeAddress = originalAccount.getCompleteAddress();
        fromAccount = createStubAccount(completeAddress);
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
    const txProvingResult = await this.pxe.proveTx(txRequest, this.scopesFrom(opts.from, opts.additionalScopes));
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
