import { SlotNumber } from '@aztec/foundation/branded-types';
import type { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import {
  CheckpointAttestation,
  CheckpointProposal,
  ConsensusPayload,
  getHashedSignaturePayloadTypedData,
} from '@aztec/stdlib/consensus';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { TEST_COORDINATION_SIGNATURE_CONTEXT } from '@aztec/stdlib/testing';

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
 * @param header The checkpoint header (defaults to random with given slot)
 * @returns A Checkpoint Attestation
 */
export const mockCheckpointAttestation = (
  signer: Secp256k1Signer,
  slot: number = 0,
  archive: Fr = Fr.random(),
  header?: CheckpointHeader,
  feeAssetPriceModifier: bigint = 0n,
): CheckpointAttestation => {
  header = header ?? CheckpointHeader.random({ slotNumber: SlotNumber(slot) });
  const payload = new ConsensusPayload(header, archive, feeAssetPriceModifier, TEST_COORDINATION_SIGNATURE_CONTEXT);

  const attestationHash = getHashedSignaturePayloadTypedData(payload);
  const attestationSignature = signer.sign(attestationHash);

  const proposal = new CheckpointProposal(
    header,
    archive,
    feeAssetPriceModifier,
    attestationSignature,
    TEST_COORDINATION_SIGNATURE_CONTEXT,
  );
  const proposalHash = getHashedSignaturePayloadTypedData(proposal);
  const proposerSignature = signer.sign(proposalHash);

  return new CheckpointAttestation(payload, attestationSignature, proposerSignature);
};
