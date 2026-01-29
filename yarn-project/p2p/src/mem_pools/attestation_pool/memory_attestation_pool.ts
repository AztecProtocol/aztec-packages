import type { SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import type { BlockProposal, CheckpointAttestation, CheckpointProposalCore } from '@aztec/stdlib/p2p';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import type { AttestationPool, TryAddProposalResult } from './attestation_pool.js';
import { ATTESTATION_CAP_BUFFER, MAX_PROPOSALS_PER_POSITION, MAX_PROPOSALS_PER_SLOT } from './kv_attestation_pool.js';

export class InMemoryAttestationPool implements AttestationPool {
  private metrics: PoolInstrumentation<CheckpointAttestation>;

  private proposals: Map<string, BlockProposal>;

  // Checkpoint attestations
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  private checkpointAttestations: Map<
    /*slot=*/ SlotNumber,
    Map</*proposalId*/ string, Map</*address=*/ string, CheckpointAttestation>>
  >;
  private checkpointProposals: Map<string, CheckpointProposalCore>;

  // Checkpoint proposals indexed by slot for duplicate detection
  // Key: slot number, Value: Set of proposal archives
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  private checkpointProposalsForSlot: Map<SlotNumber, Set<string>>;

  // Block proposals indexed by position for duplicate detection
  // Key: slot number, Value: Map of "indexWithinCheckpoint" -> Set of archives
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  private blockProposalsForSlot: Map<SlotNumber, Map<number, Set<string>>>;

  constructor(
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('p2p:attestation_pool'),
  ) {
    this.proposals = new Map();
    this.checkpointAttestations = new Map();
    this.checkpointProposals = new Map();
    this.checkpointProposalsForSlot = new Map();
    this.blockProposalsForSlot = new Map();
    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL, this.poolStats);
  }

  private poolStats: PoolStatsCallback = () => {
    return Promise.resolve({
      itemCount: this.checkpointAttestations.size,
    });
  };

  public isEmpty(): Promise<boolean> {
    return Promise.resolve(this.checkpointAttestations.size === 0 && this.proposals.size === 0);
  }

  public tryAddBlockProposal(blockProposal: BlockProposal): Promise<TryAddProposalResult> {
    const proposalId = blockProposal.archive.toString();
    const slot = blockProposal.slotNumber;
    const index = blockProposal.indexWithinCheckpoint;

    // 1. Check if already exists
    const alreadyExists = this.proposals.has(proposalId);
    if (alreadyExists) {
      const totalForPosition = this.getBlockProposalCountForPosition(slot, index);
      return Promise.resolve({ added: false, alreadyExists: true, totalForPosition });
    }

    // 2. Get current count for position
    const totalForPosition = this.getBlockProposalCountForPosition(slot, index);

    // 3. Check cap
    if (totalForPosition >= MAX_PROPOSALS_PER_POSITION) {
      return Promise.resolve({ added: false, alreadyExists: false, totalForPosition });
    }

    // 4. Add the proposal
    this.addBlockProposal(blockProposal);

    return Promise.resolve({ added: true, alreadyExists: false, totalForPosition: totalForPosition + 1 });
  }

  /** Gets the count of block proposals for a given position (slot, indexWithinCheckpoint). */
  private getBlockProposalCountForPosition(slot: SlotNumber, indexWithinCheckpoint: number): number {
    const slotMap = this.blockProposalsForSlot.get(slot);
    if (!slotMap) {
      return 0;
    }
    const archives = slotMap.get(indexWithinCheckpoint);
    return archives?.size ?? 0;
  }

  private addBlockProposal(blockProposal: BlockProposal): void {
    // Strip signedTxs before storing to avoid holding full tx data in memory
    this.proposals.set(blockProposal.archive.toString(), blockProposal.withoutSignedTxs());

    // Index by slot and position for duplicate detection
    const slot = blockProposal.slotNumber;
    const index = blockProposal.indexWithinCheckpoint;
    const archive = blockProposal.archive.toString();

    if (!this.blockProposalsForSlot.has(slot)) {
      this.blockProposalsForSlot.set(slot, new Map());
    }
    const slotMap = this.blockProposalsForSlot.get(slot)!;
    if (!slotMap.has(index)) {
      slotMap.set(index, new Set());
    }
    slotMap.get(index)!.add(archive);
  }

  public getBlockProposal(id: string): Promise<BlockProposal | undefined> {
    return Promise.resolve(this.proposals.get(id));
  }

  // Checkpoint attestation methods

  public tryAddCheckpointProposal(proposal: CheckpointProposalCore): Promise<TryAddProposalResult> {
    const proposalId = proposal.archive.toString();

    // 1. Check if already exists
    const alreadyExists = this.checkpointProposals.has(proposalId);
    if (alreadyExists) {
      const totalForPosition = this.getCheckpointProposalCountForSlot(proposal.slotNumber);
      return Promise.resolve({ added: false, alreadyExists: true, totalForPosition });
    }

    // 2. Get current count for slot
    const totalForPosition = this.getCheckpointProposalCountForSlot(proposal.slotNumber);

    // 3. Check cap
    if (totalForPosition >= MAX_PROPOSALS_PER_SLOT) {
      return Promise.resolve({ added: false, alreadyExists: false, totalForPosition });
    }

    // 4. Add the proposal
    this.addCheckpointProposal(proposal);

    return Promise.resolve({ added: true, alreadyExists: false, totalForPosition: totalForPosition + 1 });
  }

  /** Gets the count of checkpoint proposals for a given slot. */
  private getCheckpointProposalCountForSlot(slot: SlotNumber): number {
    return this.checkpointProposalsForSlot.get(slot)?.size ?? 0;
  }

  private addCheckpointProposal(proposal: CheckpointProposalCore): void {
    const proposalId = proposal.archive.toString();
    const slot = proposal.slotNumber;

    const slotProposalMapping = getCheckpointSlotOrDefault(this.checkpointAttestations, slot);
    slotProposalMapping.set(proposalId, new Map<string, CheckpointAttestation>());

    // Store the checkpoint proposal
    this.checkpointProposals.set(proposalId, proposal);

    // Index by slot for duplicate detection
    if (!this.checkpointProposalsForSlot.has(slot)) {
      this.checkpointProposalsForSlot.set(slot, new Set());
    }
    this.checkpointProposalsForSlot.get(slot)!.add(proposalId);
  }

  public getCheckpointProposal(id: string): Promise<CheckpointProposalCore | undefined> {
    return Promise.resolve(this.checkpointProposals.get(id));
  }

  public addCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      const slotNumber = attestation.payload.header.slotNumber;
      const proposalId = attestation.archive.toString();
      const sender = attestation.getSender();

      // Skip attestations with invalid signatures
      if (!sender) {
        this.log.warn(`Skipping checkpoint attestation with invalid signature for slot ${slotNumber}`, {
          signature: attestation.signature.toString(),
          slotNumber,
          proposalId,
        });
        continue;
      }

      const slotAttestationMap = getCheckpointSlotOrDefault(this.checkpointAttestations, slotNumber);
      const proposalAttestationMap = getCheckpointProposalOrDefault(slotAttestationMap, proposalId);
      proposalAttestationMap.set(sender.toString(), attestation);

      this.log.verbose(`Added checkpoint attestation for slot ${slotNumber} from ${sender}`, {
        signature: attestation.signature.toString(),
        slotNumber,
        address: sender,
        proposalId,
      });
    }

    return Promise.resolve();
  }

  public getCheckpointAttestationsForSlot(slot: SlotNumber): Promise<CheckpointAttestation[]> {
    return Promise.resolve(
      Array.from(this.checkpointAttestations.get(slot)?.values() ?? []).flatMap(proposalAttestationMap =>
        Array.from(proposalAttestationMap.values()),
      ),
    );
  }

  public getCheckpointAttestationsForSlotAndProposal(
    slot: SlotNumber,
    proposalId: string,
  ): Promise<CheckpointAttestation[]> {
    const slotAttestationMap = this.checkpointAttestations.get(slot);
    if (slotAttestationMap) {
      const proposalAttestationMap = slotAttestationMap.get(proposalId);
      if (proposalAttestationMap) {
        return Promise.resolve(Array.from(proposalAttestationMap.values()));
      }
    }
    return Promise.resolve([]);
  }

  public deleteOlderThan(oldestSlot: SlotNumber): Promise<void> {
    const olderThan: SlotNumber[] = [];

    const slots = this.checkpointAttestations.keys();
    for (const slot of slots) {
      if (slot < oldestSlot) {
        olderThan.push(slot);
      } else {
        break;
      }
    }

    for (const oldSlot of olderThan) {
      const proposalIds = this.checkpointAttestations.get(oldSlot)?.keys();
      proposalIds?.forEach(proposalId => this.checkpointProposals.delete(proposalId));
      this.checkpointAttestations.delete(oldSlot);
      this.checkpointProposalsForSlot.delete(oldSlot);
    }

    // Also clean up block proposals for old slots
    for (const slot of this.blockProposalsForSlot.keys()) {
      if (slot < oldestSlot) {
        this.blockProposalsForSlot.delete(slot);
      }
    }

    return Promise.resolve();
  }

  public hasReachedCheckpointAttestationCap(
    slot: SlotNumber,
    proposalId: string,
    committeeSize: number,
  ): Promise<boolean> {
    const limit = committeeSize + ATTESTATION_CAP_BUFFER;
    const count = this.checkpointAttestations.get(slot)?.get(proposalId)?.size ?? 0;
    return Promise.resolve(limit <= 0 || count >= limit);
  }

  public async canAddCheckpointAttestation(
    attestation: CheckpointAttestation,
    committeeSize: number,
  ): Promise<boolean> {
    const sender = attestation.getSender();
    const slot = attestation.payload.header.slotNumber;
    const pid = attestation.archive.toString();
    return (
      !!sender &&
      ((this.checkpointAttestations.get(slot)?.get(pid)?.has(sender.toString()) ?? false) ||
        !(await this.hasReachedCheckpointAttestationCap(slot, pid, committeeSize)))
    );
  }

  public hasCheckpointAttestation(attestation: CheckpointAttestation): Promise<boolean> {
    const slotNumber = attestation.payload.header.slotNumber;
    const proposalId = attestation.archive.toString();
    const sender = attestation.getSender();

    // Attestations with invalid signatures are never in the pool
    if (!sender) {
      return Promise.resolve(false);
    }

    const slotAttestationMap = this.checkpointAttestations.get(slotNumber);
    if (!slotAttestationMap) {
      return Promise.resolve(false);
    }

    const proposalAttestationMap = slotAttestationMap.get(proposalId);
    if (!proposalAttestationMap) {
      return Promise.resolve(false);
    }

    return Promise.resolve(proposalAttestationMap.has(sender.toString()));
  }
}

// Checkpoint attestation helper functions

function getCheckpointSlotOrDefault(
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  map: Map<SlotNumber, Map<string, Map<string, CheckpointAttestation>>>,
  slot: SlotNumber,
): Map<string, Map<string, CheckpointAttestation>> {
  if (!map.has(slot)) {
    map.set(slot, new Map<string, Map<string, CheckpointAttestation>>());
  }
  return map.get(slot)!;
}

function getCheckpointProposalOrDefault(
  map: Map<string, Map<string, CheckpointAttestation>>,
  proposalId: string,
): Map<string, CheckpointAttestation> {
  if (!map.has(proposalId)) {
    map.set(proposalId, new Map<string, CheckpointAttestation>());
  }
  return map.get(proposalId)!;
}
