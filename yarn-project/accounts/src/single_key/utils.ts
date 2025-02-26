import { AccountManager, type Salt } from '@aztec/aztec.js/account';
import { type AccountWallet, getWallet } from '@aztec/aztec.js/wallet';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import { deriveMasterIncomingViewingSecretKey } from '@aztec/stdlib/keys';

import type { SingleKeyBaseAccountContract } from './account_contract.js';

interface SingleKeyAccountContractConstructor {
  new (signingPrivateKey: GrumpkinScalar): SingleKeyBaseAccountContract;
}

export function getUnsafeSchnorrAccount(
  ctor: SingleKeyAccountContractConstructor,
  pxe: PXE,
  secretKey: Fr,
  salt?: Salt,
) {
  const encryptionPrivateKey = deriveMasterIncomingViewingSecretKey(secretKey);
  return AccountManager.create(pxe, secretKey, new ctor(encryptionPrivateKey), salt);
}

export function getUnsafeSchnorrWallet(
  ctor: SingleKeyAccountContractConstructor,
  pxe: PXE,
  address: AztecAddress,
  signingKey: GrumpkinScalar,
): Promise<AccountWallet> {
  return getWallet(pxe, address, new ctor(signingKey));
}
