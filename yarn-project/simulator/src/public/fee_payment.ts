import { computePublicDataTreeLeafSlot, deriveStorageSlotInMap } from '@aztec/circuits.js/hash';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress, ProtocolContractArtifact } from '@aztec/protocol-contracts';

/**
 * Computes the storage slot within the Fee Juice contract for the balance of the fee payer.
 */
export function computeFeePayerBalanceStorageSlot(feePayer: AztecAddress) {
  return deriveStorageSlotInMap(ProtocolContractArtifact.FeeJuice.storageLayout.balances.slot, feePayer);
}

/**
 * Computes the leaf slot in the public data tree for the balance of the fee payer in the Fee Juice.
 */
export async function computeFeePayerBalanceLeafSlot(feePayer: AztecAddress): Promise<Fr> {
  if (feePayer.isZero()) {
    return Fr.ZERO;
  }
  const balanceSlot = await computeFeePayerBalanceStorageSlot(feePayer);
  return await computePublicDataTreeLeafSlot(ProtocolContractAddress.FeeJuice, balanceSlot);
}
