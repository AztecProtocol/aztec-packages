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

/** Result of trying to add an item (proposal or attestation) to the pool */
export type TryAddResult = {
  /** Whether the item was added */
  added: boolean;
  /** Whether the exact item already existed */
  alreadyExists: boolean;
  /** Count of items for the position. Meaning varies by method:
   *  - tryAddBlockProposal: proposals at (slot, indexWithinCheckpoint)
   *  - tryAddCheckpointProposal: proposals at slot
   *  - tryAddCheckpointAttestation: attestations by this signer for this slot */
  count: number;
};

export const MAX_CHECKPOINT_PROPOSALS_PER_SLOT = 5;
export const MAX_BLOCK_PROPOSALS_PER_POSITION = 3;
/** Maximum attestations a single signer can make per slot before being rejected. */
export const MAX_ATTESTATIONS_PER_SLOT_AND_SIGNER = 3;

/** Public API interface for attestation pools. Used for typing mocks and test implementations. */
export type AttestationPoolApi = Pick<
  AttestationPool,
  | 'tryAddBlockProposal'
  | 'getBlockProposal'
  | 'tryAddCheckpointProposal'
  | 'getCheckpointProposal'
  | 'addOwnCheckpointAttestations'
  | 'tryAddCheckpointAttestation'
  | 'deleteOlderThan'
  | 'getCheckpointAttestationsForSlot'
  | 'getCheckpointAttestationsForSlotAndProposal'
  | 'hasBlockProposalsForSlot'
  | 'isEmpty'
>;

/**
 * Pool for storing attestations and proposals collected by a validator.
 *
 * Attestations and proposals observed via the p2p network are stored for requests
 * from the validator to produce a block, or to serve to other peers.
 */
export class AttestationPool {
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

  // Checkpoint attestations indexed by (slot, signer) for tracking attestations per (slot, signer) for duplicate detection
  // Key: `${Fr(slot).toString()}-${signerAddress}` string (padded for lexicographic ordering), Value: `proposalId` strings
  private checkpointAttestationsPerSlotAndSigner: AztecAsyncMultiMap<string, string>;

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
    this.checkpointAttestationsPerSlotAndSigner = store.openMultiMap('checkpoint_attestations_per_slot_and_signer');

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

  /** Returns whether the pool is empty. */
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

  /** Creates a key for the per-signer-per-slot attestation index. Uses padded slot for lexicographic ordering. */
  private getSlotSignerKey(slot: SlotNumber, signerAddress: string): string {
    const slotStr = new Fr(slot).toString();
    return `${slotStr}-${signerAddress}`;
  }

  /** Number of bits reserved for indexWithinCheckpoint in position keys. */
  private static readonly INDEX_BITS = 10;
  /** Maximum indexWithinCheckpoint value (2^10 - 1 = 1023). */
  private static readonly MAX_INDEX = (1 << AttestationPool.INDEX_BITS) - 1;

  /** Creates a position key for block proposals: (slot << 10) | indexWithinCheckpoint. */
  private getBlockPositionKey(slot: number, indexWithinCheckpoint: number): number {
    if (indexWithinCheckpoint > AttestationPool.MAX_INDEX) {
      throw new Error(
        `Value for indexWithinCheckpoint ${indexWithinCheckpoint} exceeds maximum ${AttestationPool.MAX_INDEX}`,
      );
    }
    return (slot << AttestationPool.INDEX_BITS) | indexWithinCheckpoint;
  }

  /**
   * Attempts to add a block proposal to the pool.
   *
   * This method performs validation and addition in a single call:
   * - Checks if the proposal already exists (returns alreadyExists: true if so)
   * - Checks if the position has reached the proposal cap (returns added: false if so)
   * - Adds the proposal if validation passes
   *
   * @param blockProposal - The block proposal to add
   * @returns Result indicating whether the proposal was added and duplicate detection info
   */
  public async tryAddBlockProposal(blockProposal: BlockProposal): Promise<TryAddResult> {
    return await this.store.transactionAsync(async () => {
      const proposalId = blockProposal.archive.toString();

      // Check if already exists
      const alreadyExists = await this.blockProposals.hasAsync(proposalId);
      if (alreadyExists) {
        const count = await this.getBlockProposalCountForPosition(
          blockProposal.slotNumber,
          blockProposal.indexWithinCheckpoint,
        );
        return { added: false, alreadyExists: true, count };
      }

      // Get current count for position and check cap, do not add if exceeded
      const count = await this.getBlockProposalCountForPosition(
        blockProposal.slotNumber,
        blockProposal.indexWithinCheckpoint,
      );

      if (count >= MAX_BLOCK_PROPOSALS_PER_POSITION) {
        return { added: false, alreadyExists: false, count };
      }

      // Add the proposal
      await this.addBlockProposal(blockProposal);

      this.log.debug(
        `Added block proposal for slot ${blockProposal.slotNumber} and index ${blockProposal.indexWithinCheckpoint}`,
        {
          proposalId,
          slotNumber: blockProposal.slotNumber,
          indexWithinCheckpoint: blockProposal.indexWithinCheckpoint,
        },
      );

      return { added: true, alreadyExists: false, count: count + 1 };
    });
  }

  /** Gets the count of block proposals for a given position (slot, indexWithinCheckpoint). */
  private getBlockProposalCountForPosition(
    slot: SlotNumber,
    indexWithinCheckpoint: IndexWithinCheckpoint,
  ): Promise<number> {
    const positionKey = this.getBlockPositionKey(slot, indexWithinCheckpoint);
    return this.blockProposalsForSlotAndIndex.getValueCountAsync(positionKey);
  }

  /** Internal method - must be called within a transaction. */
  private async addBlockProposal(blockProposal: BlockProposal): Promise<void> {
    const proposalId = blockProposal.archive.toString();
    // Strip signedTxs before storing to avoid persisting full tx data
    await this.blockProposals.set(proposalId, blockProposal.withoutSignedTxs().toBuffer());

    // Index by slot and position for duplicate detection
    const positionKey = this.getBlockPositionKey(blockProposal.slotNumber, blockProposal.indexWithinCheckpoint);
    await this.blockProposalsForSlotAndIndex.set(positionKey, proposalId);
  }

  /**
   * Get block proposal by its ID.
   *
   * @param id - The ID of the block proposal to retrieve. The ID is proposal.payload.archive
   *
   * @return The block proposal if it exists, otherwise undefined.
   */
  public async getBlockProposal(id: string): Promise<BlockProposal | undefined> {
    const buffer = await this.blockProposals.getAsync(id);
    try {
      if (buffer && buffer.length > 0) {
        return BlockProposal.fromBuffer(buffer);
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  /** Checks if any block proposals exist for a given slot (at index 0). */
  public async hasBlockProposalsForSlot(slot: SlotNumber): Promise<boolean> {
    const positionKey = this.getBlockPositionKey(slot, 0);
    const count = await this.blockProposalsForSlotAndIndex.getValueCountAsync(positionKey);
    return count > 0;
  }

  /**
   * Attempts to add a checkpoint proposal to the pool.
   *
   * This method performs validation and addition in a single call:
   * - Checks if the proposal already exists (returns alreadyExists: true if so)
   * - Checks if the slot has reached the proposal cap (returns added: false if so)
   * - Adds the proposal if validation passes
   *
   * Note: This method only handles the CheckpointProposalCore. If the original
   * CheckpointProposal contains a lastBlock, the caller should extract it via
   * getBlockProposal() and add it separately via tryAddBlockProposal().
   *
   * @param proposal - The checkpoint proposal core to add
   * @returns Result indicating whether the proposal was added and duplicate detection info
   */
  public async tryAddCheckpointProposal(proposal: CheckpointProposalCore): Promise<TryAddResult> {
    return await this.store.transactionAsync(async () => {
      const proposalId = proposal.archive.toString();

      // Check if already exists
      const alreadyExists = await this.checkpointProposals.hasAsync(proposalId);
      if (alreadyExists) {
        const count = await this.checkpointProposalsForSlot.getValueCountAsync(proposal.slotNumber);
        return { added: false, alreadyExists: true, count };
      }

      // Get current count for slot and check cap
      const count = await this.checkpointProposalsForSlot.getValueCountAsync(proposal.slotNumber);
      if (count >= MAX_CHECKPOINT_PROPOSALS_PER_SLOT) {
        return { added: false, alreadyExists: false, count };
      }

      // Add the proposal if cap not exceeded
      await this.addCheckpointProposal(proposal);

      this.log.debug(`Added checkpoint proposal for slot ${proposal.slotNumber}`, {
        proposalId,
        slotNumber: proposal.slotNumber,
      });

      return { added: true, alreadyExists: false, count: count + 1 };
    });
  }

  /** Internal method - must be called within a transaction. */
  private async addCheckpointProposal(proposal: CheckpointProposalCore): Promise<void> {
    const slotKey = proposal.slotNumber;
    const proposalId = proposal.archive.toString();

    await this.checkpointProposalsForSlot.set(slotKey, proposalId);
    await this.checkpointProposals.set(proposalId, proposal.toBuffer());
  }

  /**
   * Get checkpoint proposal by its ID.
   *
   * Returns a CheckpointProposalCore (without lastBlock info) since the lastBlock
   * is extracted and stored separately as a BlockProposal when added.
   *
   * @param id - The ID of the checkpoint proposal to retrieve (proposal.archive)
   * @return The checkpoint proposal core if it exists, otherwise undefined.
   */
  public async getCheckpointProposal(id: string): Promise<CheckpointProposalCore | undefined> {
    const buffer = await this.checkpointProposals.getAsync(id);
    try {
      if (buffer && buffer.length > 0) {
        return CheckpointProposal.fromBuffer(buffer);
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  /**
   * Adds own checkpoint attestations to the pool.
   * Skips validations on number of checkpoint attestations stored for the given slot.
   */
  public async addOwnCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    await this.store.transactionAsync(async () => {
      for (const attestation of attestations) {
        const slotNumber = attestation.payload.header.slotNumber;
        const proposalId = attestation.archive;
        const sender = attestation.getSender();

        // Skip attestations with invalid signatures
        if (!sender) {
          this.log.warn(`Skipping own checkpoint attestation with invalid signature for slot ${slotNumber}`, {
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

        this.log.debug(`Added own checkpoint attestation for slot ${slotNumber} from ${address}`, {
          signature: attestation.signature.toString(),
          slotNumber,
          address,
          proposalId,
        });
      }
    });
  }

  /**
   * Get all checkpoint attestations for a given slot.
   *
   * @param slot - The slot to query
   * @return CheckpointAttestations
   */
  public async getCheckpointAttestationsForSlot(slot: SlotNumber): Promise<CheckpointAttestation[]> {
    const range = this.getAttestationKeyRangeForSlot(slot);
    const attestations: CheckpointAttestation[] = [];

    for await (const [_, buf] of this.checkpointAttestations.entriesAsync(range)) {
      attestations.push(CheckpointAttestation.fromBuffer(buf));
    }

    return attestations;
  }

  /**
   * Get checkpoint attestations for slot and given proposal.
   *
   * @param slot - The slot to query
   * @param proposalId - The proposal to query
   * @return CheckpointAttestations
   */
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

  /**
   * Delete all pool data (attestations, proposals) older than the given slot.
   *
   * @param oldestSlot - The oldest slot to keep.
   */
  public async deleteOlderThan(oldestSlot: SlotNumber): Promise<void> {
    let numberOfAttestations = 0;
    let numberOfCheckpointProposals = 0;
    let numberOfBlockProposals = 0;

    await this.store.transactionAsync(async () => {
      // Delete checkpoint attestations with slot < oldestSlot
      // Attestation keys start with Fr(slot).toString(), so we use end bound of Fr(oldestSlot).toString()
      const attestationEndKey = new Fr(oldestSlot).toString();
      for await (const key of this.checkpointAttestations.keysAsync({ end: attestationEndKey })) {
        await this.checkpointAttestations.delete(key);
        numberOfAttestations++;
      }

      // Clean up per-signer-per-slot index. Keys are formatted as `${Fr(slot).toString()}-${signerAddress}`.
      // Since Fr pads to fixed-width hex, Fr(oldestSlot) is lexicographically greater than any key with
      // a smaller slot (even with the signer suffix), so using it as the exclusive end bound is correct.
      const slotSignerEndKey = new Fr(oldestSlot).toString();
      for await (const key of this.checkpointAttestationsPerSlotAndSigner.keysAsync({ end: slotSignerEndKey })) {
        await this.checkpointAttestationsPerSlotAndSigner.delete(key);
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

      // Delete block proposals for slots < oldestSlot, using blockProposalsForSlotAndIndex as index
      // Key format: (slot << INDEX_BITS) | indexWithinCheckpoint
      const blockPositionEndKey = oldestSlot << AttestationPool.INDEX_BITS;
      for await (const positionKey of this.blockProposalsForSlotAndIndex.keysAsync({ end: blockPositionEndKey })) {
        const proposalIds = await toArray(this.blockProposalsForSlotAndIndex.getValuesAsync(positionKey));
        for (const proposalId of proposalIds) {
          await this.blockProposals.delete(proposalId);
          numberOfBlockProposals++;
        }
        await this.blockProposalsForSlotAndIndex.delete(positionKey);
      }
    });

    this.log.verbose(`Deleted old pool data`, {
      oldestSlot,
      numberOfAttestations,
      numberOfCheckpointProposals,
      numberOfBlockProposals,
    });
  }

  /**
   * Attempts to add a checkpoint attestation to the pool.
   *
   * This method performs validation and addition in a single call:
   * - Checks if the attestation already exists (returns alreadyExists: true if so)
   * - Checks if this signer has reached the per-signer attestation cap for this slot
   * - Adds the attestation if validation passes
   *
   * @param attestation - The checkpoint attestation to add
   * @returns Result indicating whether the attestation was added, existence info, and count of
   *          attestations by this signer for this slot (for equivocation detection)
   */
  public async tryAddCheckpointAttestation(attestation: CheckpointAttestation): Promise<TryAddResult> {
    const slotNumber = attestation.payload.header.slotNumber;
    const proposalId = attestation.archive.toString();
    const sender = attestation.getSender();

    if (!sender) {
      return { added: false, alreadyExists: false, count: 0 };
    }

    const signerAddress = sender.toString();

    return await this.store.transactionAsync(async () => {
      const key = this.getAttestationKey(slotNumber, proposalId, signerAddress);
      const alreadyExists = await this.checkpointAttestations.hasAsync(key);

      // Get count of attestations by this signer for this slot (for duplicate detection)
      const signerAttestationCount = await this.getSignerAttestationCountForSlot(slotNumber, signerAddress);

      if (alreadyExists) {
        return {
          added: false,
          alreadyExists: true,
          count: signerAttestationCount,
        };
      }

      // Check if this signer has exceeded the per-signer cap for this slot
      if (signerAttestationCount >= MAX_ATTESTATIONS_PER_SLOT_AND_SIGNER) {
        this.log.debug(`Rejecting attestation: signer ${signerAddress} exceeded per-slot cap for slot ${slotNumber}`, {
          slotNumber,
          signerAddress,
          proposalId,
          signerAttestationCount,
        });
        return {
          added: false,
          alreadyExists: false,
          count: signerAttestationCount,
        };
      }

      // Add the attestation
      await this.checkpointAttestations.set(key, attestation.toBuffer());

      // Track this attestation in the per-signer-per-slot index for duplicate detection
      const slotSignerKey = this.getSlotSignerKey(slotNumber, signerAddress);
      await this.checkpointAttestationsPerSlotAndSigner.set(slotSignerKey, proposalId);

      this.log.debug(`Added checkpoint attestation for slot ${slotNumber} from ${signerAddress}`, {
        signature: attestation.signature.toString(),
        slotNumber,
        address: signerAddress,
        proposalId,
      });

      // Return the new count
      return {
        added: true,
        alreadyExists: false,
        count: signerAttestationCount + 1,
      };
    });
  }

  /** Gets the count of attestations by a specific signer for a given slot. */
  private async getSignerAttestationCountForSlot(slot: SlotNumber, signerAddress: string): Promise<number> {
    const slotSignerKey = this.getSlotSignerKey(slot, signerAddress);
    return await this.checkpointAttestationsPerSlotAndSigner.getValueCountAsync(slotSignerKey);
  }
}

/** Creates an AttestationPool backed by a temporary store for testing. */
export async function createTestAttestationPool(telemetry?: TelemetryClient): Promise<AttestationPool> {
  const { openTmpStore } = await import('@aztec/kv-store/lmdb-v2');
  const store = await openTmpStore('test-attestation-pool');
  return new AttestationPool(store, telemetry);
}
