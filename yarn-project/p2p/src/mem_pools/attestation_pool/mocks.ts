import type { Secp256k1Signer } from '@aztec/foundation/crypto';
import {
  BlockAttestation,
  ConsensusPayload,
  SignatureDomainSeparator,
  getHashedSignaturePayloadEthSignedMessage,
} from '@aztec/stdlib/p2p';
import { makeHeader } from '@aztec/stdlib/testing';
import type { BlockHeader } from '@aztec/stdlib/tx';

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
export const mockAttestation = (signer: Secp256k1Signer, slot: number = 0, header?: BlockHeader): BlockAttestation => {
  // Use arbitrary numbers for all other than slot
  const headerToUse = header ?? makeHeader(1, 2, slot);
  const payload = new ConsensusPayload(headerToUse.toPropose(), headerToUse.state);

  const hash = getHashedSignaturePayloadEthSignedMessage(payload, SignatureDomainSeparator.blockAttestation);
  const signature = signer.sign(hash);

  return new BlockAttestation(headerToUse.globalVariables.blockNumber, payload, signature);
};
