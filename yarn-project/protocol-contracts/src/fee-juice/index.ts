import type { Fr } from '@aztec/foundation/fields';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePublicDataTreeLeafSlot, deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import FeeJuiceJson from '../../artifacts/FeeJuice.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';
import { ProtocolContractAddress } from '../protocol_contract_data.js';

export const FeeJuiceArtifact = loadContractArtifact(FeeJuiceJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export async function getCanonicalFeeJuice(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('FeeJuice', FeeJuiceArtifact);
  }
  return protocolContract;
}

/**
 * Computes the storage slot within the Fee Juice contract for the balance of the fee payer.
 */
export function computeFeePayerBalanceStorageSlot(feePayer: AztecAddress): Promise<Fr> {
  return deriveStorageSlotInMap(FeeJuiceArtifact.storageLayout.balances.slot, feePayer);
}

/**
 * Computes the leaf slot in the public data tree for the balance of the fee payer in the Fee Juice.
 */
export async function computeFeePayerBalanceLeafSlot(feePayer: AztecAddress): Promise<Fr> {
  const balanceSlot = await computeFeePayerBalanceStorageSlot(feePayer);
  return computePublicDataTreeLeafSlot(ProtocolContractAddress.FeeJuice, balanceSlot);
}
