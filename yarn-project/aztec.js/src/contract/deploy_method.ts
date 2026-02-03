import { Fr } from '@aztec/foundation/curves/bn254';
import { type ContractArtifact, type FunctionAbi, type FunctionArtifact, getInitializer } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractInstanceWithAddress,
  computePartialAddress,
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import type { PublicKeys } from '@aztec/stdlib/keys';
import { type Capsule, TxHash, type TxProfileResult, type TxReceipt, collectOffchainEffects } from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';

import { publishContractClass } from '../deployment/publish_class.js';
import { publishInstance } from '../deployment/publish_instance.js';
import type { SendOptions, Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction } from './base_contract_interaction.js';
import type { ContractBase } from './contract_base.js';
import { ContractFunctionInteraction } from './contract_function_interaction.js';
import { getGasLimits } from './get_gas_limits.js';
import {
  NO_WAIT,
  type NoWait,
  type ProfileInteractionOptions,
  type RequestInteractionOptions,
  type SendInteractionOptionsWithoutWait,
  type SimulationInteractionFeeOptions,
  type SimulationReturn,
  toProfileOptions,
  toSendOptions,
  toSimulateOptions,
} from './interaction_options.js';
import type { WaitOpts } from './wait_opts.js';

/**
 * Wait options specific to deployment transactions.
 * Extends WaitOpts with a flag to return the full receipt instead of just the contract.
 */
export type DeployWaitOptions = WaitOpts & {
  /** If true, return the full DeployTxReceipt instead of just the contract. Defaults to false. */
  returnReceipt?: boolean;
};

/**
 * Type for wait options in deployment interactions.
 * - NO_WAIT symbol: Don't wait, return TxHash immediately
 * - DeployWaitOptions: Wait with custom options
 * - undefined: Wait with default options
 */
export type DeployInteractionWaitOptions = NoWait | DeployWaitOptions | undefined;

/**
 * Options for deploying a contract on the Aztec network.
 * Allows specifying a contract address salt and different options to tweak contract publication
 * and initialization
 */
export type RequestDeployOptions = RequestInteractionOptions & {
  /** An optional salt value used to deterministically calculate the contract address. */
  contractAddressSalt?: Fr;
  /**
   * Deployer address that will be used for the deployed contract's address computation.
   * If set to 0, the sender's address won't be mixed in
   */
  deployer?: AztecAddress;
  /** Skip contract class publication. */
  skipClassPublication?: boolean;
  /** Skip publication, instead just privately initialize the contract. */
  skipInstancePublication?: boolean;
  /** Skip contract initialization. */
  skipInitialization?: boolean;
  /** Skip contract registration in the wallet */
  skipRegistration?: boolean;
};

/**
 * Base deployment options without wait parameter.
 */
export type DeployOptionsWithoutWait = Omit<RequestDeployOptions, 'deployer'> & {
  /**
   * Set to true to *not* include the sender in the address computation. This option
   * is mutually exclusive with "deployer"
   */
  universalDeploy?: boolean;
} & Pick<SendInteractionOptionsWithoutWait, 'from' | 'fee'>;

/**
 * Extends the deployment options with the required parameters to send the transaction.
 */
export type DeployOptions<W extends DeployInteractionWaitOptions = undefined> = DeployOptionsWithoutWait & {
  /**
   * Options for waiting for the transaction to be mined.
   * - undefined (default): wait with default options and return the contract instance
   * - DeployWaitOptions: wait with custom options and return contract or receipt based on returnReceipt flag
   * - NO_WAIT: return TxHash immediately without waiting
   */
  wait?: W;
};

/**
 * Options for simulating the deployment of a contract
 * Allows skipping certain validations and computing gas estimations
 */
export type SimulateDeployOptions = Omit<DeployOptionsWithoutWait, 'fee'> & {
  /** The fee options for the transaction. */
  fee?: SimulationInteractionFeeOptions;
  /** Simulate without checking for the validity of the resulting transaction,
   * e.g. whether it emits any existing nullifiers. */
  skipTxValidation?: boolean;
  /** Whether to ensure the fee payer is not empty and has enough balance to pay for the fee. */
  skipFeeEnforcement?: boolean;
  /** Whether to include metadata such as offchain effects and performance statistics
   * (e.g. timing information of the different circuits and oracles) in
   * the simulation result, instead of just the return value of the function */
  includeMetadata?: boolean;
};

/** Receipt for a deployment transaction with the deployed contract instance. */
export type DeployTxReceipt<TContract extends ContractBase = ContractBase> = TxReceipt & {
  /** Type-safe wrapper around the deployed contract instance, linked to the deployment wallet */
  contract: TContract;
  /** The deployed contract instance with address and metadata. */
  instance: ContractInstanceWithAddress;
};

/**
 * Represents the result type of deploying a contract.
 * - If wait is NO_WAIT, returns TxHash immediately.
 * - If wait has returnReceipt: true, returns DeployTxReceipt after waiting.
 * - Otherwise (undefined or DeployWaitOptions without returnReceipt), returns TContract after waiting.
 */
export type DeployReturn<TContract extends ContractBase, W extends DeployInteractionWaitOptions> = W extends NoWait
  ? TxHash
  : W extends {
        // eslint-disable-next-line jsdoc/require-jsdoc
        returnReceipt: true;
      }
    ? DeployTxReceipt<TContract>
    : TContract;

/**
 * Contract interaction for deployment.
 * Handles class publication, instance publication, and initialization of the contract.
 *
 * Note that for some contracts, a tx is not required as part of its "creation":
 * If there are no public functions, and if there are no initialization functions,
 * then technically the contract has already been "created", and all of the contract's
 * functions (private and utility) can be interacted-with immediately, without any
 * "deployment tx".
 */
export class DeployMethod<TContract extends ContractBase = ContractBase> extends BaseContractInteraction {
  /** The contract instance to be deployed. */
  private instance?: ContractInstanceWithAddress = undefined;

  /** Constructor function to call. */
  private constructorArtifact: FunctionAbi | undefined;

  constructor(
    private publicKeys: PublicKeys,
    wallet: Wallet,
    protected artifact: ContractArtifact,
    protected postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract,
    private args: any[] = [],
    constructorNameOrArtifact?: string | FunctionArtifact,
    authWitnesses: AuthWitness[] = [],
    capsules: Capsule[] = [],
  ) {
    super(wallet, authWitnesses, capsules);
    this.constructorArtifact = getInitializer(artifact, constructorNameOrArtifact);
  }

  /**
   * Returns the execution payload that allows this operation to happen on chain.
   * @param options - Configuration options.
   * @returns The execution payload for this operation
   */
  public async request(options?: RequestDeployOptions): Promise<ExecutionPayload> {
    const publication = await this.getPublicationExecutionPayload(options);

    if (!options?.skipRegistration) {
      await this.wallet.registerContract(await this.getInstance(options), this.artifact);
    }

    const initialization = await this.getInitializationExecutionPayload(options);
    const feeExecutionPayload = options?.fee?.paymentMethod
      ? await options.fee.paymentMethod.getExecutionPayload()
      : undefined;
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, publication, initialization])
      : mergeExecutionPayloads([publication, initialization]);
    if (!finalExecutionPayload.calls.length) {
      throw new Error(`No transactions are needed to publish or initialize contract ${this.artifact.name}`);
    }

    return finalExecutionPayload;
  }

  convertDeployOptionsToRequestOptions(options: DeployOptionsWithoutWait): RequestDeployOptions {
    return {
      ...options,
      deployer: !options?.universalDeploy ? options.from : undefined,
    };
  }

  /**
   * Converts DeployOptions to SendOptions, stripping out the returnReceipt flag if present.
   * @param options - Deploy options with wait parameter
   * @returns Send options with wait parameter
   */
  private convertDeployOptionsToSendOptions<W extends DeployInteractionWaitOptions>(
    options: DeployOptions<W>,
    // eslint-disable-next-line jsdoc/require-jsdoc
  ): SendOptions<W extends { returnReceipt: true } ? WaitOpts : W> {
    return {
      ...toSendOptions({
        ...options,
        wait: options.wait as any,
      }),
    } as any;
  }

  /**
   * Adds this contract to the wallet and returns the Contract object.
   * @param options - Deployment options.
   */
  public async register(options?: RequestDeployOptions): Promise<TContract> {
    const instance = await this.getInstance(options);
    await this.wallet.registerContract(instance, this.artifact);
    return this.postDeployCtor(instance, this.wallet);
  }

  /**
   * Returns an execution payload for:
   * - publication of the contract class and
   * - publication of the contract instance to enable public execution
   * depending on the provided options.
   * @param options - Contract creation options.
   * @returns An execution payload with potentially calls (and bytecode capsule) to the class registry and instance registry.
   */
  protected async getPublicationExecutionPayload(options?: RequestDeployOptions): Promise<ExecutionPayload> {
    const calls: ExecutionPayload[] = [];

    // Set contract instance object so it's available for populating the DeploySendTx object
    const instance = await this.getInstance(options);

    // Obtain contract class from artifact and check it matches the reported one by the instance.
    // TODO(@spalladino): We're unnecessarily calculating the contract class multiple times here.
    const contractClass = await getContractClassFromArtifact(this.artifact);
    if (!instance.currentContractClassId.equals(contractClass.id)) {
      throw new Error(
        `Contract class mismatch when deploying contract: got ${instance.currentContractClassId.toString()} from instance and ${contractClass.id.toString()} from artifact`,
      );
    }

    // Publish the contract class if it hasn't been published already.
    if (!options?.skipClassPublication) {
      const classMetadata = await this.wallet.getContractClassMetadata(contractClass.id);
      if (!classMetadata.isContractClassPubliclyRegistered) {
        this.log.info(
          `Creating request for publishing contract class ${contractClass.id.toString()} as part of deployment for ${instance.address.toString()}`,
        );
        const registerContractClassInteraction = await publishContractClass(this.wallet, this.artifact);
        calls.push(await registerContractClassInteraction.request());
      } else {
        this.log.debug(
          `Skipping contract class publication for ${contractClass.id.toString()} as it is already registered`,
        );
      }
    }

    // Publish the contract instance:
    if (!options?.skipInstancePublication) {
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/15596):
      // Read the artifact, and if there are no public functions, warn the caller that publication of the
      // contract instance is not necessary (until such time as they wish to update the instance (i.e. change its class_id)).
      const deploymentInteraction = publishInstance(this.wallet, instance);
      calls.push(await deploymentInteraction.request());
    }

    return mergeExecutionPayloads(calls);
  }

  /**
   * Returns the calls necessary to initialize the contract.
   * @param options - Deployment options.
   * @returns - An array of function calls.
   */
  protected async getInitializationExecutionPayload(options?: RequestDeployOptions): Promise<ExecutionPayload> {
    const executionsPayloads: ExecutionPayload[] = [];
    if (this.constructorArtifact && !options?.skipInitialization) {
      const { address } = await this.getInstance(options);
      const constructorCall = new ContractFunctionInteraction(
        this.wallet,
        address,
        this.constructorArtifact,
        this.args,
      );
      executionsPayloads.push(await constructorCall.request());
    }
    return mergeExecutionPayloads(executionsPayloads);
  }

  /**
   * Send a contract deployment transaction (initialize and/or publish) using the provided options.
   * By default, waits for the transaction to be mined and returns the deployed contract instance.
   *
   * @param options - An object containing various deployment options such as contractAddressSalt and from.
   * @returns TxHash (if wait is NO_WAIT), TContract (if wait is undefined or doesn't have returnReceipt), or DeployTxReceipt (if wait.returnReceipt is true)
   */
  // Overload for when wait is not specified at all - returns the contract
  public override send(options: DeployOptionsWithoutWait): Promise<TContract>;
  // Generic overload for explicit wait values
  // eslint-disable-next-line jsdoc/require-jsdoc
  public override send<W extends DeployInteractionWaitOptions>(
    options: DeployOptions<W>,
  ): Promise<DeployReturn<TContract, W>>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public override async send(options: DeployOptions<DeployInteractionWaitOptions>): Promise<any> {
    const executionPayload = await this.request(this.convertDeployOptionsToRequestOptions(options));
    const sendOptions = this.convertDeployOptionsToSendOptions(options);

    if (options.wait === NO_WAIT) {
      const txHash = await this.wallet.sendTx(executionPayload, sendOptions as SendOptions<NoWait>);
      this.log.debug(`Sent deployment tx ${txHash.hash} of ${this.artifact.name} contract`);
      return txHash;
    }

    const receipt = await this.wallet.sendTx(executionPayload, sendOptions as SendOptions<WaitOpts | undefined>);
    this.log.debug(`Deployed ${this.artifact.name} contract in tx ${receipt.txHash}`);

    // Attach contract instance
    const instance = await this.getInstance(options);
    const contract = this.postDeployCtor(instance, this.wallet) as TContract;

    // Return full receipt if requested, otherwise just the contract
    if (options.wait && typeof options.wait === 'object' && options.wait.returnReceipt) {
      return { ...receipt, contract, instance };
    }

    return contract;
  }

  /**
   * Builds the contract instance and returns it.
   *
   * @param options - An object containing various initialization and publication options.
   * @returns An instance object.
   */
  public async getInstance(options?: RequestDeployOptions): Promise<ContractInstanceWithAddress> {
    if (!this.instance) {
      this.instance = await getContractInstanceFromInstantiationParams(this.artifact, {
        constructorArgs: this.args,
        salt: options?.contractAddressSalt ?? Fr.random(),
        publicKeys: this.publicKeys,
        constructorArtifact: this.constructorArtifact,
        deployer: options?.deployer ? options.deployer : AztecAddress.ZERO,
      });
    }
    return this.instance;
  }

  /**
   * Simulate the deployment
   *
   * @param options - An optional object containing additional configuration for the simulation.
   * @returns A simulation result object containing metadata of the execution, including gas
   * estimations (if requested via options), execution statistics and emitted offchain effects
   */
  public async simulate(options: SimulateDeployOptions): Promise<SimulationReturn<true>> {
    const executionPayload = await this.request(this.convertDeployOptionsToRequestOptions(options));
    const simulatedTx = await this.wallet.simulateTx(executionPayload, toSimulateOptions(options));

    const { gasLimits, teardownGasLimits } = getGasLimits(simulatedTx, options.fee?.estimatedGasPadding);
    this.log.verbose(
      `Estimated gas limits for tx: DA=${gasLimits.daGas} L2=${gasLimits.l2Gas} teardownDA=${teardownGasLimits.daGas} teardownL2=${teardownGasLimits.l2Gas}`,
    );
    return {
      stats: simulatedTx.stats!,
      offchainEffects: collectOffchainEffects(simulatedTx.privateExecutionResult),
      result: undefined,
      estimatedGas: { gasLimits, teardownGasLimits },
    };
  }

  /**
   * Simulate a deployment and profile the gate count for each function in the transaction.
   * @param options - Same options as `send`, plus extra profiling options.
   *
   * @returns An object containing the function return value and profile result.
   */
  public async profile(options: DeployOptionsWithoutWait & ProfileInteractionOptions): Promise<TxProfileResult> {
    const executionPayload = await this.request(this.convertDeployOptionsToRequestOptions(options));
    return await this.wallet.profileTx(executionPayload, {
      ...toProfileOptions(options),
      profileMode: options.profileMode,
      skipProofGeneration: options.skipProofGeneration,
    });
  }

  /** Return this deployment address. */
  public get address() {
    return this.instance?.address;
  }

  /** Returns the partial address for this deployment. */
  public get partialAddress() {
    return this.instance && computePartialAddress(this.instance);
  }

  /**
   * Augments this DeployMethod with additional metadata, such as authWitnesses and capsules.
   * @param options - An object containing the metadata to add to the interaction
   * @returns A new DeployMethod with the added metadata, but calling the same original function in the same manner
   */
  public with({
    authWitnesses = [],
    capsules = [],
  }: {
    /** The authWitnesses to add to the deployment */
    authWitnesses?: AuthWitness[];
    /** The capsules to add to the deployment */
    capsules?: Capsule[];
  }): DeployMethod {
    return new DeployMethod(
      this.publicKeys,
      this.wallet,
      this.artifact,
      this.postDeployCtor,
      this.args,
      this.constructorArtifact?.name,
      this.authWitnesses.concat(authWitnesses),
      this.capsules.concat(capsules),
    );
  }
}
