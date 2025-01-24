import { type BlockAttestation } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import { type AttestationPool } from './attestation_pool.js';

export class InMemoryAttestationPool implements AttestationPool {
  private metrics: PoolInstrumentation<BlockAttestation>;

  private attestations: Map</*slot=*/ bigint, Map</*proposalId*/ string, Map</*address=*/ string, BlockAttestation>>>;

  constructor(telemetry: TelemetryClient = getTelemetryClient(), private log = createLogger('p2p:attestation_pool')) {
    this.attestations = new Map();
    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL);
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

  public addAttestations(attestations: BlockAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      // Perf: order and group by slot before insertion
      const slotNumber = attestation.payload.header.globalVariables.slotNumber;

      const proposalId = attestation.archive.toString();
      const address = attestation.getSender();

      const slotAttestationMap = getSlotOrDefault(this.attestations, slotNumber.toBigInt());
      const proposalAttestationMap = getProposalOrDefault(slotAttestationMap, proposalId);
      proposalAttestationMap.set(address.toString(), attestation);

      this.log.verbose(`Added attestation for slot ${slotNumber} from ${address}`);
    }

    // TODO: set these to pending or something ????
    this.metrics.recordAddedObjects(attestations.length);
    return Promise.resolve();
  }

  #getNumberOfAttestationsInSlot(slot: bigint): number {
    let total = 0;
    const slotAttestationMap = getSlotOrDefault(this.attestations, slot);

    if (slotAttestationMap) {
      for (const proposalAttestationMap of slotAttestationMap.values() ?? []) {
        total += proposalAttestationMap.size;
      }
    }
    return total;
  }

  public async deleteAttestationsOlderThan(oldestSlot: bigint): Promise<void> {
    const olderThan = [];

    // Entries are iterated in insertion order, so we can break as soon as we find a slot that is older than the oldestSlot.
    // Note: this will only prune correctly if attestations are added in order of rising slot, it is important that we do not allow
    // insertion of attestations that are old. #(https://github.com/AztecProtocol/aztec-packages/issues/10322)
    const slots = this.attestations.keys();
    for (const slot of slots) {
      if (slot < oldestSlot) {
        olderThan.push(slot);
      } else {
        break;
      }
    }

    for (const oldSlot of olderThan) {
      await this.deleteAttestationsForSlot(oldSlot);
    }
    return Promise.resolve();
  }

  public deleteAttestationsForSlot(slot: bigint): Promise<void> {
    // We count the number of attestations we are removing
    const numberOfAttestations = this.#getNumberOfAttestationsInSlot(slot);

    this.attestations.delete(slot);
    this.log.verbose(`Removed ${numberOfAttestations} attestations for slot ${slot}`);

    this.metrics.recordRemovedObjects(numberOfAttestations);
    return Promise.resolve();
  }

  public deleteAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<void> {
    const slotAttestationMap = getSlotOrDefault(this.attestations, slot);
    if (slotAttestationMap) {
      if (slotAttestationMap.has(proposalId)) {
        const numberOfAttestations = slotAttestationMap.get(proposalId)?.size ?? 0;

        slotAttestationMap.delete(proposalId);

        this.log.verbose(`Removed ${numberOfAttestations} attestations for slot ${slot} and proposal ${proposalId}`);
        this.metrics.recordRemovedObjects(numberOfAttestations);
      }
    }
    return Promise.resolve();
  }

  public deleteAttestations(attestations: BlockAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      const slotNumber = attestation.payload.header.globalVariables.slotNumber;
      const slotAttestationMap = this.attestations.get(slotNumber.toBigInt());
      if (slotAttestationMap) {
        const proposalId = attestation.archive.toString();
        const proposalAttestationMap = getProposalOrDefault(slotAttestationMap, proposalId);
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
