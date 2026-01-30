import { IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  type CheckpointProposalCore,
} from '@aztec/stdlib/p2p';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import type { AttestationPool, TryAddResult } from './attestation_pool.js';

export const MAX_PROPOSALS_PER_SLOT = 5;
export const MAX_PROPOSALS_PER_POSITION = 3;
export const ATTESTATION_CAP_BUFFER = 10;

export class KvAttestationPool implements AttestationPool {
  private metrics: PoolInstrumentation<CheckpointAttestation>;

  // Checkpoint attestations from attestation key (slot-proposalId-signer) to serialized CheckpointAttestation
  // Keys are lexicographically sortable allowing range queries by slot or by (slot, proposalId)
  private checkpointAttestations: AztecAsyncMap<string, Buffer>;

  // Checkpoint proposals from proposal archive to serialized CheckpointProposal
  private checkpointProposals: AztecAsyncMap<string, Buffer>;

  // Checkpoint proposals indexed by slot for querying all proposals in a slot
  // Key: slot number, Value: proposal archive strings
  private checkpointProposalsForSlot: AztecAsyncMultiMap<number, string>;

  // Block proposals from proposal archive to serialized BlockProposal
  private blockProposals: AztecAsyncMap<string, Buffer>;

  // Block proposals indexed by slot and index-within-checkpoint for duplicate detection
  // Key: (slot << 10) | indexWithinCheckpoint, Value: archive string
  private blockProposalsForSlotAndIndex: AztecAsyncMultiMap<number, string>;

  constructor(
    private store: AztecAsyncKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('aztec:attestation_pool'),
  ) {
    // Initialize block proposal storage
    this.blockProposals = store.openMap('proposals');
    this.blockProposalsForSlotAndIndex = store.openMultiMap('block_proposals_for_slot_and_index');

    // Initialize checkpoint attestations storage
    this.checkpointAttestations = store.openMap('checkpoint_attestations');

    // Initialize checkpoint proposal storage
    this.checkpointProposals = store.openMap('checkpoint_proposals');
    this.checkpointProposalsForSlot = store.openMultiMap('checkpoint_proposals_for_slot');

    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL, this.poolStats);
  }

  private poolStats: PoolStatsCallback = async () => {
    return {
      itemCount: await this.checkpointAttestations.sizeAsync(),
    };
  };

  public async isEmpty(): Promise<boolean> {
    for await (const _ of this.checkpointAttestations.entriesAsync()) {
      return false;
    }
    for await (const _ of this.blockProposals.entriesAsync()) {
      return false;
    }
    return true;
  }

  private getProposalKey(slot: number | bigint | Fr | string, proposalId: Fr | string | Buffer): string {
    const slotStr = typeof slot === 'string' ? slot : new Fr(slot).toString();
    const proposalIdStr =
      typeof proposalId === 'string'
        ? proposalId
        : Buffer.isBuffer(proposalId)
          ? Fr.fromBuffer(proposalId).toString()
          : proposalId.toString();

    return `${slotStr}-${proposalIdStr}`;
  }

  private getAttestationKey(slot: number | bigint | Fr | string, proposalId: Fr | string, address: string): string {
    return `${this.getProposalKey(slot, proposalId)}-${address}`;
  }

  /** Returns range bounds for querying all attestations for a given slot. */
  private getAttestationKeyRangeForSlot(slot: SlotNumber): { start: string; end: string } {
    const slotStr = new Fr(slot).toString();
    return { start: `${slotStr}-`, end: `${slotStr}-Z` }; // 'Z' sorts after any hex character
  }

  /** Returns range bounds for querying all attestations for a given (slot, proposalId). */
  private getAttestationKeyRangeForProposal(slot: SlotNumber, proposalId: string): { start: string; end: string } {
    const proposalKey = this.getProposalKey(slot, proposalId);
    return { start: `${proposalKey}-`, end: `${proposalKey}-Z` };
  }

  /** Number of bits reserved for indexWithinCheckpoint in position keys. */
  private static readonly INDEX_BITS = 10;
  /** Maximum indexWithinCheckpoint value (2^10 - 1 = 1023). */
  private static readonly MAX_INDEX = (1 << KvAttestationPool.INDEX_BITS) - 1;

  /** Creates a position key for block proposals: (slot << 10) | indexWithinCheckpoint. */
  private getBlockPositionKey(slot: number, indexWithinCheckpoint: number): number {
    if (indexWithinCheckpoint > KvAttestationPool.MAX_INDEX) {
      throw new Error(
        `Value for indexWithinCheckpoint ${indexWithinCheckpoint} exceeds maximum ${KvAttestationPool.MAX_INDEX}`,
      );
    }
    return (slot << KvAttestationPool.INDEX_BITS) | indexWithinCheckpoint;
  }

  public async tryAddBlockProposal(blockProposal: BlockProposal): Promise<TryAddResult> {
    const proposalId = blockProposal.archive.toString();

    // Check if already exists
    const alreadyExists = await this.blockProposals.hasAsync(proposalId);
    if (alreadyExists) {
      const totalForPosition = await this.getBlockProposalCountForPosition(
        blockProposal.slotNumber,
        blockProposal.indexWithinCheckpoint,
      );
      return { added: false, alreadyExists: true, totalForPosition };
    }

    // Get current count for position and check cap, do not add if exceeded
    const totalForPosition = await this.getBlockProposalCountForPosition(
      blockProposal.slotNumber,
      blockProposal.indexWithinCheckpoint,
    );

    if (totalForPosition >= MAX_PROPOSALS_PER_POSITION) {
      return { added: false, alreadyExists: false, totalForPosition };
    }

    // Add the proposal
    await this.addBlockProposal(blockProposal);

    return { added: true, alreadyExists: false, totalForPosition: totalForPosition + 1 };
  }

  /** Gets the count of block proposals for a given position (slot, indexWithinCheckpoint). */
  private getBlockProposalCountForPosition(
    slot: SlotNumber,
    indexWithinCheckpoint: IndexWithinCheckpoint,
  ): Promise<number> {
    const positionKey = this.getBlockPositionKey(slot, indexWithinCheckpoint);
    return this.blockProposalsForSlotAndIndex.getValueCountAsync(positionKey);
  }

  private async addBlockProposal(blockProposal: BlockProposal): Promise<void> {
    await this.store.transactionAsync(async () => {
      const proposalId = blockProposal.archive.toString();
      // Strip signedTxs before storing to avoid persisting full tx data
      await this.blockProposals.set(proposalId, blockProposal.withoutSignedTxs().toBuffer());

      // Index by slot and position for duplicate detection
      const positionKey = this.getBlockPositionKey(blockProposal.slotNumber, blockProposal.indexWithinCheckpoint);
      await this.blockProposalsForSlotAndIndex.set(positionKey, proposalId);
    });
  }

  public async getBlockProposal(id: string): Promise<BlockProposal | undefined> {
    const buffer = await this.blockProposals.getAsync(id);
    try {
      if (buffer && buffer.length > 0) {
        return BlockProposal.fromBuffer(buffer);
      }
    } catch {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(undefined);
  }

  public async tryAddCheckpointProposal(proposal: CheckpointProposalCore): Promise<TryAddResult> {
    const proposalId = proposal.archive.toString();

    // Check if already exists
    const alreadyExists = await this.checkpointProposals.hasAsync(proposalId);
    if (alreadyExists) {
      const totalForPosition = await this.checkpointProposalsForSlot.getValueCountAsync(proposal.slotNumber);
      return { added: false, alreadyExists: true, totalForPosition };
    }

    // Get current count for slot and check cap
    const totalForPosition = await this.checkpointProposalsForSlot.getValueCountAsync(proposal.slotNumber);
    if (totalForPosition >= MAX_PROPOSALS_PER_SLOT) {
      return { added: false, alreadyExists: false, totalForPosition };
    }

    // Add the proposal if cap not exceeded
    await this.addCheckpointProposal(proposal);

    return { added: true, alreadyExists: false, totalForPosition: totalForPosition + 1 };
  }

  private async addCheckpointProposal(proposal: CheckpointProposalCore): Promise<void> {
    await this.store.transactionAsync(async () => {
      const slotKey = proposal.slotNumber;
      const proposalId = proposal.archive.toString();

      await this.checkpointProposalsForSlot.set(slotKey, proposalId);
      await this.checkpointProposals.set(proposalId, proposal.toBuffer());
    });
  }

  public async getCheckpointProposal(id: string): Promise<CheckpointProposalCore | undefined> {
    const buffer = await this.checkpointProposals.getAsync(id);
    try {
      if (buffer && buffer.length > 0) {
        return CheckpointProposal.fromBuffer(buffer);
      }
    } catch {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(undefined);
  }

  public async addCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    await this.store.transactionAsync(async () => {
      for (const attestation of attestations) {
        const slotNumber = attestation.payload.header.slotNumber;
        const proposalId = attestation.archive;
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

        const address = sender.toString();

        await this.checkpointAttestations.set(
          this.getAttestationKey(slotNumber, proposalId, address),
          attestation.toBuffer(),
        );

        this.log.verbose(`Added checkpoint attestation for slot ${slotNumber} from ${address}`, {
          signature: attestation.signature.toString(),
          slotNumber,
          address,
          proposalId,
        });
      }
    });
  }

  public async getCheckpointAttestationsForSlot(slot: SlotNumber): Promise<CheckpointAttestation[]> {
    const range = this.getAttestationKeyRangeForSlot(slot);
    const attestations: CheckpointAttestation[] = [];

    for await (const [_, buf] of this.checkpointAttestations.entriesAsync(range)) {
      attestations.push(CheckpointAttestation.fromBuffer(buf));
    }

    return attestations;
  }

  public async getCheckpointAttestationsForSlotAndProposal(
    slot: SlotNumber,
    proposalId: string,
  ): Promise<CheckpointAttestation[]> {
    const range = this.getAttestationKeyRangeForProposal(slot, proposalId);
    const attestations: CheckpointAttestation[] = [];

    for await (const [_, buf] of this.checkpointAttestations.entriesAsync(range)) {
      attestations.push(CheckpointAttestation.fromBuffer(buf));
    }

    return attestations;
  }

  public async deleteOlderThan(oldestSlot: SlotNumber): Promise<void> {
    let numberOfAttestations = 0;
    let numberOfCheckpointProposals = 0;
    let numberOfBlockPositions = 0;

    await this.store.transactionAsync(async () => {
      // Delete checkpoint attestations with slot < oldestSlot
      // Attestation keys start with Fr(slot).toString(), so we use end bound of Fr(oldestSlot).toString()
      const attestationEndKey = new Fr(oldestSlot).toString();
      for await (const key of this.checkpointAttestations.keysAsync({ end: attestationEndKey })) {
        await this.checkpointAttestations.delete(key);
        numberOfAttestations++;
      }

      // Delete checkpoint proposals for slots < oldestSlot, using checkpointProposalsForSlot as index
      for await (const slot of this.checkpointProposalsForSlot.keysAsync({ end: oldestSlot })) {
        const proposalIds = await toArray(this.checkpointProposalsForSlot.getValuesAsync(slot));
        for (const proposalId of proposalIds) {
          await this.checkpointProposals.delete(proposalId);
          numberOfCheckpointProposals++;
        }
        await this.checkpointProposalsForSlot.delete(slot);
      }

      // Delete block proposal position index for slots < oldestSlot
      // Key format: (slot << INDEX_BITS) | indexWithinCheckpoint
      const blockPositionEndKey = oldestSlot << KvAttestationPool.INDEX_BITS;
      for await (const positionKey of this.blockProposalsForSlotAndIndex.keysAsync({ end: blockPositionEndKey })) {
        await this.blockProposalsForSlotAndIndex.delete(positionKey);
        numberOfBlockPositions++;
      }
    });

    this.log.verbose(`Deleted old pool data`, {
      oldestSlot,
      numberOfAttestations,
      numberOfCheckpointProposals,
      numberOfBlockPositions,
    });
  }

  public async tryAddCheckpointAttestation(
    attestation: CheckpointAttestation,
    committeeSize: number,
  ): Promise<TryAddResult> {
    const slotNumber = attestation.payload.header.slotNumber;
    const proposalId = attestation.archive.toString();
    const sender = attestation.getSender();

    if (!sender) {
      return { added: false, alreadyExists: false, totalForPosition: 0 };
    }

    const key = this.getAttestationKey(slotNumber, proposalId, sender.toString());
    const alreadyExists = await this.checkpointAttestations.hasAsync(key);

    if (alreadyExists) {
      const total = await this.getAttestationCount(slotNumber, proposalId);
      return { added: false, alreadyExists: true, totalForPosition: total };
    }

    const limit = committeeSize + ATTESTATION_CAP_BUFFER;
    const currentCount = await this.getAttestationCount(slotNumber, proposalId);

    if (currentCount >= limit) {
      return { added: false, alreadyExists: false, totalForPosition: currentCount };
    }

    await this.checkpointAttestations.set(key, attestation.toBuffer());

    this.log.verbose(`Added checkpoint attestation for slot ${slotNumber} from ${sender.toString()}`, {
      signature: attestation.signature.toString(),
      slotNumber,
      address: sender.toString(),
      proposalId,
    });

    return { added: true, alreadyExists: false, totalForPosition: currentCount + 1 };
  }

  /** Gets the count of attestations for a given (slot, proposalId). */
  private async getAttestationCount(slot: SlotNumber, proposalId: string): Promise<number> {
    const range = this.getAttestationKeyRangeForProposal(slot, proposalId);
    let count = 0;
    for await (const _ of this.checkpointAttestations.keysAsync(range)) {
      count++;
    }
    return count;
  }
}

/** Creates a KvAttestationPool backed by a temporary store for testing. */
export async function createTestAttestationPool(telemetry?: TelemetryClient): Promise<KvAttestationPool> {
  const { openTmpStore } = await import('@aztec/kv-store/lmdb-v2');
  const store = await openTmpStore('test-attestation-pool');
  return new KvAttestationPool(store, telemetry);
}
