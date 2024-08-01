import { getEcdsaRSSHAccount } from '@aztec/accounts/ecdsa';
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getIdentities } from '@aztec/accounts/utils';
import { AztecAddress, Fr, deriveSigningKey } from '@aztec/circuits.js';

import { type PXE } from '../../../circuit-types/src/interfaces/pxe.js';
import { WalletDB } from '../storage/wallet_db.js';
import { extractECDSAPublicKeyFromBase64String } from './ecdsa.js';

export type AccountType = 'schnorr' | 'ecdsasecp256r1ssh' | 'ecdsasecp256k1';

export async function createAndStoreAccount(
  client: PXE,
  type: AccountType,
  secretKey: Fr,
  publicKey: string | undefined,
  salt: Fr,
  alias: string | undefined,
) {
  let account;
  const db = WalletDB.getInstance();
  switch (type) {
    case 'schnorr': {
      account = getSchnorrAccount(client, secretKey, deriveSigningKey(secretKey), salt);
      const { address } = account.getCompleteAddress();
      await db.storeAccount(address, { type, alias, secretKey, salt });
      break;
    }
    case 'ecdsasecp256r1ssh': {
      if (!publicKey) {
        throw new Error('Public key stored in the SSH agent must be provided for ECDSA SSH account');
      }
      const identities = await getIdentities();
      const foundIdentity = identities.find(
        identity => identity.type === 'ecdsa-sha2-nistp256' && identity.publicKey === publicKey,
      );
      if (!foundIdentity) {
        throw new Error(`Identity for public key ${publicKey} not found in the SSH agent`);
      }

      const publicSigningKey = extractECDSAPublicKeyFromBase64String(foundIdentity.publicKey);
      console.log(publicSigningKey.toString('hex'));
      account = getEcdsaRSSHAccount(client, secretKey, publicSigningKey, salt);
      const { address } = account.getCompleteAddress();
      await db.storeAccount(address, { type, alias, secretKey, salt });
      await db.storeAccountMetadata(address, 'publicSigningKey', publicSigningKey);
      break;
    }
    default: {
      throw new Error(`Unsupported account type: ${type}`);
    }
  }

  return account;
}

export async function retrieveWallet(pxe: PXE, aliasOrAddress: string | AztecAddress) {
  let wallet;
  const { type, salt, secretKey } = WalletDB.getInstance().retrieveAccount(aliasOrAddress);

  switch (type) {
    case 'schnorr': {
      wallet = await getSchnorrAccount(pxe, secretKey, deriveSigningKey(secretKey), salt).getWallet();
      break;
    }
    case 'ecdsasecp256r1ssh': {
      const publicSigningKey = WalletDB.getInstance().retrieveAccountMetadata(aliasOrAddress, 'publicSigningKey');
      wallet = await getEcdsaRSSHAccount(pxe, secretKey, publicSigningKey, salt).getWallet();
      break;
    }
    default: {
      throw new Error(`Unsupported account type: ${type}`);
    }
  }

  return wallet;
}
