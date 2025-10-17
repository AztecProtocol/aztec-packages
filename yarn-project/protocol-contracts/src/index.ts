/**
 * @packageDocumentation
 * @module @aztec/protocol-contracts
 *
 * # Aztec Protocol Contracts
 *
 * This package provides access to the core protocol contracts that are fundamental to the
 * operation of the Aztec network. These system-level contracts are deployed at predetermined
 * addresses and provide essential infrastructure for contract deployment, fee payment,
 * transaction routing, and more.
 *
 * ## Overview
 *
 * Protocol contracts are special system contracts that:
 * - Are deployed at deterministic, well-known addresses
 * - Are part of the protocol specification itself
 * - Provide core functionality required by the network
 * - Are automatically trusted by all network participants
 * - Cannot be modified by regular users
 *
 * ## Core Protocol Contracts
 *
 * ### ContractClassRegistry
 * Manages the registration and storage of contract classes (the code templates).
 * - Stores contract bytecode and metadata
 * - Assigns unique class IDs
 * - Broadcasts private function code
 * - Enables code reuse across multiple deployments
 *
 * ### ContractInstanceRegistry
 * Manages the deployment and lifecycle of contract instances.
 * - Records contract deployments
 * - Maps addresses to contract classes
 * - Tracks contract upgrades
 * - Associates public keys with instances
 *
 * ### FeeJuice
 * The native gas token used for paying transaction fees.
 * - Only accepted currency for fees
 * - Compensates sequencers
 * - Provides anti-spam protection
 * - Stored efficiently in public state
 *
 * ### MultiCallEntrypoint
 * Enables batching multiple contract calls into a single transaction.
 * - Improves gas efficiency
 * - Ensures atomicity
 * - Simplifies complex workflows
 * - Reduces user friction
 *
 * ### Router
 * Routes and delegates contract calls to appropriate implementations.
 * - Enables upgradeable contracts
 * - Manages proxy patterns
 * - Coordinates protocol interactions
 * - Supports dynamic dispatch
 *
 * ### AuthRegistry
 * Manages authentication witnesses and authorization proofs.
 * - Enables account abstraction
 * - Validates signatures and proofs
 * - Prevents replay attacks
 * - Supports delegation patterns
 *
 * ## Architecture
 *
 * ### Class vs Instance Model
 *
 * Aztec uses a two-level model for contracts:
 * - **Contract Class**: The code, ABI, and bytecode (registered once, shared by many)
 * - **Contract Instance**: A specific deployment with an address and state (unique)
 *
 * This separation enables:
 * - Efficient code reuse (many instances, one class)
 * - Upgradeable contracts (change class, keep address)
 * - Smaller on-chain footprint
 * - Optimized verification
 *
 * ### Deployment Flow
 *
 * When deploying a contract:
 * 1. Register the contract class in ContractClassRegistry (if new)
 * 2. Create an instance in ContractInstanceRegistry with a unique address
 * 3. Initialize the contract state
 * 4. Begin accepting transactions
 *
 * ### Transaction Flow
 *
 * When executing a transaction:
 * 1. User pays fees in FeeJuice
 * 2. Authorization is validated via AuthRegistry
 * 3. Router directs calls to appropriate contracts
 * 4. MultiCallEntrypoint batches calls if needed
 * 5. Contract code executes
 * 6. Sequencer receives fee payment
 *
 * ## Usage
 *
 * @example
 * ```typescript
 * import {
 *   getCanonicalFeeJuice,
 *   getCanonicalClassRegistry,
 *   getCanonicalInstanceRegistry,
 *   ProtocolContractAddress
 * } from '@aztec/protocol-contracts';
 *
 * // Access protocol contracts
 * const feeJuice = await getCanonicalFeeJuice();
 * console.log('FeeJuice at:', feeJuice.address.toString());
 *
 * // Check if an address is a protocol contract
 * import { isProtocolContract } from '@aztec/protocol-contracts';
 * const isFeeJuice = isProtocolContract(ProtocolContractAddress.FeeJuice);
 * ```
 *
 * @example
 * ```typescript
 * // Parse events from protocol contracts
 * import {
 *   ContractClassPublishedEvent,
 *   ContractInstancePublishedEvent
 * } from '@aztec/protocol-contracts';
 *
 * // Parse a class registration event
 * const classEvent = ContractClassPublishedEvent.fromLog(log);
 * console.log('New class:', classEvent.contractClassId.toString());
 *
 * // Parse a deployment event
 * const instanceEvent = ContractInstancePublishedEvent.fromLog(privateLog);
 * console.log('Deployed at:', instanceEvent.address.toString());
 * ```
 *
 * @example
 * ```typescript
 * // Use the protocol contracts provider
 * import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/provider';
 *
 * const provider = new BundledProtocolContractsProvider();
 * const router = await provider.getProtocolContractArtifact('Router');
 * console.log('Router artifact:', router.artifact.functions);
 * ```
 *
 * ## Package Structure
 *
 * - `/auth-registry` - Authentication and authorization
 * - `/class-registry` - Contract class management
 * - `/instance-registry` - Contract instance deployment
 * - `/fee-juice` - Native gas token
 * - `/multi-call-entrypoint` - Batch transaction execution
 * - `/router` - Call routing and delegation
 * - `/provider` - Protocol contract providers
 *
 * ## Key Concepts
 *
 * ### Protocol Contract Addresses
 * All protocol contracts are deployed at deterministic addresses defined in the
 * protocol specification. These addresses are the same across all Aztec networks.
 *
 * ### Canonical Deployments
 * Each protocol contract has exactly one "canonical" deployment that is used
 * throughout the network. These are accessed via the `getCanonical*` functions.
 *
 * ### Event-Driven Architecture
 * Protocol contracts emit events for important state changes. Nodes listen to
 * these events to stay synchronized with the network state.
 *
 * ### Immutability vs Upgradability
 * - Contract classes are immutable once published
 * - Contract instances can be upgraded to new classes
 * - Protocol contracts themselves follow strict upgrade procedures
 */

export * from './protocol_contract.js';
export * from './protocol_contract_data.js';
