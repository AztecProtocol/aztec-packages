import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import type { PXE } from '@aztec/stdlib/interfaces/client';

/**
 * Returns the owner's fee juice balance.
 */
export async function getFeeJuiceBalance(owner: AztecAddress, pxe: PXE): Promise<bigint> {
  const slot = await deriveStorageSlotInMap(new Fr(1), owner);
  return (await pxe.getPublicStorageAt(ProtocolContractAddress.FeeJuice, slot)).toBigInt();
}
