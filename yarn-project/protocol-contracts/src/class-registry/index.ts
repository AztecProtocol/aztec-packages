/**
 * Contract Class Registry - Protocol contract for registering and managing contract classes.
 *
 * @module class-registry
 *
 * @description
 * The ContractClassRegistry is a fundamental protocol contract in Aztec that serves as the
 * on-chain registry for all contract classes. It maintains a record of every contract class
 * that has been deployed to the network, including their bytecode, metadata, and verification keys.
 *
 * ## Role in the Protocol
 *
 * The class registry performs several critical functions:
 * - **Class Registration**: Records new contract classes when they are first deployed
 * - **Bytecode Storage**: Stores the compiled bytecode (both private and public) for each class
 * - **Function Broadcasting**: Publishes private function bytecode and utility functions
 * - **Verification Key Management**: Tracks VKs for private function execution
 * - **Metadata Tracking**: Maintains artifact hashes and function roots
 *
 * ## Relationship to Other Contracts
 *
 * The ContractClassRegistry works in conjunction with the ContractInstanceRegistry:
 * - **Class Registry**: Defines WHAT contracts can do (the code)
 * - **Instance Registry**: Defines WHERE contracts are deployed (the instances)
 *
 * When deploying a contract:
 * 1. First, the contract class is registered here (if not already registered)
 * 2. Then, an instance is created in the ContractInstanceRegistry
 * 3. Multiple instances can share the same contract class
 *
 * ## Events
 *
 * The registry emits several types of events:
 * - `ContractClassPublishedEvent`: When a new class is registered
 * - `PrivateFunctionBroadcastedEvent`: When private function bytecode is published
 * - `UtilityFunctionBroadcastedEvent`: When utility function bytecode is published
 *
 * ## Security Considerations
 *
 * - Contract classes are immutable once published - the registry never allows updates
 * - All bytecode is cryptographically committed via hashes
 * - The registry validates that class IDs match their content before acceptance
 * - Private function membership proofs ensure bytecode integrity
 *
 * @example
 * ```typescript
 * import { getCanonicalClassRegistry } from '@aztec/protocol-contracts/class-registry';
 *
 * // Get the canonical class registry
 * const registry = await getCanonicalClassRegistry();
 * console.log('Class Registry Address:', registry.address.toString());
 *
 * // Access the contract artifact
 * const artifact = registry.artifact;
 * console.log('Functions:', artifact.functions.map(f => f.name));
 * ```
 *
 * @example
 * ```typescript
 * import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
 *
 * // Parse a class registration event from logs
 * const event = ContractClassPublishedEvent.fromLog(log);
 * console.log('New class registered:', event.contractClassId.toString());
 * console.log('Artifact hash:', event.artifactHash.toString());
 *
 * // Convert to a full contract class object
 * const contractClass = await event.toContractClassPublic();
 * ```
 */

import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import ContractClassRegistryJson from '../../artifacts/ContractClassRegistry.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_class_published_event.js';
export * from './private_function_broadcasted_event.js';
export * from './utility_function_broadcasted_event.js';

/**
 * The compiled artifact for the ContractClassRegistry protocol contract.
 *
 * This artifact contains all the information needed to interact with the class registry,
 * including the ABI, function signatures, and bytecode.
 */
export const ContractClassRegistryArtifact = loadContractArtifact(ContractClassRegistryJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/**
 * Returns the canonical deployment of the ContractClassRegistry protocol contract.
 *
 * This function provides access to the singleton instance of the class registry that is
 * deployed at a well-known address in the Aztec network. The registry is used to register
 * and query contract classes throughout the protocol.
 *
 * The result is cached after the first call for performance.
 *
 * @returns A Promise resolving to the ProtocolContract object for the class registry
 *
 * @example
 * ```typescript
 * import { getCanonicalClassRegistry } from '@aztec/protocol-contracts/class-registry';
 *
 * // Access the class registry
 * const registry = await getCanonicalClassRegistry();
 *
 * // Use the registry address
 * console.log('Registry at:', registry.address.toString());
 *
 * // Access contract class information
 * console.log('Class ID:', registry.contractClass.id.toString());
 * ```
 */
export async function getCanonicalClassRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const artifact = ContractClassRegistryArtifact;
    protocolContract = await makeProtocolContract('ContractClassRegistry', artifact);
  }
  return protocolContract;
}
