import { recoverAddress } from '@aztec/foundation/crypto/secp256k1-signer';
import type { EthAddress } from '@aztec/foundation/eth-address';

import { Checkpoint } from '../checkpoint/checkpoint.js';
import { ConsensusPayload } from '../p2p/consensus_payload.js';
import { type CoordinationSignatureContext, getHashedSignaturePayloadTypedData } from '../p2p/signature_utils.js';
import type { CommitteeAttestation } from './proposal/committee_attestation.js';

/**
 * Status indicating how the attestation address was determined
 */
export type AttestationStatus = 'recovered-from-signature' | 'provided-as-address' | 'invalid-signature' | 'empty';

/**
 * Information about an attestation extracted from a published block
 */
export type AttestationInfo =
  | {
      /** The validator's address, undefined if signature recovery failed or empty */
      address?: undefined;
      /** How the attestation address was determined */
      status: Extract<AttestationStatus, 'invalid-signature' | 'empty'>;
    }
  | {
      /** The validator's address */
      address: EthAddress;
      /** How the attestation address was determined */
      status: Extract<AttestationStatus, 'provided-as-address' | 'recovered-from-signature'>;
    };

/**
 * Extracts attestation information from a published checkpoint.
 * Returns info for each attestation, preserving array indices.
 */
export function getAttestationInfoFromPublishedCheckpoint(
  block: {
    attestations: CommitteeAttestation[];
    checkpoint: Checkpoint;
  },
  signatureContext: CoordinationSignatureContext,
): AttestationInfo[] {
  const payload = ConsensusPayload.fromCheckpoint(block.checkpoint, signatureContext);
  return getAttestationInfoFromPayload(payload, block.attestations);
}

export function getAttestationInfoFromPayload(
  payload: ConsensusPayload,
  attestations: CommitteeAttestation[],
): AttestationInfo[] {
  const hashedPayload = getHashedSignaturePayloadTypedData(payload);

  return attestations.map(attestation => {
    // If signature is empty, check if we have an address directly
    if (attestation.signature.isEmpty()) {
      if (attestation.address.isZero()) {
        // No signature and no address - empty
        return { status: 'empty' as const };
      }
      // Address provided without signature
      return { address: attestation.address, status: 'provided-as-address' as const };
    }

    // Try to recover address from signature. Recover with default opts (no allowYParityAsV): a slot
    // whose recovery byte is in yParity form (v ∈ {0, 1}) is judged invalid here, matching L1 proving
    // (ValidatorSelectionLib.verifyAttestations → ECDSA.recover only accepts v ∈ {27, 28}). A malicious
    // proposer that lands such a slot cannot have it silently treated as valid off-chain; it is routed to
    // invalid-attestation and invalidated. The gossip receipt path (recoverCoordinationSigner) stays
    // lenient with allowYParityAsV; A-1351 normalizes on pool ingress and before the L1 bundle.
    try {
      const recoveredAddress = recoverAddress(hashedPayload, attestation.signature);
      return { address: recoveredAddress, status: 'recovered-from-signature' as const };
    } catch {
      // Signature present but recovery failed
      return { status: 'invalid-signature' as const };
    }
  });
}
