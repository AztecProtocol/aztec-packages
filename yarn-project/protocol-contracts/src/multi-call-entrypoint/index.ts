/**
 * Multi-Call Entrypoint - Protocol contract for batching multiple contract calls in a single transaction.
 *
 * @module multi-call-entrypoint
 *
 * @description
 * The MultiCallEntrypoint is a protocol contract that enables users to batch multiple contract
 * calls into a single transaction. This provides significant benefits for user experience,
 * gas efficiency, and atomicity guarantees when performing complex multi-step operations.
 *
 * ## Role in the Protocol
 *
 * The multi-call entrypoint serves several important functions:
 * - **Call Batching**: Combines multiple contract calls into a single transaction
 * - **Atomicity**: Ensures all calls succeed or all fail together
 * - **Gas Efficiency**: Reduces overhead by amortizing fixed costs across calls
 * - **User Experience**: Simplifies complex workflows into single-click operations
 * - **Composability**: Enables complex DeFi operations and cross-contract interactions
 *
 * ## Use Cases
 *
 * Common scenarios where multi-call is valuable:
 * - **Token Approvals + Operations**: Approve and spend in one transaction
 * - **DeFi Workflows**: Swap tokens, provide liquidity, and stake in one go
 * - **Batch Transfers**: Send tokens to multiple recipients atomically
 * - **Contract Setup**: Initialize multiple related contracts together
 * - **Complex Operations**: Chain together dependent contract interactions
 *
 * ## Execution Model
 *
 * When a multi-call is executed:
 * 1. User submits a single transaction to the entrypoint with an array of calls
 * 2. Entrypoint validates all call parameters
 * 3. Executes each call sequentially in order
 * 4. If any call fails, the entire transaction reverts
 * 5. If all succeed, all state changes are committed atomically
 *
 * ## Call Structure
 *
 * Each call in the batch specifies:
 * - **Target Contract**: The address to call
 * - **Function Selector**: Which function to invoke
 * - **Arguments**: The function parameters
 * - **Value**: Optional native token transfer (if applicable)
 *
 * ## Relationship to Other Contracts
 *
 * The MultiCallEntrypoint integrates with:
 * - **Router**: May use the router for call delegation
 * - **FeeJuice**: Single fee payment covers all batched calls
 * - **User Contracts**: Can call any contract in the network
 * - **Authentication**: Executes with the caller's authorization
 *
 * ## Gas Considerations
 *
 * Multi-call provides gas benefits:
 * - **Fixed Costs**: Transaction overhead paid once, not per call
 * - **Storage Optimization**: Shared state root updates
 * - **Proof Generation**: Single proof covers all calls
 * - **Fee Payment**: One fee deduction for the entire batch
 *
 * ## Security Considerations
 *
 * - All calls execute with the original caller's permissions
 * - Entrypoint does not add or remove authorization
 * - Reentrancy protection applies to the entire batch
 * - Failed calls cause the entire transaction to revert
 * - Return data from earlier calls can be used in later calls
 *
 * ## Limitations
 *
 * - Maximum number of calls per batch may be limited by gas
 * - All calls must succeed or the entire transaction fails
 * - Cannot conditionally execute calls based on runtime results
 * - Recursive multi-calls may hit depth limits
 *
 * @example
 * ```typescript
 * import { getCanonicalMultiCallEntrypoint } from '@aztec/protocol-contracts/multi-call-entrypoint';
 *
 * // Get the canonical multi-call entrypoint
 * const entrypoint = await getCanonicalMultiCallEntrypoint();
 * console.log('MultiCall Entrypoint Address:', entrypoint.address.toString());
 *
 * // Access the contract's ABI
 * const artifact = entrypoint.artifact;
 * console.log('Available functions:', artifact.functions.map(f => f.name));
 * ```
 *
 * @example
 * ```typescript
 * // Conceptual example of batching calls
 * import { getCanonicalMultiCallEntrypoint } from '@aztec/protocol-contracts/multi-call-entrypoint';
 *
 * const entrypoint = await getCanonicalMultiCallEntrypoint();
 *
 * // Batch multiple operations together
 * const calls = [
 *   {
 *     to: tokenAddress,
 *     selector: 'approve',
 *     args: [spenderAddress, amount]
 *   },
 *   {
 *     to: dexAddress,
 *     selector: 'swap',
 *     args: [tokenIn, tokenOut, amount]
 *   },
 *   {
 *     to: stakingAddress,
 *     selector: 'stake',
 *     args: [tokenOut, amount]
 *   }
 * ];
 *
 * // All three operations execute atomically
 * // Either all succeed or all fail together
 * ```
 */

import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import MultiCallEntrypointJson from '../../artifacts/MultiCallEntrypoint.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

/**
 * The compiled artifact for the MultiCallEntrypoint protocol contract.
 *
 * This artifact contains the ABI and bytecode for batching multiple calls
 * into a single atomic transaction.
 */
export const MultiCallEntrypointArtifact = loadContractArtifact(MultiCallEntrypointJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/**
 * Returns the canonical deployment of the MultiCallEntrypoint protocol contract.
 *
 * This function provides access to the singleton multi-call entrypoint deployed at
 * a well-known address. The entrypoint is used to batch multiple contract calls
 * into a single atomic transaction.
 *
 * The result is cached after the first call for performance.
 *
 * @returns A Promise resolving to the ProtocolContract object for the multi-call entrypoint
 *
 * @example
 * ```typescript
 * import { getCanonicalMultiCallEntrypoint } from '@aztec/protocol-contracts/multi-call-entrypoint';
 *
 * // Access the multi-call entrypoint
 * const entrypoint = await getCanonicalMultiCallEntrypoint();
 *
 * // Get the contract address
 * console.log('Entrypoint at:', entrypoint.address.toString());
 *
 * // Access the contract artifact
 * const entrypointFunction = entrypoint.artifact.functions.find(f => f.name === 'entrypoint');
 * console.log('Entrypoint function signature:', entrypointFunction.name);
 * ```
 */
export async function getCanonicalMultiCallEntrypoint(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('MultiCallEntrypoint', MultiCallEntrypointArtifact);
  }
  return protocolContract;
}
