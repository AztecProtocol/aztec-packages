import { PXE } from '@aztec/circuit-types';
import { CompleteAddress } from '@aztec/circuits.js';

/**
 * Creates a random address and registers it as a recipient on the pxe server. Useful for testing.
 * @param pxe - PXE.
 * @returns Complete address of the registered recipient.
 */
export async function createRecipient(pxe: PXE): Promise<CompleteAddress> {
  const completeAddress = CompleteAddress.random();
  await pxe.registerRecipient(completeAddress);
  return completeAddress;
}
