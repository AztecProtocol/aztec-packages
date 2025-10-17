import type { ProtocolContract } from '../protocol_contract.js';
import type { ProtocolContractName } from '../protocol_contract_data.js';

/**
 * Provider interface for accessing protocol contract artifacts and deployments.
 *
 * @description
 * The ProtocolContractsProvider interface defines a standard way to access protocol
 * contracts and their metadata. Implementations of this interface can load contracts
 * from different sources (bundled artifacts, remote servers, etc.) while providing
 * a consistent API for consumers.
 *
 * ## Purpose
 *
 * This abstraction serves several purposes:
 * - **Flexibility**: Allows different loading strategies (bundled, lazy, remote)
 * - **Testability**: Easy to mock for testing
 * - **Modularity**: Separates contract access from implementation details
 * - **Extensibility**: New sources can be added without changing consumers
 *
 * ## Implementations
 *
 * Common implementations include:
 * - **BundledProtocolContractsProvider**: Loads from bundled JSON artifacts
 * - **LazyProtocolContractsProvider**: Lazily loads artifacts on first access
 * - **RemoteProtocolContractsProvider**: Fetches from remote servers (if needed)
 *
 * ## Usage Pattern
 *
 * The provider is typically used as a dependency injection mechanism:
 * 1. Create a provider instance with appropriate configuration
 * 2. Pass the provider to components that need protocol contracts
 * 3. Components call the provider to get contracts as needed
 * 4. Provider handles caching and optimization internally
 *
 * @example
 * ```typescript
 * import { ProtocolContractsProvider } from '@aztec/protocol-contracts';
 * import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/provider';
 *
 * // Create a provider instance
 * const provider: ProtocolContractsProvider = new BundledProtocolContractsProvider();
 *
 * // Access protocol contracts through the provider
 * const feeJuice = await provider.getProtocolContractArtifact('FeeJuice');
 * console.log('FeeJuice address:', feeJuice.address.toString());
 *
 * const classRegistry = await provider.getProtocolContractArtifact('ContractClassRegistry');
 * console.log('Class Registry address:', classRegistry.address.toString());
 * ```
 */
export interface ProtocolContractsProvider {
  /**
   * Retrieves the canonical deployment of a protocol contract by name.
   *
   * This method returns a complete ProtocolContract object containing the contract's
   * artifact, address, class information, and deployment details. The specific loading
   * mechanism depends on the provider implementation.
   *
   * @param name - The name of the protocol contract to retrieve
   * @returns A Promise resolving to the ProtocolContract object
   *
   * @remarks
   * Valid protocol contract names include:
   * - 'AuthRegistry' - Authentication and authorization witness registry
   * - 'ContractClassRegistry' - Contract class registration and storage
   * - 'ContractInstanceRegistry' - Contract instance deployment tracking
   * - 'FeeJuice' - Native gas token contract
   * - 'MultiCallEntrypoint' - Batch transaction execution
   * - 'Router' - Transaction routing and delegation
   *
   * Implementations should cache results for performance and ensure the same
   * contract instance is returned on repeated calls for the same name.
   *
   * @example
   * ```typescript
   * // Using a provider to access multiple protocol contracts
   * const provider: ProtocolContractsProvider = new BundledProtocolContractsProvider();
   *
   * // Get the FeeJuice token contract
   * const feeJuice = await provider.getProtocolContractArtifact('FeeJuice');
   * console.log('FeeJuice deployed at:', feeJuice.address.toString());
   *
   * // Get the MultiCallEntrypoint for batching
   * const entrypoint = await provider.getProtocolContractArtifact('MultiCallEntrypoint');
   * console.log('Entrypoint at:', entrypoint.address.toString());
   * ```
   */
  getProtocolContractArtifact(name: ProtocolContractName): Promise<ProtocolContract>;
}
