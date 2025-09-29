import {
  GAS_ESTIMATION_DA_GAS_LIMIT,
  GAS_ESTIMATION_L2_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
} from '@aztec/constants';
import type { FeeOptions, SimulationUserFeeOptions, UserFeeOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { ContractArtifact, EventMetadataDefinition } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassMetadata,
  type ContractInstanceWithAddress,
  type ContractInstantiationData,
  type ContractMetadata,
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type {
  Tx,
  TxExecutionRequest,
  TxHash,
  TxProfileResult,
  TxProvingResult,
  TxReceipt,
  TxSimulationResult,
  UtilitySimulationResult,
} from '@aztec/stdlib/tx';

import { inspect } from 'util';

import type { Account } from '../account/account.js';
import type {
  ProfileMethodOptions,
  SendMethodOptions,
  SimulateMethodOptions,
} from '../contract/interaction_options.js';
import { FeeJuicePaymentMethod } from '../fee/fee_juice_payment_method.js';
import type { CallIntent, IntentInnerHash } from '../utils/authwit.js';
import type { Aliased, ChainInfo, ContractInstanceAndArtifact, Wallet } from './wallet.js';

/**
 * A base class for Wallet implementations
 */
export abstract class BaseWallet implements Wallet {
  protected log = createLogger('aztecjs:base_wallet');

  protected baseFeePadding = 0.5;

  // Protected because we want to force wallets to instantiate their own PXE.
  protected constructor(
    // TODO: We cannot type here pxe because we cannot import that package as that would result in a circular
    // dependency. This will eventually get resolved by the introduction of @aztec/wallet-sdk package.
    protected readonly pxe: any,
    protected readonly aztecNode: AztecNode,
  ) {}

  protected abstract getAccountFromAddress(address: AztecAddress): Promise<Account>;

  abstract getAccounts(): Promise<Aliased<AztecAddress>[]>;

  async getSenders(): Promise<Aliased<AztecAddress>[]> {
    const senders: AztecAddress[] = await this.pxe.getSenders();
    return senders.map(sender => ({ item: sender, alias: '' }));
  }

  async getChainInfo(): Promise<ChainInfo> {
    const { l1ChainId, rollupVersion } = await this.aztecNode.getNodeInfo();
    return { chainId: new Fr(l1ChainId), version: new Fr(rollupVersion) };
  }

  protected async createTxExecutionRequestFromPayloadAndFee(
    executionPayload: ExecutionPayload,
    from: AztecAddress,
    feeOptions: FeeOptions,
  ): Promise<TxExecutionRequest> {
    const executionOptions = { txNonce: Fr.random(), cancellable: false };
    const fromAccount = await this.getAccountFromAddress(from);
    return fromAccount.createTxExecutionRequest(executionPayload, feeOptions, executionOptions);
  }

  public async createAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | CallIntent,
  ): Promise<AuthWitness> {
    const account = await this.getAccountFromAddress(from);
    return account.createAuthWit(messageHashOrIntent);
  }

  /**
   * Returns default values for the transaction fee options
   * if they were omitted by the user.
   * @param address - The account building the transaction, usually the one paying the fee
   * @param userFeeOptions - User-provided fee options, which might be incomplete
   * @returns - Populated fee options that can be used to create a transaction execution request
   */
  protected async getDefaultFeeOptions(
    address: AztecAddress,
    userFeeOptions: UserFeeOptions | SimulationUserFeeOptions | undefined,
  ): Promise<FeeOptions> {
    const maxFeesPerGas =
      userFeeOptions?.gasSettings?.maxFeesPerGas ??
      (await this.aztecNode.getCurrentBaseFees()).mul(1 + this.baseFeePadding);
    const paymentMethod = userFeeOptions?.paymentMethod ?? new FeeJuicePaymentMethod(address);
    const gasSettings: GasSettings = GasSettings.default({ ...userFeeOptions?.gasSettings, maxFeesPerGas });
    this.log.debug(`Using L2 gas settings`, gasSettings);
    return { gasSettings, paymentMethod };
  }

  /**
   * Returns unreasonably high gas limits in order to execute a simulation
   * with the goal of estimating its gas cost. It will otherwise try to respect
   * the user-specified fee options, filling the gaps with default values as needed.
   * @param address - The address of the account requesting the fee options
   * @param userFeeOptions - User-provided fee options to use as a basis for the fully populated `FeeOptions` type.
   */
  protected async getFeeOptionsForGasEstimation(
    address: AztecAddress,
    userFeeOptions: SimulationUserFeeOptions | undefined,
  ) {
    const defaultFeeOptions = await this.getDefaultFeeOptions(address, userFeeOptions);
    const paymentMethod = defaultFeeOptions.paymentMethod;
    const maxFeesPerGas = defaultFeeOptions.gasSettings.maxFeesPerGas;
    const maxPriorityFeesPerGas = defaultFeeOptions.gasSettings.maxPriorityFeesPerGas;
    // Use unrealistically high gas limits for estimation to avoid running out of gas.
    // They will be tuned down after the simulation.
    const gasSettingsForEstimation = new GasSettings(
      new Gas(GAS_ESTIMATION_DA_GAS_LIMIT, GAS_ESTIMATION_L2_GAS_LIMIT),
      new Gas(GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT, GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT),
      maxFeesPerGas,
      maxPriorityFeesPerGas,
    );
    return { paymentMethod, gasSettings: gasSettingsForEstimation };
  }

  registerSender(address: AztecAddress, _alias: string = ''): Promise<AztecAddress> {
    return this.pxe.registerSender(address);
  }

  async registerContract(
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
    artifact?: ContractArtifact,
  ): Promise<ContractInstanceWithAddress> {
    /** Determines if the provided instance data is already a contract instance with an address. */
    function isInstanceWithAddress(instanceData: any): instanceData is ContractInstanceWithAddress {
      return (instanceData as ContractInstanceWithAddress).address !== undefined;
    }
    /** Determines if the provided instance data is contract instantiation data */
    function isContractInstantiationData(instanceData: any): instanceData is ContractInstantiationData {
      return (instanceData as ContractInstantiationData).salt !== undefined;
    }
    /** Determines if the provided instance data is already a contract */
    function isContractInstanceAndArtifact(instanceData: any): instanceData is ContractInstanceAndArtifact {
      return (
        (instanceData as ContractInstanceAndArtifact).instance !== undefined &&
        (instanceData as ContractInstanceAndArtifact).artifact !== undefined
      );
    }
    let instance: ContractInstanceWithAddress;
    if (isContractInstanceAndArtifact(instanceData)) {
      instance = instanceData.instance;
      await this.pxe.registerContract(instanceData);
    } else if (isInstanceWithAddress(instanceData)) {
      instance = instanceData;
      await this.pxe.registerContract({ artifact, instance });
    } else if (isContractInstantiationData(instanceData)) {
      if (!artifact) {
        throw new Error(`Contract artifact must be provided when registering a contract using instantiation data`);
      }
      instance = await getContractInstanceFromInstantiationParams(artifact, instanceData);
      await this.pxe.registerContract({ artifact, instance });
    } else {
      if (!artifact) {
        throw new Error(`Contract artifact must be provided when registering a contract using address`);
      }
      const { contractInstance: maybeContractInstance } = await this.pxe.getContractMetadata(instanceData);
      if (!maybeContractInstance) {
        throw new Error(`Contract instance at ${instanceData.toString()} has not been registered in the wallet's PXE`);
      }
      instance = maybeContractInstance;
      const thisContractClass = await getContractClassFromArtifact(artifact);
      if (!thisContractClass.id.equals(instance.currentContractClassId)) {
        // wallet holds an outdated version of this contract
        await this.pxe.updateContract(instance.address, artifact);
        instance.currentContractClassId = thisContractClass.id;
      }
    }
    return instance;
  }

  async simulateTx(executionPayload: ExecutionPayload, opts: SimulateMethodOptions): Promise<TxSimulationResult> {
    const feeOptions = opts.fee?.estimateGas
      ? await this.getFeeOptionsForGasEstimation(opts.from, opts.fee)
      : await this.getDefaultFeeOptions(opts.from, opts.fee);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, feeOptions);
    return this.pxe.simulateTx(
      txRequest,
      true /* simulatePublic */,
      opts?.skipTxValidation,
      opts?.skipFeeEnforcement ?? true,
    );
  }

  async profileTx(executionPayload: ExecutionPayload, opts: ProfileMethodOptions): Promise<TxProfileResult> {
    const fee = await this.getDefaultFeeOptions(opts.from, opts.fee);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, fee);
    return this.pxe.profileTx(txRequest, opts.profileMode, opts.skipProofGeneration ?? true);
  }

  async proveTx(exec: ExecutionPayload, opts: SendMethodOptions): Promise<TxProvingResult> {
    const fee = await this.getDefaultFeeOptions(opts.from, opts.fee);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(exec, opts.from, fee);
    return this.pxe.proveTx(txRequest);
  }

  async sendTx(tx: Tx): Promise<TxHash> {
    const txHash = tx.getTxHash();
    if (await this.aztecNode.getTxEffect(txHash)) {
      throw new Error(`A settled tx with equal hash ${txHash.toString()} exists.`);
    }
    this.log.debug(`Sending transaction ${txHash}`);
    await this.aztecNode.sendTx(tx).catch(err => {
      throw this.#contextualizeError(err, inspect(tx));
    });
    this.log.info(`Sent transaction ${txHash}`);
    return txHash;
  }

  #contextualizeError(err: Error, ...context: string[]): Error {
    let contextStr = '';
    if (context.length > 0) {
      contextStr = `\nContext:\n${context.join('\n')}`;
    }
    if (err instanceof SimulationError) {
      err.setAztecContext(contextStr);
    } else {
      this.log.error(err.name, err);
      this.log.debug(contextStr);
    }
    return err;
  }

  simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    from?: AztecAddress,
  ): Promise<UtilitySimulationResult> {
    return this.pxe.simulateUtility(functionName, args, to, authwits, from);
  }

  getContractClassMetadata(id: Fr, includeArtifact: boolean = false): Promise<ContractClassMetadata> {
    return this.pxe.getContractClassMetadata(id, includeArtifact);
  }
  getContractMetadata(address: AztecAddress): Promise<ContractMetadata> {
    return this.pxe.getContractMetadata(address);
  }

  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return this.aztecNode.getTxReceipt(txHash);
  }

  getPrivateEvents<T>(
    contractAddress: AztecAddress,
    event: EventMetadataDefinition,
    from: number,
    limit: number,
    recipients: AztecAddress[] = [],
  ): Promise<T[]> {
    return this.pxe.getPrivateEvents(contractAddress, event, from, limit, recipients);
  }
}
