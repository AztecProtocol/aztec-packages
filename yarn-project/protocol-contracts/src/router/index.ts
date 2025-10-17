/**
 * Router - Protocol contract for routing and delegating transaction execution.
 *
 * @module router
 *
 * @description
 * The Router is a core protocol contract in Aztec that handles the routing and delegation
 * of contract calls. It acts as an intermediary that directs transactions to their
 * appropriate destination contracts and manages the execution flow within the protocol.
 *
 * ## Role in the Protocol
 *
 * The router performs several critical routing functions:
 * - **Call Delegation**: Routes calls to the correct contract implementations
 * - **Execution Flow**: Manages the control flow for complex transaction execution
 * - **Contract Discovery**: Resolves contract addresses and implementations
 * - **Upgrade Support**: Handles routing to upgraded contract implementations
 * - **Protocol Integration**: Coordinates between different protocol contracts
 *
 * ## Routing Mechanism
 *
 * The router operates as a central dispatcher:
 * 1. Receives an incoming call with a target address
 * 2. Queries the ContractInstanceRegistry to resolve the instance
 * 3. Looks up the contract class from the ContractClassRegistry
 * 4. Delegates execution to the appropriate contract code
 * 5. Returns the result to the caller
 *
 * ## Relationship to Other Contracts
 *
 * The router integrates closely with other protocol components:
 * - **ContractInstanceRegistry**: Queries instance data and addresses
 * - **ContractClassRegistry**: Retrieves contract class implementations
 * - **MultiCallEntrypoint**: May be used by the entrypoint for batched calls
 * - **User Contracts**: Routes all user contract invocations
 * - **Upgrade Mechanism**: Handles routing to upgraded implementations
 *
 * ## Use Cases
 *
 * The router is essential for:
 * - **Contract Calls**: All inter-contract calls may flow through the router
 * - **Upgradeable Contracts**: Routes to current implementation after upgrades
 * - **Proxy Patterns**: Enables proxy-based contract patterns
 * - **Protocol Coordination**: Orchestrates interactions between protocol contracts
 * - **Dynamic Dispatch**: Resolves calls based on current contract state
 *
 * ## Execution Model
 *
 * When routing a call:
 * 1. Caller invokes the router with target address and function selector
 * 2. Router resolves the target contract's current implementation
 * 3. Execution is delegated to the implementation contract
 * 4. The implementation executes in the context of the target instance
 * 5. Results are returned through the router to the original caller
 *
 * ## Upgrade Handling
 *
 * The router plays a crucial role in contract upgrades:
 * - Automatically routes to the current contract class ID
 * - No code changes needed when contracts upgrade
 * - Maintains a stable interface despite implementation changes
 * - Preserves storage layout and contract state
 *
 * ## Security Considerations
 *
 * - Router does not modify caller authorization
 * - Execution occurs with the original caller's permissions
 * - Cannot bypass access controls of target contracts
 * - Validates contract existence before routing
 * - Protects against unauthorized upgrades through registry checks
 *
 * ## Performance Considerations
 *
 * - Adds overhead for registry lookups on each routed call
 * - Caching strategies may optimize repeated calls to same contracts
 * - Direct calls bypass the router for maximum efficiency
 * - Router is essential only for upgradeable or dynamic dispatch patterns
 *
 * @example
 * ```typescript
 * import { getCanonicalRouter } from '@aztec/protocol-contracts/router';
 *
 * // Get the canonical router contract
 * const router = await getCanonicalRouter();
 * console.log('Router Address:', router.address.toString());
 *
 * // Access the router's ABI
 * const artifact = router.artifact;
 * console.log('Router functions:', artifact.functions.map(f => f.name));
 * ```
 *
 * @example
 * ```typescript
 * // Conceptual example of router usage
 * import { getCanonicalRouter } from '@aztec/protocol-contracts/router';
 * import { AztecAddress } from '@aztec/stdlib/aztec-address';
 *
 * const router = await getCanonicalRouter();
 * const targetContract = AztecAddress.fromString('0x...');
 *
 * // The router resolves the current implementation
 * // and delegates the call appropriately
 * // This happens automatically in the protocol
 * ```
 */

import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import RouterJson from '../../artifacts/Router.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

/**
 * The compiled artifact for the Router protocol contract.
 *
 * This artifact contains the ABI and bytecode for routing and delegating
 * contract calls throughout the Aztec network.
 */
export const RouterArtifact = loadContractArtifact(RouterJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/**
 * Returns the canonical deployment of the Router protocol contract.
 *
 * This function provides access to the singleton router instance deployed at
 * a well-known address. The router is used throughout the protocol to delegate
 * calls to appropriate contract implementations.
 *
 * The result is cached after the first call for performance.
 *
 * @returns A Promise resolving to the ProtocolContract object for the router
 *
 * @example
 * ```typescript
 * import { getCanonicalRouter } from '@aztec/protocol-contracts/router';
 *
 * // Access the router contract
 * const router = await getCanonicalRouter();
 *
 * // Get the router's address
 * console.log('Router at:', router.address.toString());
 *
 * // Access contract information
 * console.log('Router class ID:', router.contractClass.id.toString());
 * ```
 */
export async function getCanonicalRouter(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('Router', RouterArtifact);
  }
  return protocolContract;
}
