/**
 * Fee Juice - The native gas token contract for the Aztec network.
 *
 * @module fee-juice
 *
 * @description
 * FeeJuice is the protocol's native token contract used for paying transaction fees on the
 * Aztec network. It implements a standard token interface with special privileges and
 * optimizations for fee payment, making it the fundamental economic primitive of the protocol.
 *
 * ## Role in the Protocol
 *
 * FeeJuice serves several critical functions in the Aztec ecosystem:
 * - **Transaction Fees**: The only accepted currency for paying transaction fees
 * - **Sequencer Compensation**: Rewards sequencers for including transactions in blocks
 * - **Gas Metering**: Tracks and deducts gas costs during transaction execution
 * - **Economic Security**: Provides economic incentives for network operation
 * - **Anti-Spam**: Prevents spam attacks by requiring fee payment for all transactions
 *
 * ## Token Economics
 *
 * FeeJuice has unique properties compared to regular tokens:
 * - **Minting**: Can be minted through specific protocol mechanisms
 * - **Burning**: Fees may be partially burned to control supply
 * - **Public State**: Balances are stored in public state for efficiency
 * - **Fast Access**: Optimized for high-frequency fee deduction operations
 * - **Protocol Privilege**: Special integration with the sequencer and fee payment logic
 *
 * ## Relationship to Other Contracts
 *
 * FeeJuice integrates with several parts of the protocol:
 * - **Sequencer**: Receives FeeJuice as compensation for block production
 * - **Fee Payment**: Automatically deducted during transaction execution
 * - **Public State Tree**: Balances stored efficiently in the public data tree
 * - **Router**: May interact with FeeJuice for fee-related operations
 *
 * ## Storage Layout
 *
 * FeeJuice uses an optimized storage layout for balance tracking:
 * - Balances are stored in a public mapping: `address => balance`
 * - Storage slots are derived deterministically from the address
 * - This allows efficient queries and updates during fee payment
 *
 * ## Fee Payment Flow
 *
 * When a transaction is executed:
 * 1. User's FeeJuice balance is checked to ensure sufficient funds
 * 2. Gas is metered throughout execution
 * 3. Fee is calculated based on gas consumed
 * 4. FeeJuice is deducted from user's balance
 * 5. Sequencer receives FeeJuice as compensation
 *
 * ## Security Considerations
 *
 * - Only authorized contracts can mint new FeeJuice
 * - Balance checks prevent overspending
 * - Atomic fee deduction ensures consistency
 * - Public balances enable efficient verification
 * - Fee deduction happens before transaction effects to prevent griefing
 *
 * @example
 * ```typescript
 * import { getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
 *
 * // Get the canonical FeeJuice contract
 * const feeJuice = await getCanonicalFeeJuice();
 * console.log('FeeJuice Address:', feeJuice.address.toString());
 *
 * // Access the token's storage layout
 * const storageLayout = feeJuice.artifact.storageLayout;
 * console.log('Balance mapping slot:', storageLayout.balances.slot);
 * ```
 *
 * @example
 * ```typescript
 * import {
 *   computeFeePayerBalanceStorageSlot,
 *   computeFeePayerBalanceLeafSlot
 * } from '@aztec/protocol-contracts/fee-juice';
 * import { AztecAddress } from '@aztec/stdlib/aztec-address';
 *
 * // Compute storage slot for a user's balance
 * const userAddress = AztecAddress.fromString('0x123...');
 * const storageSlot = await computeFeePayerBalanceStorageSlot(userAddress);
 * console.log('Balance storage slot:', storageSlot.toString());
 *
 * // Compute the leaf slot in the public data tree
 * const leafSlot = await computeFeePayerBalanceLeafSlot(userAddress);
 * console.log('Public tree leaf slot:', leafSlot.toString());
 * ```
 */

import type { Fr } from '@aztec/foundation/fields';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePublicDataTreeLeafSlot, deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import FeeJuiceJson from '../../artifacts/FeeJuice.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';
import { ProtocolContractAddress } from '../protocol_contract_data.js';

/**
 * The compiled artifact for the FeeJuice protocol contract.
 *
 * This artifact contains the complete contract definition including the ABI,
 * storage layout, and bytecode for the native gas token.
 */
export const FeeJuiceArtifact = loadContractArtifact(FeeJuiceJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/**
 * Returns the canonical deployment of the FeeJuice protocol contract.
 *
 * This function provides access to the singleton FeeJuice token contract deployed at
 * a well-known address. FeeJuice is the only accepted currency for paying transaction
 * fees on the Aztec network.
 *
 * The result is cached after the first call for performance.
 *
 * @returns A Promise resolving to the ProtocolContract object for FeeJuice
 *
 * @example
 * ```typescript
 * import { getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
 *
 * // Access the FeeJuice contract
 * const feeJuice = await getCanonicalFeeJuice();
 *
 * // Get the contract address
 * console.log('FeeJuice at:', feeJuice.address.toString());
 *
 * // Access the contract artifact for ABI information
 * const functions = feeJuice.artifact.functions;
 * console.log('Token functions:', functions.map(f => f.name));
 * ```
 */
export async function getCanonicalFeeJuice(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('FeeJuice', FeeJuiceArtifact);
  }
  return protocolContract;
}

/**
 * Computes the storage slot for a fee payer's balance in the FeeJuice contract.
 *
 * FeeJuice stores balances in a public mapping where the key is the account address.
 * This function derives the specific storage slot where a given address's balance is stored,
 * which is useful for reading or updating balances directly from the public state tree.
 *
 * @param feePayer - The address of the account whose balance slot to compute
 * @returns A Promise resolving to the storage slot as a field element
 *
 * @remarks
 * The storage slot is derived using the standard mapping derivation function:
 * `slot = hash(address, mapping_base_slot)`
 *
 * This is consistent with how Aztec derives storage slots for all public mappings.
 *
 * @example
 * ```typescript
 * import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
 * import { AztecAddress } from '@aztec/stdlib/aztec-address';
 *
 * const userAddress = AztecAddress.fromString('0x123...');
 * const slot = await computeFeePayerBalanceStorageSlot(userAddress);
 *
 * // Use the slot to read balance from public state
 * console.log('Balance stored at slot:', slot.toString());
 * ```
 */
export function computeFeePayerBalanceStorageSlot(feePayer: AztecAddress): Promise<Fr> {
  return deriveStorageSlotInMap(FeeJuiceArtifact.storageLayout.balances.slot, feePayer);
}

/**
 * Computes the leaf slot in the public data tree for a fee payer's FeeJuice balance.
 *
 * The public data tree stores all public state for all contracts. This function computes
 * the specific leaf position where a given address's FeeJuice balance is stored in that tree.
 * This is useful for constructing membership proofs or efficiently querying balances.
 *
 * @param feePayer - The address of the account whose balance tree position to compute
 * @returns A Promise resolving to the leaf slot in the public data tree
 *
 * @remarks
 * The leaf slot is computed as: `hash(contract_address, storage_slot)`
 *
 * This two-level derivation ensures that:
 * 1. Each contract's storage is isolated
 * 2. Within a contract, each storage slot has a unique tree position
 *
 * @example
 * ```typescript
 * import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
 * import { AztecAddress } from '@aztec/stdlib/aztec-address';
 *
 * const userAddress = AztecAddress.fromString('0x123...');
 * const leafSlot = await computeFeePayerBalanceLeafSlot(userAddress);
 *
 * // Use the leaf slot to query the public data tree
 * console.log('Balance at tree position:', leafSlot.toString());
 *
 * // Can be used to construct membership proofs for balance verification
 * ```
 */
export async function computeFeePayerBalanceLeafSlot(feePayer: AztecAddress): Promise<Fr> {
  const balanceSlot = await computeFeePayerBalanceStorageSlot(feePayer);
  return computePublicDataTreeLeafSlot(ProtocolContractAddress.FeeJuice, balanceSlot);
}
