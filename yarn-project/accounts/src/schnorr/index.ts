/**
 * The `@aztec/accounts/schnorr` export provides an account contract implementation that uses Schnorr signatures with a Grumpkin key for authentication, and a separate Grumpkin key for encryption.
 * This is the suggested account contract type for most use cases within Aztec.
 *
 * @packageDocumentation
 */
import type { AztecAddress, Fr, GrumpkinScalar } from '@aztec/aztec.js';
import { AccountManager, type Salt } from '@aztec/aztec.js/account';
import { type AccountWallet, type AccountWalletWithSecretKey, getWallet } from '@aztec/aztec.js/wallet';
import { type PXE } from '@aztec/circuit-types/interfaces/client';

import { SchnorrAccountContract } from './account_contract.js';

export { SchnorrAccountContract, getSchnorrAccountContractAddress } from './account_contract.js';

export { SchnorrAccountContractArtifact } from './artifact.js';

/**
 * Creates an Account Manager that relies on a Grumpkin signing key for authentication.
 * @param pxe - An PXE server instance.
 * @param secretKey - Secret key used to derive all the keystore keys.
 * @param signingPrivateKey - Grumpkin key used for signing transactions.
 * @param salt - Deployment salt.
 * @returns An account manager initialized with the account contract and its deployment params
 */
export function getSchnorrAccount(
  pxe: PXE,
  secretKey: Fr,
  signingPrivateKey: GrumpkinScalar,
  salt?: Salt,
): Promise<AccountManager> {
  return AccountManager.create(pxe, secretKey, new SchnorrAccountContract(signingPrivateKey), salt);
}

/**
 * Gets a wallet for an already registered account using Schnorr signatures.
 * @param pxe - An PXE server instance.
 * @param address - Address for the account.
 * @param signingPrivateKey - Grumpkin key used for signing transactions.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export function getSchnorrWallet(
  pxe: PXE,
  address: AztecAddress,
  signingPrivateKey: GrumpkinScalar,
): Promise<AccountWallet> {
  return getWallet(pxe, address, new SchnorrAccountContract(signingPrivateKey));
}

/**
 * Gets a wallet for an already registered account using Schnorr signatures.
 * @param pxe - An PXE server instance.
 * @param secretKey - Secret key used to derive all the keystore keys.
 * @param signingPrivateKey - Grumpkin key used for signing transactions.
 * @param salt - Deployment salt.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export async function getSchnorrWalletWithSecretKey(
  pxe: PXE,
  secretKey: Fr,
  signingPrivateKey: GrumpkinScalar,
  salt: Salt,
): Promise<AccountWalletWithSecretKey> {
  const account = await getSchnorrAccount(pxe, secretKey, signingPrivateKey, salt);
  return account.getWallet();
}
