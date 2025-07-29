import type { EthAddress } from '@aztec/foundation/eth-address';

import { CommitteeAttestation } from '../block/index.js';
import type { BlockAttestation } from './block_attestation.js';

/**
 * Returns attestation signatures in the order of a series of provided ethereum addresses
 * The rollup smart contract expects attestations to appear in the order of the committee
 * @todo: perform this logic within the memory attestation store instead?
 */
export function orderAttestations(
  attestations: BlockAttestation[],
  orderAddresses: EthAddress[],
): CommitteeAttestation[] {
  // Create a map of sender addresses to BlockAttestations
  const attestationMap = new Map<string, CommitteeAttestation>();

  for (const attestation of attestations) {
    const sender = attestation.getSender();
    if (sender) {
      attestationMap.set(
        sender.toString(),
        CommitteeAttestation.fromAddressAndSignature(sender, attestation.signature),
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
