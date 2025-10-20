import { recoverAddress } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';

import { ConsensusPayload } from '../p2p/consensus_payload.js';
import { SignatureDomainSeparator, getHashedSignaturePayloadEthSignedMessage } from '../p2p/signature_utils.js';
import type { L2Block } from './l2_block.js';
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
 * Extracts attestation information from a published L2 block.
 * Returns info for each attestation, preserving array indices.
 */
export function getAttestationInfoFromPublishedL2Block(block: {
  attestations: CommitteeAttestation[];
  block: L2Block;
}): AttestationInfo[] {
  const payload = ConsensusPayload.fromBlock(block.block);
  const hashedPayload = getHashedSignaturePayloadEthSignedMessage(payload, SignatureDomainSeparator.blockAttestation);

  return block.attestations.map(attestation => {
    // If signature is empty, check if we have an address directly
    if (attestation.signature.isEmpty()) {
      if (attestation.address.isZero()) {
        // No signature and no address - empty
        return { status: 'empty' as const };
      }
      // Address provided without signature
      return { address: attestation.address, status: 'provided-as-address' as const };
    }

    // Try to recover address from signature
    try {
      const recoveredAddress = recoverAddress(hashedPayload, attestation.signature);
      return { address: recoveredAddress, status: 'recovered-from-signature' as const };
    } catch {
      // Signature present but recovery failed
      return { status: 'invalid-signature' as const };
    }
  });
}
