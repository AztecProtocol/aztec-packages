import { type BlockAttestation } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import { type AttestationPool } from './attestation_pool.js';
import { AztecKVStore, AztecMap, AztecMultiMapWithSize  } from '@aztec/kv-store';

export class KvAttestationPool implements AttestationPool {
  private metrics: PoolInstrumentation<BlockAttestation>;


  // TODO: fix all of this up - this is a mess
  private attestations: AztecMap<string, string>; // Store slot -> slotMapKey
  private slotMaps: Map<string, AztecMultiMapWithSize<string, string>>; // Cache of slot maps
  private proposalMaps: Map<string, AztecMultiMapWithSize<string, BlockAttestation>>; // Cache of proposal maps

  constructor(private store: AztecKVStore, telemetry: TelemetryClient, private log = createDebugLogger('aztec:attestation_pool')) {
    this.attestations = store.openMap('attestations');
    this.slotMaps = new Map();
    this.proposalMaps = new Map();
    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL);
  }

  private getSlotMapKey(slot: string): string {
    return `slot-${slot}`;
  }

  private getProposalMapKey(proposalId: string): string {
    return `proposal-${proposalId}`;
  }

  private getSlotMap(slot: string): AztecMultiMapWithSize<string, string> {
    const mapKey = this.getSlotMapKey(slot);
    if (!this.slotMaps.has(mapKey)) {
      this.slotMaps.set(mapKey, this.store.openMultiMapWithSize(mapKey));
    }
    return this.slotMaps.get(mapKey)!;
  }

  private getProposalMap(proposalId: string): AztecMultiMapWithSize<string, BlockAttestation> {
    const mapKey = this.getProposalMapKey(proposalId);
    if (!this.proposalMaps.has(mapKey)) {
      this.proposalMaps.set(mapKey, this.store.openMultiMapWithSize(mapKey));
    }
    return this.proposalMaps.get(mapKey)!;
  }

  public async addAttestations(attestations: BlockAttestation[]): Promise<void> {
      for (const attestation of attestations) {
        const slotNumber = attestation.payload.header.globalVariables.slotNumber.toString();
        const proposalId = attestation.archive.toString();
        const address = attestation.getSender().toString();

        // Get or create slot map
        const slotMapKey = this.getSlotMapKey(slotNumber);
        if (!this.attestations.has(slotNumber)) {
          await this.attestations.set(slotNumber, slotMapKey);
        }

        // Get slot map and store proposal reference
        const slotMap = this.getSlotMap(slotNumber);
        const proposalMapKey = this.getProposalMapKey(proposalId);
        await slotMap.set(proposalId, proposalMapKey);

        // Store the actual attestation in the proposal map
        const proposalMap = this.getProposalMap(proposalId);
        await proposalMap.set(address, attestation);

        this.log.verbose(`Added attestation for slot ${slotNumber} from ${address}`);
      }

    this.metrics.recordAddedObjects(attestations.length);
  }

  public async getAttestationsForSlot(slot: bigint, proposalId: string): Promise<BlockAttestation[]> {
    const slotString = this.getSlotMapKey(slot.toString());
    if (!this.attestations.has(slotString)) {
      return [];
    }

    const slotMap = this.getSlotMap(slotString);
    if (!slotMap.has(proposalId)) {
      return [];
    }

    const proposalMap = this.getProposalMap(proposalId);
    return Array.from(proposalMap.values());
  }

  #getNumberOfAttestationsInSlot(slot: bigint): number {
    let total = 0;
    const slotMap = this.getSlotMap(slot.toString());

    if (slotMap) {
      for (const proposalAttestationMapName of slotMap.values() ?? []) {
        const proposalMap = this.getProposalMap(proposalAttestationMapName);
        total += proposalMap.size();
      }
    }
    return total;
  }

  public async deleteAttestationsOlderThan(oldestSlot: bigint): Promise<void> {
    const olderThan = [];

    const slots = this.attestations.keys();
    for (const slot of slots) {
      if (BigInt(slot) < oldestSlot) {
        olderThan.push(slot);
      } else {
        break;
      }
    }

    for (const oldSlot of olderThan) {
      await this.deleteAttestationsForSlot(BigInt(oldSlot));
    }
    return Promise.resolve();
  }

  public deleteAttestationsForSlot(slot: bigint): Promise<void> {
    const numberOfAttestations = this.#getNumberOfAttestationsInSlot(slot);
    this.attestations.delete(this.getSlotMapKey(slot.toString()));

    // TODO: delete from store

    this.log.verbose(`Removed ${numberOfAttestations} attestations for slot ${slot}`);
    this.metrics.recordRemovedObjects(numberOfAttestations);
    return Promise.resolve();
  }

  public async deleteAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<void> {
    const slotAttestationMap = await getSlotOrDefault(this.store, this.attestations, this.getSlotKey(slot));
    if (slotAttestationMap) {
      if (slotAttestationMap.has(proposalId)) {
        const numberOfAttestations = slotAttestationMap.get(proposalId)?.size() ?? 0;

        slotAttestationMap.delete(proposalId);

        this.log.verbose(`Removed ${numberOfAttestations} attestations for slot ${slot} and proposal ${proposalId}`);
        this.metrics.recordRemovedObjects(numberOfAttestations);
      }
    }
    return Promise.resolve();
  }

  public async deleteAttestations(attestations: BlockAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      const slotNumber = attestation.payload.header.globalVariables.slotNumber;
      const slotAttestationMap = (slotNumber.toString());
      if (slotAttestationMap) {
        const proposalId = attestation.archive.toString();
        const proposalAttestationMap = await getProposalOrDefault(this.store, slotAttestationMap, proposalId);
        if (proposalAttestationMap) {
          const address = attestation.getSender();
          proposalAttestationMap.delete(address.toString());
          this.log.debug(`Deleted attestation for slot ${slotNumber} from ${address}`);
        }
      }
    }
    this.metrics.recordRemovedObjects(attestations.length);
    return Promise.resolve();
  }
}

/**
 * Get Slot or Default
 *
 * Fetch the slot mapping, if it does not exist, then create a mapping and return it
 * @param store - The store to fetch from
 * @param map - The map to fetch from
 * @param slot - The slot to fetch
 * @returns The slot mapping
 */
async function getSlotOrDefault(
  store: AztecKVStore,
  map: AztecMap<string, AztecMultiMapWithSize<string, AztecMultiMapWithSize<string, BlockAttestation>>>,
  slot: string,
): Promise<AztecMultiMapWithSize<string, AztecMultiMapWithSize<string, BlockAttestation>>> {
  if (!map.has(slot)) {
    const newMap = store.openMultiMapWithSize<string, AztecMultiMapWithSize<string, BlockAttestation>>(`slot-${slot}`);
    await map.set(slot, newMap);
    return newMap;
  }
  return map.get(slot)!;
}

/**
 * Get Proposal or Default
 *
 * Fetch the proposal mapping, if it does not exist, then create a mapping and return it
 * @param store - The store to fetch from
 * @param map - The map to fetch from
 * @param proposalId - The proposal id to fetch
 * @returns The proposal mapping
 */
async function getProposalOrDefault(
  store: AztecKVStore,
  map: AztecMultiMapWithSize<string, AztecMultiMapWithSize<string, BlockAttestation>>,
  proposalId: string,
): Promise<AztecMultiMapWithSize<string, BlockAttestation>> {
  if (!map.has(proposalId)) {
    const newMap = store.openMultiMapWithSize<string, BlockAttestation>(`proposal-${proposalId}`);
    await map.set(proposalId, newMap);
    return newMap;
  }
  return map.get(proposalId)!;
}
