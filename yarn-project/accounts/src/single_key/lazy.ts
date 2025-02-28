/**
 * The `@aztec/accounts/single_key` export provides a testing account contract implementation that uses a single Grumpkin key for both authentication and encryption.
 * It is not recommended to use this account type in production.
 *
 * @packageDocumentation
 */
import type { AztecAddress, Fr, GrumpkinScalar } from '@aztec/aztec.js';
import { AccountManager, type Salt } from '@aztec/aztec.js/account';
import { type AccountWallet, getWallet } from '@aztec/aztec.js/wallet';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import { deriveMasterIncomingViewingSecretKey } from '@aztec/stdlib/keys';

import { SingleKeyBaseAccountContract } from './account_contract.js';

/**
 * Lazily loads the contract artifact
 * @returns The contract artifact for the single key account contract
 */
export async function getSingleKeyAccountContractArtifact() {
  // Cannot assert this import as it's incompatible with browsers
  // https://caniuse.com/mdn-javascript_statements_import_import_assertions_type_json
  // Use the new "with" syntax once supported by firefox
  // https://caniuse.com/mdn-javascript_statements_import_import_attributes_type_json
  // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
  const { default: schnorrAccountContractJson } = await import('../../artifacts/SchnorrAccount.json');
  return loadContractArtifact(schnorrAccountContractJson);
}

/**
 * Account contract that authenticates transactions using Schnorr signatures verified against
 * the note encryption key, relying on a single private key for both encryption and authentication.
 * Lazily loads the contract artifact
 */
export class SingleKeyAccountContract extends SingleKeyBaseAccountContract {
  constructor(signingPrivateKey: GrumpkinScalar) {
    super(signingPrivateKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return getSingleKeyAccountContractArtifact();
  }
}

/**
 * Creates an Account that uses the same Grumpkin key for encryption and authentication.
 * @param pxe - An PXE server instance.
 * @param secretKey - Secret key used to derive all the keystore keys (in this case also used to get signing key).
 * @param salt - Deployment salt.
 * @returns An account manager initialized with the account contract and its deployment params
 */
export function getUnsafeSchnorrAccount(pxe: PXE, secretKey: Fr, salt?: Salt) {
  const encryptionPrivateKey = deriveMasterIncomingViewingSecretKey(secretKey);
  return AccountManager.create(pxe, secretKey, new SingleKeyAccountContract(encryptionPrivateKey), salt);
}

/**
 * Gets a wallet for an already registered account using Schnorr signatures with a single key for encryption and authentication.
 * @param pxe - An PXE server instance.
 * @param address - Address for the account.
 * @param signingPrivateKey - Grumpkin key used for note encryption and signing transactions.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export function getUnsafeSchnorrWallet(
  pxe: PXE,
  address: AztecAddress,
  signingPrivateKey: GrumpkinScalar,
): Promise<AccountWallet> {
  return getWallet(pxe, address, new SingleKeyAccountContract(signingPrivateKey));
}
