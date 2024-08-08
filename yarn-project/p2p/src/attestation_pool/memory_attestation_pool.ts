import { type BlockAttestation } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';

import { type AttestationPool } from './attestation_pool.js';

type AttestorMapping = Map</*address=*/string, BlockAttestation>;
type ProposalMapping = Map</*proposal*/string, AttestorMapping>;
type SlotMapping = Map</*slot=*/bigint, ProposalMapping>;

export class InMemoryAttestationPool implements AttestationPool {
  // TODO: change this from string to a bigint for addressing
  // TODO: make private

  // temporarily map based on slot, then proposer then number
  public attestations: SlotMapping;

  constructor(private log = createDebugLogger('aztec:attestation_pool')) {
    this.attestations = new Map();
  }

  // TODO: make the string a proposal hash, could just be proposal tbh
  public async getAttestationsForSlot(slot: bigint, proposal: string): Promise<BlockAttestation[]> {
    const slotAttestationMap = this.attestations.get(slot);
    if (slotAttestationMap) {
      const proposalAttestationMap = slotAttestationMap.get(proposal);
      if (proposalAttestationMap) {
        return Array.from(proposalAttestationMap.values());
      }
    } 
    return [];
  }

  public async addAttestations(attestations: BlockAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      // TODO: there are optimizations to group these by slot first
      const slotNumber = attestation.header.globalVariables.slotNumber;

      // We want the header and the sender to be unique, so
      // do we want to call an ec recover in here to work out how
      // the sender is ?
      // is the message identifier the rifht field
      const address = await attestation.getSender();

      const proposalAttestationMap = getProposalMappingOrDefault(this.attestations, slotNumber.toBigInt());
      const attestationMap = getAttestationsOrDefault(proposalAttestationMap, attestation.header.hash().toString());
      attestationMap.set(address.toString(), attestation);

      this.log.verbose(`Added attestation for slot ${slotNumber} from ${address}`);
    }
  }

  /**
   * Drop all attestations collected for a given slot
   */
  public async deleteAttestationsForSlot(slot: bigint): Promise<void> {
    // TODO(md): check if this will free the memory of the inner hash map
    this.attestations.delete(slot);
    this.log.verbose(`Removed attestation for slot ${slot}`);
  }

  public async deleteAttestations(attestations: BlockAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      const slotNumber = attestation.header.globalVariables.slotNumber;
      const slotAttestationMap = this.attestations.get(slotNumber.toBigInt());
      if (slotAttestationMap) {
        const address = await attestation.getSender();
        slotAttestationMap.delete(address.toString());
        this.log.verbose(`Deleted attestation for slot ${slotNumber} from ${address}`);
      }
    }
  }
}

// If the slot is not in the map, create a new map and add it to the map
function getProposalMappingOrDefault(map: SlotMapping, slot: bigint): ProposalMapping {
  if (!map.has(slot)) {
    map.set(slot, new Map<string, Map<string, BlockAttestation>>());
  }
  return map.get(slot)!;
}

function getAttestationsOrDefault(map: ProposalMapping, proposal: string ): Map<string, BlockAttestation> {
  if (!map.has(proposal)) {
    map.set(proposal, new Map<string, BlockAttestation>());
  }
  return map.get(proposal)!;
}
