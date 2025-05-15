import { getIdentities } from '@aztec/accounts/utils';
import type { AccountManager } from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import type { WalletDB } from '../storage/wallet_db.js';
import { extractECDSAPublicKeyFromBase64String } from './ecdsa.js';

export const AccountTypes = ['schnorr', 'ecdsasecp256r1', 'ecdsasecp256r1ssh', 'ecdsasecp256k1'] as const;
export type AccountType = (typeof AccountTypes)[number];

export async function createOrRetrieveAccount(
  pxe: PXE,
  address?: AztecAddress,
  db?: WalletDB,
  secretKey?: Fr,
  type: AccountType = 'schnorr',
  salt?: Fr,
  publicKey?: string,
): Promise<AccountManager> {
  let account;

  salt ??= Fr.ZERO;

  if (db && address) {
    ({ type, secretKey, salt } = await db.retrieveAccount(address));
  }

  if (!salt) {
    throw new Error('Cannot retrieve/create wallet without salt');
  }

  if (!secretKey) {
    throw new Error('Cannot retrieve/create wallet without secret key');
  }

  switch (type) {
    case 'schnorr': {
      const { getSchnorrAccount } = await import('@aztec/accounts/schnorr');
      account = getSchnorrAccount(pxe, secretKey, deriveSigningKey(secretKey), salt);
      break;
    }
    case 'ecdsasecp256r1': {
      const { getEcdsaRAccount } = await import('@aztec/accounts/ecdsa');
      account = getEcdsaRAccount(pxe, secretKey, deriveSigningKey(secretKey).toBuffer(), salt);
      break;
    }
    case 'ecdsasecp256r1ssh': {
      let publicSigningKey;
      if (db && address) {
        publicSigningKey = await db.retrieveAccountMetadata(address, 'publicSigningKey');
      } else if (publicKey) {
        const identities = await getIdentities();
        const foundIdentity = identities.find(
          identity => identity.type === 'ecdsa-sha2-nistp256' && identity.publicKey === publicKey,
        );
        if (!foundIdentity) {
          throw new Error(`Identity for public key ${publicKey} not found in the SSH agent`);
        }
        publicSigningKey = extractECDSAPublicKeyFromBase64String(foundIdentity.publicKey);
      } else {
        throw new Error('Public key must be provided for ECDSA SSH account');
      }

      const { getEcdsaRSSHAccount } = await import('@aztec/accounts/ecdsa');
      account = getEcdsaRSSHAccount(pxe, secretKey, publicSigningKey, salt);
      break;
    }
    default: {
      throw new Error(`Unsupported account type: ${type}`);
    }
  }

  return account;
}
