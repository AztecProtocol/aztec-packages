/**
 * The `@aztec/accounts/ecdsa` export provides an ECDSA account contract implementation, that uses an ECDSA private key for authentication, and a Grumpkin key for encryption.
 * Consider using this account type when working with integrations with Ethereum wallets.
 *
 * @packageDocumentation
 */
import { AccountManager, type Salt } from '@aztec/aztec.js/account';
import { type AccountWallet, getWallet } from '@aztec/aztec.js/wallet';
import { Fr } from '@aztec/foundation/fields';
import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PXE } from '@aztec/stdlib/interfaces/client';

import { CommandType, sendCommandAndParseResponse } from '../../utils/web_serial.js';
import { EcdsaRSerialBaseAccountContract } from './account_contract.js';

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256r1 public key stored in an immutable encrypted note.
 * Since this implementation relays signatures to an Serial agent, we provide the
 * public key here not for signature verification, but to identify actual identity
 * that will be used to sign authwitnesses.
 * Lazily loads the contract artifact
 */
export class EcdsaRSerialAccountContract extends EcdsaRSerialBaseAccountContract {
  constructor(signingPublicKey: Buffer) {
    super(signingPublicKey);
  }

  override async getContractArtifact(): Promise<ContractArtifact> {
    const {
      data: { data },
    } = await sendCommandAndParseResponse({ type: CommandType.GET_ARTIFACT_REQUEST, data: {} });
    return loadContractArtifact(data);
  }
}

/**
 * Creates an Account that relies on an ECDSA signing key for authentication.
 * @param pxe - An PXE server instance.
 * @param secretKey - Secret key used to derive all the keystore keys.
 * @param signingPublicKey - Secp2561 key used to identify its corresponding private key in the Serial Agent.
 * @param salt - Deployment salt.
 * @returns An account manager initialized with the account contract and its deployment params
 */
export async function getEcdsaRSerialAccount(
  pxe: PXE,
  secretKey: Fr,
  index: number,
  salt?: Salt,
): Promise<AccountManager> {
  const signingPublicKeyResponse = await sendCommandAndParseResponse({
    type: CommandType.GET_KEY_REQUESTED,
    data: { index },
  });
  const signingPublicKey = Buffer.from(signingPublicKeyResponse.data.pk);
  return AccountManager.create(pxe, secretKey, new EcdsaRSerialAccountContract(signingPublicKey), salt);
}

/**
 * Gets a wallet for an already registered account using ECDSA signatures.
 * @param pxe - An PXE server instance.
 * @param address - Address for the account.
 * @param signingPrivateKey - ECDSA key used for signing transactions.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export function getEcdsaRSerialWallet(
  pxe: PXE,
  address: AztecAddress,
  signingPublicKey: Buffer,
): Promise<AccountWallet> {
  return getWallet(pxe, address, new EcdsaRSerialAccountContract(signingPublicKey));
}
