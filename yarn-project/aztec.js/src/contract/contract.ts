import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { PublicKeys } from '@aztec/stdlib/keys';

import type { Wallet } from '../wallet/wallet.js';
import { ContractBase } from './contract_base.js';
import { DeployMethod } from './deploy_method.js';

/**
 * Represents a deployed Aztec smart contract with methods for interaction and transaction creation.
 *
 * @remarks
 * The Contract class provides a high-level interface for interacting with deployed contracts on Aztec.
 * It automatically creates typed methods for each function in the contract's ABI, allowing you to:
 * - Call private, public, and utility functions
 * - Send transactions and wait for confirmation
 * - Simulate function execution and estimate gas costs
 * - Query contract state
 *
 * Key features:
 * - **Type-safe methods**: Each contract function becomes a callable method
 * - **Flexible execution**: Send, simulate, or prove transactions
 * - **Gas estimation**: Estimate costs before sending
 * - **Event querying**: Retrieve emitted events
 * - **Multi-wallet support**: Switch between wallets with `withWallet()`
 *
 * Contracts are typically created in one of two ways:
 * 1. Deploy a new contract using `Contract.deploy()`
 * 2. Attach to an existing contract using `Contract.at()`
 *
 * @example
 * ```typescript
 * // Attach to an existing contract
 * const contract = await Contract.at(
 *   contractAddress,
 *   contractArtifact,
 *   wallet
 * );
 *
 * // Call a private function
 * const tx = contract.methods.transfer(recipient, amount).send();
 * const receipt = await tx.wait();
 *
 * // Call a public function
 * const publicTx = contract.methods.publicMint(to, amount).send();
 * await publicTx.wait();
 *
 * // Simulate before sending
 * const simulation = await contract.methods.complexOperation(args)
 *   .simulate({ from: wallet.getAddress() });
 * console.log('Result:', simulation.result);
 * console.log('Gas estimate:', simulation.estimatedGas);
 * ```
 *
 * @example
 * ```typescript
 * // Deploy a new contract
 * const deployTx = Contract.deploy(
 *   wallet,
 *   artifact,
 *   [constructorArg1, constructorArg2]
 * ).send({ from: wallet.getAddress() });
 *
 * const contract = await deployTx.deployed();
 * console.log('Deployed at:', contract.address.toString());
 * ```
 *
 * @example
 * ```typescript
 * // Use with different wallets
 * const contract1 = await Contract.at(address, artifact, wallet1);
 * await contract1.methods.mint(amount).send();
 *
 * const contract2 = contract1.withWallet(wallet2);
 * await contract2.methods.transfer(recipient, amount).send();
 * ```
 *
 * @example
 * ```typescript
 * // Gas estimation and optimization
 * const simulation = await contract.methods.expensiveOperation()
 *   .simulate({
 *     from: wallet.getAddress(),
 *     fee: { estimateGas: true }
 *   });
 *
 * if (simulation.estimatedGas.gasLimits.l2Gas > 1000000) {
 *   console.warn('Operation requires high gas!');
 * }
 *
 * // Send with estimated gas
 * const tx = contract.methods.expensiveOperation().send({
 *   from: wallet.getAddress(),
 *   fee: {
 *     gasSettings: {
 *       gasLimits: simulation.estimatedGas.gasLimits
 *     }
 *   }
 * });
 * ```
 */
export class Contract extends ContractBase {
  /**
   * Creates a Contract instance connected to an existing deployed contract.
   *
   * @remarks
   * This is the primary method for connecting to contracts that are already deployed on the
   * Aztec network. It registers the contract with the wallet's PXE (if not already registered)
   * and returns a fully functional contract interface.
   *
   * The contract artifact must match the deployed contract's code. Using a mismatched artifact
   * will result in errors when calling contract methods.
   *
   * @param address - The on-chain address of the deployed contract
   * @param artifact - The contract's compiled artifact (ABI, bytecode, and metadata)
   * @param wallet - The wallet to use for transaction signing and execution
   * @returns A Contract instance ready for method calls
   *
   * @example
   * ```typescript
   * const contract = await Contract.at(
   *   AztecAddress.fromString('0x123...'),
   *   TokenContractArtifact,
   *   wallet
   * );
   *
   * const balance = await contract.methods.balanceOf(owner).simulate();
   * ```
   */
  public static async at(address: AztecAddress, artifact: ContractArtifact, wallet: Wallet): Promise<Contract> {
    const instance = await wallet.registerContract(address, artifact);
    return new Contract(instance, artifact, wallet);
  }

  /**
   * Creates a deployment method for deploying a new instance of this contract.
   *
   * @remarks
   * This method prepares a contract deployment with the specified constructor arguments.
   * The returned DeployMethod provides options to send, simulate, or prove the deployment.
   *
   * The deployment process includes:
   * 1. Publishing the contract class (if not already published)
   * 2. Publishing the contract instance (for public execution)
   * 3. Calling the constructor to initialize the contract
   *
   * @param wallet - The wallet to use for deployment transaction signing and execution
   * @param artifact - The contract's compiled artifact
   * @param args - Arguments to pass to the contract's constructor
   * @param constructorName - Optional name of a specific constructor to call
   * @returns A DeployMethod that can be configured and executed
   *
   * @example
   * ```typescript
   * const deployMethod = Contract.deploy(
   *   wallet,
   *   TokenContractArtifact,
   *   [name, symbol, decimals]
   * );
   *
   * const deployTx = deployMethod.send({ from: wallet.getAddress() });
   * const contract = await deployTx.deployed();
   * ```
   */
  public static deploy(wallet: Wallet, artifact: ContractArtifact, args: any[], constructorName?: string) {
    const postDeployCtor = (address: AztecAddress, wallet: Wallet) => Contract.at(address, artifact, wallet);
    return new DeployMethod(PublicKeys.default(), wallet, artifact, postDeployCtor, args, constructorName);
  }

  /**
   * Creates a deployment method using specific public keys for address derivation.
   *
   * @remarks
   * This advanced deployment method allows you to specify the public keys used to derive
   * the contract address. This is useful for:
   * - Creating contracts with predictable addresses
   * - Deploying contracts controlled by specific key pairs
   * - Implementing custom address derivation schemes
   *
   * The contract address is deterministically derived from:
   * - The public keys (or their hash)
   * - The contract class ID
   * - The constructor arguments
   * - The deployment salt
   *
   * @param publicKeys - Public keys to use for address derivation
   * @param wallet - The wallet for deployment transaction execution
   * @param artifact - The contract's compiled artifact
   * @param args - Constructor arguments
   * @param constructorName - Optional specific constructor name
   * @returns A DeployMethod configured with the specified public keys
   *
   * @example
   * ```typescript
   * const publicKeys = PublicKeys.from({
   *   masterNullifierPublicKey: npkM,
   *   masterIncomingViewingPublicKey: ivpkM,
   *   masterOutgoingViewingPublicKey: ovpkM,
   *   masterTaggingPublicKey: tpkM
   * });
   *
   * const deployMethod = Contract.deployWithPublicKeys(
   *   publicKeys,
   *   wallet,
   *   artifact,
   *   [constructorArgs]
   * );
   * ```
   */
  public static deployWithPublicKeys(
    publicKeys: PublicKeys,
    wallet: Wallet,
    artifact: ContractArtifact,
    args: any[],
    constructorName?: string,
  ) {
    const postDeployCtor = (address: AztecAddress, wallet: Wallet) => Contract.at(address, artifact, wallet);
    return new DeployMethod(publicKeys, wallet, artifact, postDeployCtor, args, constructorName);
  }
}
