import { type BlockAttestation } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';

import { type AttestationPool } from './attestation_pool.js';

export class InMemoryAttestationPool implements AttestationPool {
  // TODO: change this from string to a bigint for addressing
  // TODO: make private
  private attestations: Map</*slot=*/ bigint, Map</*address=*/ string, BlockAttestation>>;

  constructor(private log = createDebugLogger('aztec:attestation_pool')) {
    this.attestations = new Map();
  }

  public getAttestationsForSlot(slot: bigint): Promise<BlockAttestation[]> {
    const slotAttestationMap = this.attestations.get(slot);
    if (slotAttestationMap) {
      return Promise.resolve(Array.from(slotAttestationMap.values()));
    } else {
      return Promise.resolve([]);
    }
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

      const slotAttestationMap = getOrDefault(this.attestations, slotNumber.toBigInt());
      slotAttestationMap.set(address.toString(), attestation);

      this.log.verbose(`Added attestation for slot ${slotNumber} from ${address}`);
    }
  }

  /**
   * Drop all attestations collected for a given slot
   */
  public deleteAttestationsForSlot(slot: bigint): Promise<void> {
    // TODO(md): check if this will free the memory of the inner hash map
    this.attestations.delete(slot);
    this.log.verbose(`Removed attestation for slot ${slot}`);
    return Promise.resolve();
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
    return Promise.resolve();
  }
}

// If the slot is not in the map, create a new map and add it to the map
function getOrDefault(map: Map<bigint, Map<string, BlockAttestation>>, slot: bigint): Map<string, BlockAttestation> {
  if (!map.has(slot)) {
    map.set(slot, new Map<string, BlockAttestation>());
  }
  return map.get(slot)!;
}
