import { AztecAddress, PartialContractAddress, PublicKey } from '@aztec/circuits.js';

export type CompleteAddress = {
  address: AztecAddress;
  partialAddress: PartialContractAddress;
  publicKey: PublicKey;
};

export function isCompleteAddress(obj: any): obj is CompleteAddress {
  if (!obj) return false;
  const maybe = obj as CompleteAddress;
  return !!maybe.address && !!maybe.partialAddress && !!maybe.publicKey;
}
