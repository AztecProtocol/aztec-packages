import { BlockAttestation } from '@aztec/circuit-types';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMapWithSize, type AztecMultiMap } from '@aztec/kv-store';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import { type AttestationPool } from './attestation_pool.js';

export class KvAttestationPool implements AttestationPool {
  private metrics: PoolInstrumentation<BlockAttestation>;

  // Index of all proposal ids in a slot
  private attestations: AztecMultiMap<string, string>;

  constructor(
    private store: AztecKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('aztec:attestation_pool'),
  ) {
    this.attestations = store.openMultiMap('attestations');
    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL);
  }

  private getProposalMapKey(slot: string, proposalId: string): string {
    return `proposal-${slot}-${proposalId}`;
  }

  /**
   * Get the proposal map for a given slot and proposalId
   *
   * Essentially a nested mapping of address -> attestation
   *
   * @param slot - The slot to get the proposal map for
   * @param proposalId - The proposalId to get the map for
   * @returns The proposal map
   */
  private getProposalMap(slot: string, proposalId: string): AztecMapWithSize<string, Buffer> {
    const mapKey = this.getProposalMapKey(slot, proposalId);
    return this.store.openMapWithSize(mapKey);
  }

  public async addAttestations(attestations: BlockAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      const slotNumber = attestation.payload.header.globalVariables.slotNumber.toString();
      const proposalId = attestation.archive.toString();
      const address = attestation.getSender().toString();

      // Index the proposalId in the slot map
      await this.attestations.set(slotNumber, proposalId);

      // Store the actual attestation in the proposal map
      const proposalMap = this.getProposalMap(slotNumber, proposalId);
      await proposalMap.set(address, attestation.toBuffer());

      this.log.verbose(`Added attestation for slot ${slotNumber} from ${address}`);
    }

    this.metrics.recordAddedObjects(attestations.length);
  }

  public getAttestationsForSlot(slot: bigint, proposalId: string): Promise<BlockAttestation[]> {
    const slotNumber = new Fr(slot).toString();
    const proposalMap = this.getProposalMap(slotNumber, proposalId);
    const attestations = proposalMap.values();
    const attestationsArray = Array.from(attestations).map(attestation => BlockAttestation.fromBuffer(attestation));
    return Promise.resolve(attestationsArray);
  }

  public async deleteAttestationsOlderThan(oldestSlot: bigint): Promise<void> {
    const olderThan = [];

    const slots = this.attestations.keys();
    for (const slot of slots) {
      if (BigInt(slot) < oldestSlot) {
        olderThan.push(slot);
      }
    }

    await Promise.all(olderThan.map(oldSlot => this.deleteAttestationsForSlot(BigInt(oldSlot))));
    return Promise.resolve();
  }

  public async deleteAttestationsForSlot(slot: bigint): Promise<void> {
    const deletionPromises = [];

    const slotString = new Fr(slot).toString();
    let numberOfAttestations = 0;
    const proposalIds = this.attestations.getValues(slotString);

    if (proposalIds) {
      for (const proposalId of proposalIds) {
        const proposalMap = this.getProposalMap(slotString, proposalId);
        numberOfAttestations += proposalMap.size();
        deletionPromises.push(proposalMap.clear());
      }
    }

    await Promise.all(deletionPromises);

    this.log.verbose(`Removed ${numberOfAttestations} attestations for slot ${slot}`);
    this.metrics.recordRemovedObjects(numberOfAttestations);
    return Promise.resolve();
  }

  public async deleteAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<void> {
    const deletionPromises = [];

    const slotString = new Fr(slot).toString();
    const exists = this.attestations.get(slotString);

    if (exists) {
      // Remove the proposalId from the slot index
      deletionPromises.push(this.attestations.deleteValue(slotString, proposalId));

      // Delete all attestations for the proposalId
      const proposalMap = this.getProposalMap(slotString, proposalId);
      const numberOfAttestations = proposalMap.size();
      deletionPromises.push(proposalMap.clear());

      this.log.verbose(`Removed ${numberOfAttestations} attestations for slot ${slot} and proposal ${proposalId}`);
      this.metrics.recordRemovedObjects(numberOfAttestations);
    }

    await Promise.all(deletionPromises);
    return Promise.resolve();
  }

  public async deleteAttestations(attestations: BlockAttestation[]): Promise<void> {
    const deletionPromises = [];

    for (const attestation of attestations) {
      const slotNumber = attestation.payload.header.globalVariables.slotNumber.toString();
      const proposalId = attestation.archive.toString();
      const proposalMap = this.getProposalMap(slotNumber, proposalId);

      if (proposalMap) {
        const address = attestation.getSender().toString();
        deletionPromises.push(proposalMap.delete(address));
        this.log.debug(`Deleted attestation for slot ${slotNumber} from ${address}`);
      }

      if (proposalMap.size() === 0) {
        deletionPromises.push(this.attestations.deleteValue(slotNumber, proposalId));
      }
    }

    await Promise.all(deletionPromises);

    this.metrics.recordRemovedObjects(attestations.length);
    return Promise.resolve();
  }
}
