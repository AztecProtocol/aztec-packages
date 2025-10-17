/**
 * Contract Instance Registry - Protocol contract for deploying and managing contract instances.
 *
 * @module instance-registry
 *
 * @description
 * The ContractInstanceRegistry is a core protocol contract in Aztec that manages the deployment
 * and lifecycle of contract instances. While the ContractClassRegistry defines what contracts
 * can do (the code), this registry tracks where contracts are deployed and their specific
 * configuration (the instances).
 *
 * ## Role in the Protocol
 *
 * The instance registry performs several essential functions:
 * - **Instance Deployment**: Records new contract deployments with their addresses
 * - **Address Management**: Maintains the mapping between addresses and contract configurations
 * - **Public Key Association**: Tracks encryption and nullifying keys for each instance
 * - **Class Association**: Links each instance to its contract class
 * - **Upgrade Tracking**: Records contract upgrades when instances change their implementation
 *
 * ## Relationship to Other Contracts
 *
 * The ContractInstanceRegistry is tightly coupled with other protocol contracts:
 * - **ContractClassRegistry**: Instance registry references classes registered in the class registry
 * - **Router**: The router uses instance data to route calls to the correct contract code
 * - **Deployers**: Various deployer contracts interact with this registry during deployment
 *
 * ## Instance vs Class
 *
 * Understanding the distinction is crucial:
 * - **Contract Class**: The blueprint (code, ABI, bytecode) - registered once, reused many times
 * - **Contract Instance**: A specific deployment (address, salt, keys) - unique to each deployment
 *
 * Example: An ERC20 token contract class might have thousands of instances (USDC, DAI, etc.),
 * each with its own address and state, but all sharing the same code.
 *
 * ## Deployment Flow
 *
 * When deploying a contract:
 * 1. Contract class is registered in ContractClassRegistry (if not already present)
 * 2. A ContractInstancePublishedEvent is emitted containing:
 *    - The computed contract address
 *    - The class ID this instance implements
 *    - Salt and initialization hash
 *    - Public keys for the contract
 * 3. The instance is recorded in this registry
 *
 * ## Contract Upgrades
 *
 * The registry supports contract upgrades:
 * - Instances can change their implementation (class ID) while keeping the same address
 * - ContractInstanceUpdatedEvent is emitted when an upgrade occurs
 * - Upgrade history is preserved on-chain
 *
 * ## Events
 *
 * - `ContractInstancePublishedEvent`: Emitted when a new instance is deployed
 * - `ContractInstanceUpdatedEvent`: Emitted when an instance upgrades its implementation
 *
 * ## Security Considerations
 *
 * - Instance addresses are deterministically computed from salt and initialization parameters
 * - Public keys are immutably bound to each instance at deployment
 * - The registry enforces that only the deployer can publish an instance
 * - Upgrades must be authorized by the contract itself
 *
 * @example
 * ```typescript
 * import { getCanonicalInstanceRegistry } from '@aztec/protocol-contracts/instance-registry';
 *
 * // Get the canonical instance registry
 * const registry = await getCanonicalInstanceRegistry();
 * console.log('Instance Registry Address:', registry.address.toString());
 *
 * // Access registry functions
 * const artifact = registry.artifact;
 * console.log('Available functions:', artifact.functions.map(f => f.name));
 * ```
 *
 * @example
 * ```typescript
 * import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
 *
 * // Parse a deployment event from logs
 * const event = ContractInstancePublishedEvent.fromLog(privateLog);
 * console.log('Contract deployed at:', event.address.toString());
 * console.log('Implements class:', event.contractClassId.toString());
 * console.log('Deployed by:', event.deployer.toString());
 *
 * // Convert to a contract instance object
 * const instance = event.toContractInstance();
 * console.log('Instance version:', instance.version);
 * ```
 *
 * @example
 * ```typescript
 * import { ContractInstanceUpdatedEvent } from '@aztec/protocol-contracts/instance-registry';
 *
 * // Parse a contract upgrade event
 * const upgradeEvent = ContractInstanceUpdatedEvent.fromLog(publicLog);
 * console.log('Contract upgraded:', upgradeEvent.address.toString());
 * console.log('Old class:', upgradeEvent.prevContractClassId.toString());
 * console.log('New class:', upgradeEvent.newContractClassId.toString());
 * console.log('Upgrade timestamp:', upgradeEvent.timestampOfChange);
 * ```
 */

import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import ContractInstanceRegistryJson from '../../artifacts/ContractInstanceRegistry.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_instance_published_event.js';
export * from './contract_instance_updated_event.js';

/**
 * The compiled artifact for the ContractInstanceRegistry protocol contract.
 *
 * This artifact contains all the information needed to interact with the instance registry,
 * including the ABI for publishing instances and querying instance data.
 */
export const ContractInstanceRegistryArtifact = loadContractArtifact(
  ContractInstanceRegistryJson as NoirCompiledContract,
);

let protocolContract: ProtocolContract;

/**
 * Returns the canonical deployment of the ContractInstanceRegistry protocol contract.
 *
 * This function provides access to the singleton instance of the contract instance registry
 * deployed at a well-known address in the Aztec network. The registry is used throughout
 * the protocol to deploy new contracts and query existing contract instances.
 *
 * The result is cached after the first call for performance.
 *
 * @returns A Promise resolving to the ProtocolContract object for the instance registry
 *
 * @example
 * ```typescript
 * import { getCanonicalInstanceRegistry } from '@aztec/protocol-contracts/instance-registry';
 *
 * // Access the instance registry
 * const registry = await getCanonicalInstanceRegistry();
 *
 * // Use the registry address for transactions
 * console.log('Instance Registry at:', registry.address.toString());
 *
 * // Query instance information
 * const instance = registry.instance;
 * console.log('Registry class ID:', instance.currentContractClassId.toString());
 * ```
 */
export async function getCanonicalInstanceRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('ContractInstanceRegistry', ContractInstanceRegistryArtifact);
  }
  return protocolContract;
}
