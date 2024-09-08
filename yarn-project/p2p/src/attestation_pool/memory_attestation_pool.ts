import { type BlockAttestation } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';

import { type AttestationPool } from './attestation_pool.js';

export class InMemoryAttestationPool implements AttestationPool {
  private attestations: Map</*slot=*/ bigint, Map</*proposalId*/ string, Map</*address=*/ string, BlockAttestation>>>;

  constructor(private log = createDebugLogger('aztec:attestation_pool')) {
    this.attestations = new Map();
  }

  public getAttestationsForSlot(slot: bigint, proposalId: string): Promise<BlockAttestation[]> {
    const slotAttestationMap = this.attestations.get(slot);
    if (slotAttestationMap) {
      const proposalAttestationMap = slotAttestationMap.get(proposalId);
      if (proposalAttestationMap) {
        return Promise.resolve(Array.from(proposalAttestationMap.values()));
      }
    }
    return Promise.resolve([]);
  }

  public async addAttestations(attestations: BlockAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      // Perf: order and group by slot before insertion
      const slotNumber = attestation.header.globalVariables.slotNumber;

      // TODO(md): change the name on this, get the data from the underlying proposal, we want it cached so less hashing
      const proposalId = attestation.p2pMessageIdentifier.toString();

      const address = await attestation.getSender();

      const slotAttestationMap = getSlotOrDefault(this.attestations, slotNumber.toBigInt());
      const proposalAttestationMap = getProposalOrDefault(slotAttestationMap, proposalId);
      proposalAttestationMap.set(address.toString(), attestation);

      this.log.verbose(`Added attestation for slot ${slotNumber} from ${address}`);
    }
  }

  public deleteAttestationsForSlot(slot: bigint): Promise<void> {
    // TODO(md): check if this will free the memory of the inner hash map
    this.attestations.delete(slot);
    this.log.verbose(`Removed attestation for slot ${slot}`);
    return Promise.resolve();
  }

  public deleteAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<void> {
    const slotAttestationMap = this.attestations.get(slot);
    if (slotAttestationMap) {
      slotAttestationMap.delete(proposalId);
      this.log.verbose(`Removed attestation for slot ${slot}`);
    }
    return Promise.resolve();
  }

  public async deleteAttestations(attestations: BlockAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      const slotNumber = attestation.header.globalVariables.slotNumber;
      const slotAttestationMap = this.attestations.get(slotNumber.toBigInt());
      if (slotAttestationMap) {
        const proposalId = attestation.p2pMessageIdentifier.toString();
        const proposalAttestationMap = getProposalOrDefault(slotAttestationMap, proposalId);
        if (proposalAttestationMap) {
          const address = await attestation.getSender();
          proposalAttestationMap.delete(address.toString());
          this.log.debug(`Deleted attestation for slot ${slotNumber} from ${address}`);
        }
      }
    }
    return Promise.resolve();
  }
}

/**
 * Get Slot or Default
 *
 * Fetch the slot mapping, if it does not exist, then create a mapping and return it
 * @param map - The map to fetch from
 * @param slot - The slot to fetch
 * @returns The slot mapping
 */
function getSlotOrDefault(
  map: Map<bigint, Map<string, Map<string, BlockAttestation>>>,
  slot: bigint,
): Map<string, Map<string, BlockAttestation>> {
  if (!map.has(slot)) {
    map.set(slot, new Map<string, Map<string, BlockAttestation>>());
  }
  return map.get(slot)!;
}

/**
 * Get Proposal or Default
 *
 * Fetch the proposal mapping, if it does not exist, then create a mapping and return it
 * @param map - The map to fetch from
 * @param proposalId - The proposal id to fetch
 * @returns The proposal mapping
 */
function getProposalOrDefault(
  map: Map<string, Map<string, BlockAttestation>>,
  proposalId: string,
): Map<string, BlockAttestation> {
  if (!map.has(proposalId)) {
    map.set(proposalId, new Map<string, BlockAttestation>());
  }
  return map.get(proposalId)!;
}
