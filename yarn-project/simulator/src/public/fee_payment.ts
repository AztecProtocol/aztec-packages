import { GAS_TOKEN_ADDRESS } from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

/**
 * Computes the storage slot within the gas token contract for the balance of the fee payer.
 */
export function computeFeePayerBalanceContractStorageIndex(feePayer: AztecAddress): Fr {
  // return deriveStorageSlotInMap(GasTokenArtifact.storageLayout.balances.slot, feePayer).x;
  // TODO(#7604): nuke the following and uncomment above
  return feePayer.toField();
}

/**
 * Computes the leaf slot in the public data tree for the balance of the fee payer in the gas token.
 * TODO(#7551): rename leaf slot to storage_index once we decide upon the naming changes.
 */
export function computeFeePayerBalanceLeafSlot(feePayer: AztecAddress): Fr {
  if (feePayer.isZero()) {
    return Fr.ZERO;
  }
  const gasToken = AztecAddress.fromBigInt(GAS_TOKEN_ADDRESS);
  const feePayerBalanceContractStorageIndex = computeFeePayerBalanceContractStorageIndex(feePayer);
  return computePublicDataTreeLeafSlot(gasToken, feePayerBalanceContractStorageIndex);
}
