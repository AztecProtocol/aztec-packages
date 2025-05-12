/**
 * The `@aztec/accounts/ecdsa` export provides an ECDSA account contract implementation, that uses an ECDSA private key for authentication, and a Grumpkin key for encryption.
 * Consider using this account type when working with integrations with Ethereum wallets.
 *
 * @packageDocumentation
 */
import { AccountManager, type Salt } from '@aztec/aztec.js/account';
import { type AccountWallet, getWallet } from '@aztec/aztec.js/wallet';
import { Fr } from '@aztec/foundation/fields';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import EcdsaKAccountContractJson from '../../../artifacts/EcdsaKAccount.json' with { type: 'json' };
import { EcdsaKBaseAccountContract } from './account_contract.js';

export const EcdsaKAccountContractArtifact: ContractArtifact = loadContractArtifact(
  EcdsaKAccountContractJson as NoirCompiledContract,
);

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256k1 public key stored in an immutable encrypted note.
 * Eagerly loads the contract artifact
 */
export class EcdsaKAccountContract extends EcdsaKBaseAccountContract {
  constructor(signingPrivateKey: Buffer) {
    super(signingPrivateKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(EcdsaKAccountContractArtifact);
  }
}
/**
 * Creates an Account that relies on an ECDSA signing key for authentication.
 * @param pxe - An PXE server instance.
 * @param secretKey - Secret key used to derive all the keystore keys.
 * @param signingPrivateKey - Secp256k1 key used for signing transactions.
 * @param salt - Deployment salt.
 * @returns An account manager initialized with the account contract and its deployment params
 */
export function getEcdsaKAccount(
  pxe: PXE,
  secretKey: Fr,
  signingPrivateKey: Buffer,
  salt?: Salt,
): Promise<AccountManager> {
  return AccountManager.create(pxe, secretKey, new EcdsaKAccountContract(signingPrivateKey), salt);
}

/**
 * Gets a wallet for an already registered account using ECDSA signatures.
 * @param pxe - An PXE server instance.
 * @param address - Address for the account.
 * @param signingPrivateKey - ECDSA key used for signing transactions.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export function getEcdsaKWallet(pxe: PXE, address: AztecAddress, signingPrivateKey: Buffer): Promise<AccountWallet> {
  return getWallet(pxe, address, new EcdsaKAccountContract(signingPrivateKey));
}
