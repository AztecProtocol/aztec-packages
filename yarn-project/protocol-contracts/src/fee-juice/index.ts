import { computePublicDataTreeLeafSlot, deriveStorageSlotInMap } from '@aztec/circuits.js/hash';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';
import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import FeeJuiceJson from '../../artifacts/FeeJuice.json' assert { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import { type ProtocolContract } from '../protocol_contract.js';
import { ProtocolContractAddress } from '../protocol_contract_data.js';

export const FeeJuiceArtifact = loadContractArtifact(FeeJuiceJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export function getCanonicalFeeJuice(): ProtocolContract {
  if (!protocolContract) {
    protocolContract = makeProtocolContract('FeeJuice', FeeJuiceArtifact);
  }
  return protocolContract;
}

/**
 * Computes the storage slot within the Fee Juice contract for the balance of the fee payer.
 */
export function computeFeePayerBalanceStorageSlot(feePayer: AztecAddress) {
  return deriveStorageSlotInMap(FeeJuiceArtifact.storageLayout.balances.slot, feePayer);
}

/**
 * Computes the leaf slot in the public data tree for the balance of the fee payer in the Fee Juice.
 */
export function computeFeePayerBalanceLeafSlot(feePayer: AztecAddress): Fr {
  const balanceSlot = computeFeePayerBalanceStorageSlot(feePayer);
  return computePublicDataTreeLeafSlot(ProtocolContractAddress.FeeJuice, balanceSlot);
}
