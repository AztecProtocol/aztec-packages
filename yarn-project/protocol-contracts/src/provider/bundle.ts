import type { ContractArtifact } from '@aztec/stdlib/abi';

import { AuthRegistryArtifact } from '../auth-registry/index.js';
import { ContractClassRegistryArtifact } from '../class-registry/index.js';
import { FeeJuiceArtifact } from '../fee-juice/index.js';
import { ContractInstanceRegistryArtifact } from '../instance-registry/index.js';
import { makeProtocolContract } from '../make_protocol_contract.js';
import { MultiCallEntrypointArtifact } from '../multi-call-entrypoint/index.js';
import type { ProtocolContract } from '../protocol_contract.js';
import type { ProtocolContractName } from '../protocol_contract_data.js';
import { RouterArtifact } from '../router/index.js';
import type { ProtocolContractsProvider } from './protocol_contracts_provider.js';

/**
 * Mapping of protocol contract names to their compiled artifacts.
 *
 * This record provides direct access to all protocol contract artifacts that are
 * bundled with the package. Each artifact contains the complete contract definition
 * including ABI, bytecode, storage layout, and metadata.
 *
 * @remarks
 * These artifacts are loaded synchronously at module initialization time, making them
 * immediately available for use. This is the most performant approach for environments
 * where all protocol contracts are needed.
 *
 * @example
 * ```typescript
 * import { ProtocolContractArtifact } from '@aztec/protocol-contracts/provider';
 *
 * // Direct access to protocol contract artifacts
 * const feeJuiceArtifact = ProtocolContractArtifact.FeeJuice;
 * console.log('FeeJuice functions:', feeJuiceArtifact.functions.map(f => f.name));
 *
 * const routerArtifact = ProtocolContractArtifact.Router;
 * console.log('Router bytecode size:', routerArtifact.bytecode.length);
 * ```
 */
export const ProtocolContractArtifact: Record<ProtocolContractName, ContractArtifact> = {
  AuthRegistry: AuthRegistryArtifact,
  ContractInstanceRegistry: ContractInstanceRegistryArtifact,
  ContractClassRegistry: ContractClassRegistryArtifact,
  MultiCallEntrypoint: MultiCallEntrypointArtifact,
  FeeJuice: FeeJuiceArtifact,
  Router: RouterArtifact,
};

/**
 * Provider implementation that loads protocol contracts from bundled artifacts.
 *
 * @description
 * The BundledProtocolContractsProvider is the standard implementation of the
 * ProtocolContractsProvider interface. It loads all protocol contract artifacts
 * that are bundled with the package, providing synchronous access with minimal overhead.
 *
 * ## Characteristics
 *
 * - **Bundled**: All artifacts are included in the package
 * - **Fast**: Artifacts are pre-loaded and immediately available
 * - **Simple**: No configuration or external dependencies required
 * - **Complete**: Includes all protocol contracts
 * - **Standard**: The default provider used throughout the Aztec stack
 *
 * ## Use Cases
 *
 * This provider is ideal for:
 * - Node.js environments with no bundle size constraints
 * - Development and testing
 * - Backend services that need all protocol contracts
 * - CLI tools and scripts
 * - Full node implementations
 *
 * ## Performance
 *
 * - Artifacts are loaded once at module initialization
 * - No async loading overhead
 * - Minimal memory footprint (contracts are small)
 * - Caching is handled by module system
 *
 * @example
 * ```typescript
 * import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/provider';
 *
 * // Create a provider instance
 * const provider = new BundledProtocolContractsProvider();
 *
 * // Access protocol contracts
 * const feeJuice = await provider.getProtocolContractArtifact('FeeJuice');
 * console.log('FeeJuice at:', feeJuice.address.toString());
 *
 * const classRegistry = await provider.getProtocolContractArtifact('ContractClassRegistry');
 * console.log('Class Registry at:', classRegistry.address.toString());
 * ```
 *
 * @example
 * ```typescript
 * // Using the provider in a service
 * import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/provider';
 * import type { ProtocolContractsProvider } from '@aztec/protocol-contracts';
 *
 * class ContractService {
 *   constructor(private provider: ProtocolContractsProvider) {}
 *
 *   async getFeeJuiceAddress() {
 *     const feeJuice = await this.provider.getProtocolContractArtifact('FeeJuice');
 *     return feeJuice.address;
 *   }
 * }
 *
 * // Inject the provider
 * const service = new ContractService(new BundledProtocolContractsProvider());
 * const address = await service.getFeeJuiceAddress();
 * ```
 */
export class BundledProtocolContractsProvider implements ProtocolContractsProvider {
  /**
   * Retrieves a protocol contract by name from the bundled artifacts.
   *
   * This method loads the pre-bundled artifact for the specified contract and
   * constructs a complete ProtocolContract object with address, class, and metadata.
   *
   * @param name - The name of the protocol contract to retrieve
   * @returns A Promise resolving to the ProtocolContract object
   *
   * @remarks
   * Although this method is async for interface compatibility, the actual loading
   * is effectively synchronous since all artifacts are already in memory.
   *
   * @example
   * ```typescript
   * const provider = new BundledProtocolContractsProvider();
   *
   * // Get multiple contracts
   * const [feeJuice, router, entrypoint] = await Promise.all([
   *   provider.getProtocolContractArtifact('FeeJuice'),
   *   provider.getProtocolContractArtifact('Router'),
   *   provider.getProtocolContractArtifact('MultiCallEntrypoint')
   * ]);
   * ```
   */
  getProtocolContractArtifact(name: ProtocolContractName): Promise<ProtocolContract> {
    return makeProtocolContract(name, ProtocolContractArtifact[name]);
  }
}
