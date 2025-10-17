/**
 * Auth Registry - Protocol contract for managing authentication and authorization witnesses.
 *
 * @module auth-registry
 *
 * @description
 * The AuthRegistry is a protocol contract in Aztec that manages authentication witnesses
 * and authorization proofs for accounts and contracts. It provides a centralized mechanism
 * for validating that actions are performed by authorized parties, enabling secure
 * account abstraction and flexible authorization patterns.
 *
 * ## Role in the Protocol
 *
 * The auth registry serves several important security functions:
 * - **Authentication**: Verifies that messages and transactions are from authorized sources
 * - **Authorization Witnesses**: Stores and validates authorization proofs
 * - **Account Abstraction**: Enables flexible account models beyond simple key-based accounts
 * - **Delegation**: Supports delegated authorization patterns
 * - **Replay Protection**: Ensures authorization witnesses cannot be reused maliciously
 *
 * ## Authentication Model
 *
 * Aztec uses an auth witness model where:
 * 1. An account creates a signed authorization witness
 * 2. The witness is registered in the AuthRegistry
 * 3. Contracts can query the registry to verify authorization
 * 4. Witnesses are consumed after use to prevent replay attacks
 *
 * ## Use Cases
 *
 * The AuthRegistry enables several important patterns:
 * - **Account Abstraction**: Smart contract accounts with custom validation logic
 * - **Multi-Sig Accounts**: Accounts requiring multiple signatures
 * - **Session Keys**: Temporary authorization for specific operations
 * - **Delegated Operations**: Authorized third parties acting on behalf of users
 * - **Sponsored Transactions**: Meta-transactions where fees are paid by others
 *
 * ## Relationship to Other Contracts
 *
 * The AuthRegistry integrates with other protocol components:
 * - **User Accounts**: All account contracts interact with the auth registry
 * - **Contract Calls**: Authorization is checked for protected operations
 * - **MultiCallEntrypoint**: Batched calls may require auth witness validation
 * - **Sequencer**: Validates transaction authorization before inclusion
 *
 * ## Authorization Flow
 *
 * When executing an authorized action:
 * 1. User creates an authorization witness (e.g., signature)
 * 2. Witness is registered in the AuthRegistry with a nonce
 * 3. Contract calls registry to verify authorization
 * 4. If valid, the action proceeds
 * 5. Witness is consumed to prevent replay
 *
 * ## Witness Types
 *
 * The registry supports various witness types:
 * - **Signature Witnesses**: Standard cryptographic signatures
 * - **Proof Witnesses**: Zero-knowledge proofs of authorization
 * - **Contract Witnesses**: Authorization from smart contract accounts
 * - **Delegated Witnesses**: Authorization from authorized delegates
 *
 * ## Security Considerations
 *
 * - Witnesses are single-use to prevent replay attacks
 * - Nonces ensure ordering and prevent double-spending of authorizations
 * - Registry enforces that only authorized parties can register witnesses
 * - Timestamps or expiration can limit witness validity periods
 * - Contract must validate witness types match expected authorization
 *
 * ## Account Abstraction Support
 *
 * The AuthRegistry is fundamental to Aztec's account abstraction:
 * - Accounts can implement custom validation logic
 * - No requirement for externally-owned accounts (EOAs)
 * - Supports programmable account security policies
 * - Enables social recovery, multi-sig, and other advanced patterns
 *
 * @example
 * ```typescript
 * import { getCanonicalAuthRegistry } from '@aztec/protocol-contracts/auth-registry';
 *
 * // Get the canonical auth registry
 * const authRegistry = await getCanonicalAuthRegistry();
 * console.log('Auth Registry Address:', authRegistry.address.toString());
 *
 * // Access the registry's ABI
 * const artifact = authRegistry.artifact;
 * console.log('Auth functions:', artifact.functions.map(f => f.name));
 * ```
 *
 * @example
 * ```typescript
 * // Conceptual example of authorization flow
 * import { getCanonicalAuthRegistry } from '@aztec/protocol-contracts/auth-registry';
 *
 * const authRegistry = await getCanonicalAuthRegistry();
 *
 * // User creates an authorization witness (e.g., signature)
 * // const witness = await account.createAuthWitness(action);
 *
 * // Contract validates the authorization
 * // const isAuthorized = await authRegistry.checkAuthWitness(
 * //   account.address,
 * //   actionHash,
 * //   witness
 * // );
 *
 * // If authorized, proceed with the action
 * // Witness is consumed and cannot be reused
 * ```
 */

import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import AuthRegistryJson from '../../artifacts/AuthRegistry.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;

/**
 * The compiled artifact for the AuthRegistry protocol contract.
 *
 * This artifact contains the ABI and bytecode for managing authentication
 * witnesses and authorization validation throughout the Aztec network.
 */
export const AuthRegistryArtifact: ContractArtifact = loadContractArtifact(AuthRegistryJson as NoirCompiledContract);

/**
 * Returns the canonical deployment of the AuthRegistry protocol contract.
 *
 * This function provides access to the singleton auth registry deployed at a
 * well-known address. The registry is used throughout the protocol to validate
 * that actions are authorized by the appropriate accounts.
 *
 * The result is cached after the first call for performance.
 *
 * @returns A Promise resolving to the ProtocolContract object for the auth registry
 *
 * @example
 * ```typescript
 * import { getCanonicalAuthRegistry } from '@aztec/protocol-contracts/auth-registry';
 *
 * // Access the auth registry
 * const authRegistry = await getCanonicalAuthRegistry();
 *
 * // Get the registry's address
 * console.log('Auth Registry at:', authRegistry.address.toString());
 *
 * // Access contract information
 * const functions = authRegistry.artifact.functions;
 * console.log('Available auth functions:', functions.map(f => f.name));
 * ```
 */
export async function getCanonicalAuthRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('AuthRegistry', AuthRegistryArtifact);
  }
  return protocolContract;
}
