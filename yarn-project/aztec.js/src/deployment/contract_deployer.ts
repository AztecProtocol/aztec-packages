import type { ContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { PublicKeys } from '@aztec/stdlib/keys';

import { Contract } from '../contract/contract.js';
import { DeployMethod } from '../contract/deploy_method.js';
import type { Wallet } from '../wallet/wallet.js';

/**
 * A utility class for deploying contracts to the Aztec network.
 *
 * @remarks
 * The ContractDeployer simplifies the contract deployment process by wrapping the contract artifact,
 * wallet, and deployment configuration. It provides a convenient interface for creating deployment
 * transactions that can be sent, simulated, or proven.
 *
 * This class is particularly useful for non-TypeScript users or when deploying contracts programmatically
 * without generated contract types. For TypeScript projects with generated contract types, you can also
 * use the static `Contract.deploy()` method.
 *
 * @example
 * ```typescript
 * // Deploy a contract with constructor arguments
 * const deployer = new ContractDeployer(artifact, wallet);
 * const deployMethod = deployer.deploy(arg1, arg2);
 *
 * // Send the deployment transaction
 * const sentTx = deployMethod.send({ from: wallet.getAddress() });
 * const receipt = await sentTx.wait();
 * const contract = receipt.contract;
 *
 * // Or use the deployed() shorthand
 * const contract = await sentTx.deployed();
 * ```
 *
 * @example
 * ```typescript
 * // Deploy with custom address derivation using public keys
 * const deployer = new ContractDeployer(artifact, wallet, publicKeys);
 * const tx = deployer.deploy(constructorArgs).send({ from: wallet.getAddress() });
 * ```
 */
export class ContractDeployer {
  /**
   * Creates a new ContractDeployer instance.
   *
   * @param artifact - The compiled contract artifact containing the contract's ABI, bytecode, and metadata.
   * @param wallet - The wallet to use for signing and sending the deployment transaction.
   * @param publicKeys - Optional public keys to use for deriving the contract address. If not provided, default keys are used.
   * @param constructorName - Optional name of a specific constructor function to call. If not provided, the default constructor is used.
   */
  constructor(
    private artifact: ContractArtifact,
    private wallet: Wallet,
    private publicKeys?: PublicKeys,
    private constructorName?: string,
  ) {}

  /**
   * Creates a DeployMethod instance for deploying the contract with the specified constructor arguments.
   *
   * @remarks
   * This method prepares a deployment transaction but does not execute it immediately. The returned
   * DeployMethod provides several ways to interact with the deployment:
   * - `.send()` - Send the deployment transaction to the network
   * - `.simulate()` - Simulate the deployment to estimate gas and check for errors
   * - `.prove()` - Generate a proof for the deployment transaction
   * - `.register()` - Register the contract instance locally without deploying
   *
   * The deployment process involves three potential steps:
   * 1. Publishing the contract class (if not already published)
   * 2. Publishing the contract instance (if deploying publicly)
   * 3. Initializing the contract (calling the constructor)
   *
   * Each step can be controlled via deployment options. See {@link DeployOptions} for details.
   *
   * @param args - Constructor arguments for the contract. Must match the constructor's parameter types and order.
   * @returns A DeployMethod instance that can be configured and executed.
   *
   * @example
   * ```typescript
   * // Simple deployment
   * const deployMethod = deployer.deploy(initialValue, owner);
   * const contract = await deployMethod.send({ from: wallet.getAddress() }).deployed();
   * ```
   *
   * @example
   * ```typescript
   * // Deployment with custom options
   * const deployMethod = deployer.deploy(constructorArgs);
   * const tx = deployMethod.send({
   *   from: wallet.getAddress(),
   *   contractAddressSalt: Fr.random(), // Custom salt for address derivation
   *   skipClassPublication: true, // Skip class publication if already published
   *   fee: { estimateGas: true } // Estimate and use appropriate gas limits
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Simulate before deploying
   * const simulation = await deployMethod.simulate({
   *   from: wallet.getAddress(),
   *   fee: { estimateGas: true }
   * });
   * console.log('Estimated gas:', simulation.estimatedGas);
   * ```
   */
  public deploy(...args: any[]) {
    const postDeployCtor = (address: AztecAddress, wallet: Wallet) => Contract.at(address, this.artifact, wallet);
    return new DeployMethod(
      this.publicKeys ?? PublicKeys.default(),
      this.wallet,
      this.artifact,
      postDeployCtor,
      args,
      this.constructorName,
    );
  }
}
