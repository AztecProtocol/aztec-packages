import { createLogger } from '@aztec/foundation/log';
import type { BlockAttestation, BlockProposal } from '@aztec/stdlib/p2p';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import type { AttestationPool } from './attestation_pool.js';

export class InMemoryAttestationPool implements AttestationPool {
  private metrics: PoolInstrumentation<BlockAttestation>;

  private attestations: Map</*slot=*/ bigint, Map</*proposalId*/ string, Map</*address=*/ string, BlockAttestation>>>;
  private proposals: Map<string, BlockProposal>;

  constructor(
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('p2p:attestation_pool'),
  ) {
    this.attestations = new Map();
    this.proposals = new Map();
    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL, this.poolStats);
  }

  private poolStats: PoolStatsCallback = () => {
    return Promise.resolve({
      itemCount: this.attestations.size,
    });
  };

  public isEmpty(): Promise<boolean> {
    return Promise.resolve(this.attestations.size === 0);
  }

  public getAttestationsForSlot(slot: bigint): Promise<BlockAttestation[]> {
    return Promise.resolve(
      Array.from(this.attestations.get(slot)?.values() ?? []).flatMap(proposalAttestationMap =>
        Array.from(proposalAttestationMap.values()),
      ),
    );
  }

  public getAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<BlockAttestation[]> {
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
      const slotNumber = attestation.payload.header.slotNumber;

      const proposalId = attestation.archive.toString();
      const sender = attestation.getSender();

      // Skip attestations with invalid signatures
      if (!sender) {
        this.log.warn(`Skipping attestation with invalid signature for slot ${slotNumber.toBigInt()}`, {
          signature: attestation.signature.toString(),
          slotNumber,
          proposalId,
        });
        continue;
      }

      const slotAttestationMap = getSlotOrDefault(this.attestations, slotNumber.toBigInt());
      const proposalAttestationMap = getProposalOrDefault(slotAttestationMap, proposalId);
      proposalAttestationMap.set(sender.toString(), attestation);

      this.log.verbose(`Added attestation for slot ${slotNumber.toBigInt()} from ${sender}`, {
        signature: attestation.signature.toString(),
        slotNumber,
        address: sender,
        proposalId,
      });
    }

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
    const proposalIdsToDelete = this.attestations.get(slot)?.keys();
    let proposalIdsToDeleteCount = 0;
    proposalIdsToDelete?.forEach(proposalId => {
      this.proposals.delete(proposalId);
      proposalIdsToDeleteCount++;
    });

    this.attestations.delete(slot);
    this.log.verbose(
      `Removed ${numberOfAttestations} attestations and ${proposalIdsToDeleteCount} proposals for slot ${slot}`,
    );

    return Promise.resolve();
  }

  public deleteAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<void> {
    const slotAttestationMap = getSlotOrDefault(this.attestations, slot);
    if (slotAttestationMap) {
      if (slotAttestationMap.has(proposalId)) {
        const numberOfAttestations = slotAttestationMap.get(proposalId)?.size ?? 0;

        slotAttestationMap.delete(proposalId);

        this.log.verbose(`Removed ${numberOfAttestations} attestations for slot ${slot} and proposal ${proposalId}`);
      }
    }

    this.proposals.delete(proposalId);
    return Promise.resolve();
  }

  public deleteAttestations(attestations: BlockAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      const slotNumber = attestation.payload.header.slotNumber;
      const slotAttestationMap = this.attestations.get(slotNumber.toBigInt());
      if (slotAttestationMap) {
        const proposalId = attestation.archive.toString();
        const proposalAttestationMap = getProposalOrDefault(slotAttestationMap, proposalId);
        if (proposalAttestationMap) {
          const sender = attestation.getSender();

          // Skip attestations with invalid signatures
          if (!sender) {
            this.log.warn(`Skipping deletion of attestation with invalid signature for slot ${slotNumber.toBigInt()}`);
            continue;
          }

          proposalAttestationMap.delete(sender.toString());
          this.log.debug(`Deleted attestation for slot ${slotNumber} from ${sender}`);
        }
      }
    }
    return Promise.resolve();
  }

  public hasAttestation(attestation: BlockAttestation): Promise<boolean> {
    const slotNumber = attestation.payload.header.slotNumber;
    const proposalId = attestation.archive.toString();
    const sender = attestation.getSender();

    // Attestations with invalid signatures are never in the pool
    if (!sender) {
      return Promise.resolve(false);
    }

    const slotAttestationMap = this.attestations.get(slotNumber.toBigInt());
    if (!slotAttestationMap) {
      return Promise.resolve(false);
    }

    const proposalAttestationMap = slotAttestationMap.get(proposalId);
    if (!proposalAttestationMap) {
      return Promise.resolve(false);
    }

    return Promise.resolve(proposalAttestationMap.has(sender.toString()));
  }

  public addBlockProposal(blockProposal: BlockProposal): Promise<void> {
    // We initialize slot-proposal mapping if it does not exist
    // This is important to ensure we can delete this proposal if there were not attestations for it
    const slotProposalMapping = getSlotOrDefault(this.attestations, blockProposal.slotNumber.toBigInt());
    slotProposalMapping.set(blockProposal.payload.archive.toString(), new Map<string, BlockAttestation>());

    this.proposals.set(blockProposal.payload.archive.toString(), blockProposal);
    return Promise.resolve();
  }

  public getBlockProposal(id: string): Promise<BlockProposal | undefined> {
    return Promise.resolve(this.proposals.get(id));
  }

  public hasBlockProposal(idOrProposal: string | BlockProposal): Promise<boolean> {
    const id = typeof idOrProposal === 'string' ? idOrProposal : idOrProposal.payload.archive.toString();
    return Promise.resolve(this.proposals.has(id));
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
