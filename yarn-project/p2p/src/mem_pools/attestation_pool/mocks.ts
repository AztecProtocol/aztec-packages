import type { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import {
  CheckpointAttestation,
  ConsensusPayload,
  SignatureDomainSeparator,
  getHashedSignaturePayloadEthSignedMessage,
} from '@aztec/stdlib/p2p';
import { makeL2BlockHeader } from '@aztec/stdlib/testing';

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

/** Mock Checkpoint Attestation
 *
 * @param signer A Secp256k1Signer to create a signature
 * @param slot The slot number the attestation is for
 * @param archive The archive root (defaults to random)
 * @returns A Checkpoint Attestation
 */
export const mockCheckpointAttestation = (
  signer: Secp256k1Signer,
  slot: number = 0,
  archive: Fr = Fr.random(),
): CheckpointAttestation => {
  // Use arbitrary numbers for all other than slot
  const header = makeL2BlockHeader(1, 2, slot);
  const payload = new ConsensusPayload(header.toCheckpointHeader(), archive);

  const attestationHash = getHashedSignaturePayloadEthSignedMessage(
    payload,
    SignatureDomainSeparator.checkpointAttestation,
  );
  const attestationSignature = signer.sign(attestationHash);

  const proposalHash = getHashedSignaturePayloadEthSignedMessage(payload, SignatureDomainSeparator.checkpointProposal);
  const proposerSignature = signer.sign(proposalHash);

  return new CheckpointAttestation(payload, attestationSignature, proposerSignature);
};
