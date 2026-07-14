import { normalizeSignature } from '@aztec/foundation/crypto/secp256k1-signer';
import type { EthAddress } from '@aztec/foundation/eth-address';

import { CommitteeAttestation } from '../block/index.js';
import type { CheckpointAttestation } from './checkpoint_attestation.js';

/**
 * Returns attestation signatures in the order of a series of provided ethereum addresses
 * The rollup smart contract expects attestations to appear in the order of the committee
 * @todo: perform this logic within the memory attestation store instead?
 */
export function orderAttestations(
  attestations: CheckpointAttestation[],
  orderAddresses: EthAddress[],
): CommitteeAttestation[] {
  // Create a map of sender addresses to attestations
  const attestationMap = new Map<string, CommitteeAttestation>();

  for (const attestation of attestations) {
    const sender = attestation.getSender();
    if (sender) {
      // Canonicalize the recovery byte to v ∈ {27, 28} before it reaches the L1 bundle. A committee
      // member (or a peer mutating the byte in flight) can emit an equivalent signature in yParity form
      // (v = 0/1); left as-is it makes `packAttestations` (empty iff v === 0) and `getSigners` (empty iff
      // r,s,v all zero) disagree, reverting `propose()` with SignersSizeMismatch, and a v = 1 byte would
      // later revert epoch proving in ECDSA.recover. `sender` recovered, so the signature is non-empty
      // and low-s, and normalizeSignature preserves the recovered address.
      attestationMap.set(
        sender.toString(),
        CommitteeAttestation.fromAddressAndSignature(sender, normalizeSignature(attestation.signature)),
      );
    }
  }

  // Create the ordered array based on the orderAddresses, else return an empty attestation
  const orderedAttestations = orderAddresses.map(address => {
    const addressString = address.toString();
    return attestationMap.get(addressString) || CommitteeAttestation.fromAddress(address);
  });

  return orderedAttestations;
}

/**
 * Trims attestations to the minimum required number to save L1 calldata gas.
 * Each signature costs 65 bytes of calldata vs 20 bytes for just an address.
 *
 * Priority order for keeping attestations:
 * 1. The proposer's attestation (required by L1 contract - MissingProposerSignature revert)
 * 2. Attestations from the local node's validator keys
 * 3. Remaining attestations filled to reach the required count
 */
export function trimAttestations(
  attestations: CheckpointAttestation[],
  required: number,
  proposerAddress: EthAddress,
  localAddresses: EthAddress[],
): CheckpointAttestation[] {
  if (attestations.length <= required) {
    return attestations;
  }

  const proposerAttestation: CheckpointAttestation[] = [];
  const localAttestations: CheckpointAttestation[] = [];
  const otherAttestations: CheckpointAttestation[] = [];

  for (const attestation of attestations) {
    const sender = attestation.getSender();
    if (!sender) {
      continue;
    }
    if (sender.equals(proposerAddress)) {
      proposerAttestation.push(attestation);
    } else if (localAddresses.some(addr => addr.equals(sender))) {
      localAttestations.push(attestation);
    } else {
      otherAttestations.push(attestation);
    }
  }

  const result: CheckpointAttestation[] = [...proposerAttestation];

  for (const att of localAttestations) {
    if (result.length >= required) {
      break;
    }
    result.push(att);
  }

  for (const att of otherAttestations) {
    if (result.length >= required) {
      break;
    }
    result.push(att);
  }

  return result;
}
