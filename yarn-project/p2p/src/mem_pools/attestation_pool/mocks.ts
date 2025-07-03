import type { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import {
  BlockAttestation,
  ConsensusPayload,
  SignatureDomainSeparator,
  getHashedSignaturePayloadEthSignedMessage,
} from '@aztec/stdlib/p2p';
import { makeHeader } from '@aztec/stdlib/testing';

import { type LocalAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

/** Generate Account
 *
 * Create a random signer
 * @returns A random viem signer
 */
export const generateAccount = (): LocalAccount => {
  const privateKey = generatePrivateKey();
  return privateKeyToAccount(privateKey);
};

/** Mock Attestation
 *
 * @param signer A viem signer to create a signature
 * @param slot The slot number the attestation is for
 * @returns A Block Attestation
 */
export const mockAttestation = (
  signer: Secp256k1Signer,
  slot: number = 0,
  archive: Fr = Fr.random(),
): BlockAttestation => {
  // Use arbitrary numbers for all other than slot
  const header = makeHeader(1, 2, slot);
  const payload = new ConsensusPayload(header.toPropose(), archive, header.state);

  const hash = getHashedSignaturePayloadEthSignedMessage(payload, SignatureDomainSeparator.blockAttestation);
  const signature = signer.sign(hash);

  return new BlockAttestation(header.globalVariables.blockNumber, payload, signature);
};
