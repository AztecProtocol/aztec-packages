/**
 * The `@aztec/accounts/ecdsa` export provides an ECDSA account contract implementation, that uses an ECDSA private key for authentication, and a Grumpkin key for encryption.
 * Consider using this account type when working with integrations with Ethereum wallets.
 *
 * @packageDocumentation
 */
import { AccountManager, Salt } from '@aztec/aztec.js/account';
import { AccountWallet, getWallet } from '@aztec/aztec.js/wallet';
import { GrumpkinPrivateKey, PXE } from '@aztec/circuit-types';
import { AztecAddress } from '@aztec/circuits.js';

import { EcdsaAccountContract } from './account_contract.js';

export { EcdsaAccountContractArtifact } from './artifact.js';
export { EcdsaAccountContract };

/**
 * Creates an Account that relies on an ECDSA signing key for authentication.
 * @param pxe - An PXE server instance.
 * @param encryptionPrivateKey - Grumpkin key used for note encryption.
 * @param signingPrivateKey - Secp256k1 key used for signing transactions.
 * @param salt - Deployment salt.
 */
export function getEcdsaAccount(
  pxe: PXE,
  encryptionPrivateKey: GrumpkinPrivateKey,
  signingPrivateKey: Buffer,
  salt?: Salt,
): AccountManager {
  return new AccountManager(pxe, encryptionPrivateKey, new EcdsaAccountContract(signingPrivateKey), salt);
}

/**
 * Gets a wallet for an already registered account using ECDSA signatures.
 * @param pxe - An PXE server instance.
 * @param address - Address for the account.
 * @param signingPrivateKey - ECDSA key used for signing transactions.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export function getEcdsaWallet(pxe: PXE, address: AztecAddress, signingPrivateKey: Buffer): Promise<AccountWallet> {
  return getWallet(pxe, address, new EcdsaAccountContract(signingPrivateKey));
}
