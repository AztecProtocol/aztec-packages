import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
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
import { type Capsule, type TxProfileResult, TxProvingResult, collectOffchainEffects } from '@aztec/stdlib/tx';

import { publishContractClass } from '../deployment/publish_class.js';
import { publishInstance } from '../deployment/publish_instance.js';
import type { Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction } from './base_contract_interaction.js';
import type { Contract } from './contract.js';
import type { ContractBase } from './contract_base.js';
import { ContractFunctionInteraction } from './contract_function_interaction.js';
import { DeployProvenTx } from './deploy_proven_tx.js';
import { DeploySentTx } from './deploy_sent_tx.js';
import { getGasLimits } from './get_gas_limits.js';
import {
  type ProfileInteractionOptions,
  type RequestInteractionOptions,
  type SendInteractionOptions,
  type SimulationInteractionFeeOptions,
  type SimulationReturn,
  toProfileOptions,
  toSendOptions,
  toSimulateOptions,
} from './interaction_options.js';

/**
 * Configuration options for creating a deployment execution request.
 *
 * @remarks
 * These options control how a contract deployment is prepared before being sent to the network.
 * They allow fine-grained control over the deployment process, including which steps to skip
 * and how to derive the contract address.
 *
 * The deployment process consists of three potential phases:
 * 1. Contract class publication - Registers the contract bytecode and ABI on-chain
 * 2. Contract instance publication - Registers the specific instance for public execution
 * 3. Contract initialization - Calls the constructor to set up initial state
 *
 * @example
 * ```typescript
 * // Minimal deployment
 * const request = await deployMethod.request();
 * ```
 *
 * @example
 * ```typescript
 * // Deterministic deployment with custom salt
 * const request = await deployMethod.request({
 *   contractAddressSalt: new Fr(12345),
 *   deployer: deployerAddress
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Skip class publication if already published
 * const request = await deployMethod.request({
 *   skipClassPublication: true
 * });
 * ```
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
};

/**
 * Configuration options for sending a contract deployment transaction.
 *
 * @remarks
 * Extends RequestDeployOptions with transaction execution parameters like the sender address
 * and fee configuration. These options are used when actually sending a deployment transaction
 * to the network via the `send()` or `prove()` methods.
 *
 * @example
 * ```typescript
 * // Deploy with explicit sender
 * const tx = deployMethod.send({
 *   from: wallet.getAddress(),
 *   fee: { estimateGas: true }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Universal deployment (address independent of sender)
 * const tx = deployMethod.send({
 *   from: wallet.getAddress(),
 *   universalDeploy: true
 * });
 * ```
 */
export type DeployOptions = Omit<RequestDeployOptions, 'deployer'> & {
  /**
   * Set to true to *not* include the sender in the address computation. This option
   * is mutually exclusive with "deployer"
   */
  universalDeploy?: boolean;
} & Pick<SendInteractionOptions, 'from' | 'fee'>;
// docs:end:deploy_options
// TODO(@spalladino): Add unit tests for this class!

/**
 * Configuration options for simulating a contract deployment.
 *
 * @remarks
 * Extends DeployOptions with simulation-specific settings that control validation behavior
 * and whether to include additional metadata in the simulation results. Simulations are
 * useful for estimating gas costs and validating deployment logic before sending the transaction.
 *
 * @example
 * ```typescript
 * // Simulate with gas estimation
 * const result = await deployMethod.simulate({
 *   from: wallet.getAddress(),
 *   fee: { estimateGas: true }
 * });
 * console.log('Estimated gas:', result.estimatedGas);
 * ```
 *
 * @example
 * ```typescript
 * // Simulation with relaxed validation
 * const result = await deployMethod.simulate({
 *   from: wallet.getAddress(),
 *   skipTxValidation: true, // Skip nullifier checks
 *   skipFeeEnforcement: true // Don't validate fee payment
 * });
 * ```
 */
export type SimulateDeployOptions = Omit<DeployOptions, 'fee'> & {
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

/**
 * Handles contract deployment operations including class publication, instance publication, and initialization.
 *
 * @remarks
 * DeployMethod orchestrates the multi-step process of deploying a contract to the Aztec network.
 * It provides a fluent interface for configuring and executing deployments with various options.
 *
 * The deployment lifecycle consists of up to three phases:
 * 1. **Class Publication**: Registers the contract's bytecode and ABI on-chain (if not already published)
 * 2. **Instance Publication**: Registers the specific contract instance for public execution (optional)
 * 3. **Initialization**: Calls the contract's constructor to set up initial state (if defined)
 *
 * For contracts without public functions or constructors, deployment may not require an on-chain transaction.
 * In such cases, the contract can be interacted with immediately after local registration.
 *
 * @typeParam TContract - The contract type that will be returned after successful deployment
 *
 * @example
 * ```typescript
 * // Standard deployment flow
 * const deployMethod = Contract.deploy(wallet, artifact, [constructorArg1, constructorArg2]);
 *
 * // Send and wait for deployment
 * const sentTx = deployMethod.send({ from: wallet.getAddress() });
 * const receipt = await sentTx.wait();
 * const contract = receipt.contract;
 *
 * // Or use the convenience method
 * const contract = await sentTx.deployed();
 * ```
 *
 * @example
 * ```typescript
 * // Simulate before deploying
 * const simulation = await deployMethod.simulate({
 *   from: wallet.getAddress(),
 *   fee: { estimateGas: true }
 * });
 *
 * if (simulation.estimatedGas.gasLimits.l2Gas > threshold) {
 *   console.warn('Deployment will be expensive!');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Deploy with custom options
 * const tx = deployMethod.send({
 *   from: wallet.getAddress(),
 *   contractAddressSalt: Fr.random(),
 *   skipClassPublication: true, // Class already published
 *   skipInstancePublication: false, // Need public execution
 *   universalDeploy: false, // Include sender in address
 *   fee: {
 *     gasSettings: {
 *       gasLimits: Gas.from({ l2Gas: 100000, daGas: 50000 })
 *     }
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Register without deploying (for private-only contracts)
 * const contract = await deployMethod.register();
 * // Contract is now usable for private functions
 * await contract.methods.privateFunction().send().wait();
 * ```
 */
export class DeployMethod<TContract extends ContractBase = Contract> extends BaseContractInteraction {
  /** The contract instance to be deployed. */
  private instance?: ContractInstanceWithAddress = undefined;

  /** Constructor function to call. */
  private constructorArtifact: FunctionAbi | undefined;

  constructor(
    private publicKeys: PublicKeys,
    wallet: Wallet,
    protected artifact: ContractArtifact,
    protected postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
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

    await this.wallet.registerContract(await this.getInstance(options), this.artifact);

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

  protected convertDeployOptionsToRequestOptions(options: DeployOptions): RequestDeployOptions {
    return {
      ...options,
      deployer: !options?.universalDeploy ? options.from : undefined,
    };
  }

  /**
   * Registers the contract instance locally without deploying it to the network.
   *
   * @remarks
   * This method is useful for contracts that don't require on-chain deployment, such as:
   * - Contracts with only private functions
   * - Contracts without constructors or initialization logic
   * - Pre-deployed contracts where you just need a local interface
   *
   * The registered contract can be used immediately for private and utility function calls.
   * However, public functions will fail unless the contract instance is also published on-chain.
   *
   * @param options - Optional deployment configuration (salt, public keys, etc.)
   * @returns A contract instance ready for local interaction
   *
   * @example
   * ```typescript
   * // Register a private-only contract
   * const contract = await deployMethod.register();
   * const tx = contract.methods.privateTransfer(recipient, amount).send();
   * ```
   *
   * @example
   * ```typescript
   * // Register with specific public keys
   * const contract = await deployMethod.register({
   *   contractAddressSalt: customSalt
   * });
   * ```
   */
  public async register(options?: RequestDeployOptions): Promise<TContract> {
    const instance = await this.getInstance(options);
    await this.wallet.registerContract(instance, this.artifact);
    return this.postDeployCtor(instance.address, this.wallet);
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
      if ((await this.wallet.getContractClassMetadata(contractClass.id)).isContractClassPubliclyRegistered) {
        this.log.debug(
          `Skipping publication of already-registered contract class ${contractClass.id.toString()} for ${instance.address.toString()}`,
        );
      } else {
        this.log.info(
          `Creating request for publishing contract class ${contractClass.id.toString()} as part of deployment for ${instance.address.toString()}`,
        );
        const registerContractClassInteraction = await publishContractClass(this.wallet, this.artifact);
        calls.push(await registerContractClassInteraction.request());
      }
    }

    // Publish the contract instance:
    if (!options?.skipInstancePublication) {
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/15596):
      // Read the artifact, and if there are no public functions, warn the caller that publication of the
      // contract instance is not necessary (until such time as they wish to update the instance (i.e. change its class_id)).
      const deploymentInteraction = await publishInstance(this.wallet, instance);
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

  override async proveInternal(options: DeployOptions): Promise<TxProvingResult> {
    const executionPayload = await this.request(this.convertDeployOptionsToRequestOptions(options));
    const proveOptions = await toSendOptions(options);
    return await this.wallet.proveTx(executionPayload, proveOptions);
  }

  /**
   * Sends a contract deployment transaction to the network.
   *
   * @remarks
   * This method creates, proves, and sends the deployment transaction. The returned DeploySentTx
   * object provides methods to wait for transaction confirmation and retrieve the deployed contract.
   *
   * The deployment transaction will include:
   * - Class publication (if needed and not skipped)
   * - Instance publication (if not skipped)
   * - Constructor call (if defined and not skipped)
   *
   * @param options - Deployment configuration including sender address and fee settings
   * @returns A DeploySentTx object for tracking the deployment transaction
   *
   * @throws Will throw if the contract requires a constructor but no constructor is found
   * @throws Will throw if the transaction simulation fails
   * @throws Will throw if the transaction is rejected by the network
   *
   * @example
   * ```typescript
   * // Basic deployment
   * const deployTx = deployMethod.send({
   *   from: wallet.getAddress()
   * });
   * const contract = await deployTx.deployed();
   * ```
   *
   * @example
   * ```typescript
   * // Deployment with gas estimation
   * const deployTx = deployMethod.send({
   *   from: wallet.getAddress(),
   *   fee: { estimateGas: true }
   * });
   *
   * const receipt = await deployTx.wait();
   * console.log('Gas used:', receipt.gasUsed);
   * console.log('Deployed at:', receipt.contract.address);
   * ```
   *
   * @example
   * ```typescript
   * // Deterministic deployment
   * const salt = new Fr(123456);
   * const deployTx = deployMethod.send({
   *   from: wallet.getAddress(),
   *   contractAddressSalt: salt,
   *   universalDeploy: true // Address won't depend on sender
   * });
   * ```
   */
  public override send(options: DeployOptions): DeploySentTx<TContract> {
    const sendTx = () => {
      return super.send(options).getTxHash();
    };
    this.log.debug(`Sent deployment tx of ${this.artifact.name} contract`);
    return new DeploySentTx(this.wallet, sendTx, this.postDeployCtor, () => this.getInstance(options));
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
   * Prove the request.
   * @param options - initialization and publication options.
   * @returns The proven tx.
   */
  public override async prove(options: DeployOptions): Promise<DeployProvenTx<TContract>> {
    const txProvingResult = await this.proveInternal(options);
    return await DeployProvenTx.fromProvingResult(
      this.wallet,
      txProvingResult,
      this.postDeployCtor,
      () => this.getInstance(options),
      txProvingResult.stats,
    );
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
    const simulatedTx = await this.wallet.simulateTx(executionPayload, await toSimulateOptions(options));

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
  public async profile(options: DeployOptions & ProfileInteractionOptions): Promise<TxProfileResult> {
    const executionPayload = await this.request(this.convertDeployOptionsToRequestOptions(options));
    return await this.wallet.profileTx(executionPayload, {
      ...(await toProfileOptions(options)),
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
