import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * Returns the owner's fee juice balance.
 * Note: This is used only e2e_sandbox_example test. TODO: Consider nuking.
 */
export async function getFeeJuiceBalance(owner: AztecAddress, node: AztecNode): Promise<bigint> {
  const slot = await deriveStorageSlotInMap(new Fr(1), owner);
  return (await node.getPublicStorageAt('latest', ProtocolContractAddress.FeeJuice, slot)).toBigInt();
}
