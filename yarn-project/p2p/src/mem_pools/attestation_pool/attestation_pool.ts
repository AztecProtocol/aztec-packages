import type { BlockProposalHash, CheckpointProposalHash, SlotNumber } from '@aztec/foundation/branded-types';
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
  /** Whether the item was accepted into pool state. False when it already existed, was invalid, or hit a cap. */
  added: boolean;
  /** Whether the exact signed payload (matched by payload hash) already existed in the pool. */
  alreadyExists: boolean;
  /** Number of distinct signed-payload hashes seen for the position. Meaning varies by method:
   *  - tryAddBlockProposal: distinct payload hashes at (slot, indexWithinCheckpoint)
   *  - tryAddCheckpointProposal: distinct payload hashes at slot
   *  - tryAddCheckpointAttestation: distinct payload hashes by this signer for this slot */
  count: number;
};

export type ProposalsForSlot = {
  blockProposals: BlockProposal[];
  checkpointProposals: CheckpointProposalCore[];
};

export const MAX_CHECKPOINT_PROPOSALS_PER_SLOT = 2;
export const MAX_BLOCK_PROPOSALS_PER_POSITION = 2;
/** Maximum attestations a single signer can make per slot before being rejected. */
export const MAX_ATTESTATIONS_PER_SLOT_AND_SIGNER = 2;

/** Public API interface for attestation pools. Used for typing mocks and test implementations. */
export type AttestationPoolApi = Pick<
  AttestationPool,
  | 'tryAddBlockProposal'
  | 'getBlockProposalByArchive'
  | 'getProposalsForSlot'
  | 'tryAddCheckpointProposal'
  | 'getCheckpointProposal'
  | 'hasCheckpointProposalForSlot'
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
 *
 * Equivocation detection: distinct *signed payload hashes* arriving at the same
 * position are tracked in the matching index multimap so the equivocation count
 * reaches 2 even when archive collides on `feeAssetPriceModifier` variants.
 * Proposal bytes are retained per accepted payload hash, up to the same equivocation
 * caps, for slashing watchers that need signed P2P proposals.
 */
export class AttestationPool {
  private metrics: PoolInstrumentation<CheckpointAttestation>;

  // Checkpoint attestations from `${paddedSlot}-${signer}` to serialized CheckpointAttestation.
  // Stores the first attestation seen per (slot, signer); subsequent distinct payload
  // hashes from the same signer are tracked only in `attestationHashesPerSlotAndSigner`
  // for equivocation detection.
  private attestationPerSlotAndSigner: AztecAsyncMap<string, Buffer>;

  // Distinct payload hashes seen per (slot, signer) for tracking attestation equivocations.
  // Key: `${paddedSlot}-${signerAddress}`, Value: CheckpointProposalHash (`0x`-prefixed hex)
  private attestationHashesPerSlotAndSigner: AztecAsyncMultiMap<string, CheckpointProposalHash>;

  // Checkpoint proposals from `${paddedSlot}-${payloadHash}` to serialized CheckpointProposalCore.
  // Stores every accepted distinct payload up to MAX_CHECKPOINT_PROPOSALS_PER_SLOT.
  private checkpointProposalsPerSlotAndHash: AztecAsyncMap<string, Buffer>;

  // Distinct payload hashes seen per slot. Hash collision = duplicate.
  // Hash count reaching 2 = equivocation.
  // Key: slot number, Value: CheckpointProposalHash (`0x`-prefixed hex)
  private checkpointProposalHashesPerSlot: AztecAsyncMultiMap<number, CheckpointProposalHash>;

  // Block proposals from `${paddedSlot}-${paddedIndex}-${payloadHash}` to serialized BlockProposal.
  // Stores every accepted distinct payload up to MAX_BLOCK_PROPOSALS_PER_POSITION.
  private blockProposalsPerSlotIndexAndHash: AztecAsyncMap<string, Buffer>;

  // Distinct payload hashes seen per (slot, indexWithinCheckpoint).
  // Key: slot * (1 << INDEX_BITS) + indexWithinCheckpoint, Value: BlockProposalHash (`0x`-prefixed hex)
  private blockProposalHashesPerSlotAndIndex: AztecAsyncMultiMap<number, BlockProposalHash>;

  // Secondary index from archive root to all retained block proposal keys.
  private blockProposalKeysPerArchive: AztecAsyncMultiMap<string, string>;

  constructor(
    private store: AztecAsyncKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('aztec:attestation_pool'),
  ) {
    // Initialize block proposal storage
    this.blockProposalsPerSlotIndexAndHash = store.openMap('block_proposals_by_slot_index_and_hash');
    this.blockProposalHashesPerSlotAndIndex = store.openMultiMap('block_proposals_for_slot_and_index');
    this.blockProposalKeysPerArchive = store.openMultiMap('block_proposals_by_archive');

    // Initialize checkpoint attestations storage
    this.attestationPerSlotAndSigner = store.openMap('checkpoint_attestations');
    this.attestationHashesPerSlotAndSigner = store.openMultiMap('checkpoint_attestations_per_slot_and_signer');

    // Initialize checkpoint proposal storage
    this.checkpointProposalsPerSlotAndHash = store.openMap('checkpoint_proposals_by_slot_and_hash');
    this.checkpointProposalHashesPerSlot = store.openMultiMap('checkpoint_proposals_for_slot');

    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL, this.poolStats);
  }

  private poolStats: PoolStatsCallback = async () => {
    return {
      itemCount: await this.attestationPerSlotAndSigner.sizeAsync(),
    };
  };

  /** Returns whether the pool is empty. */
  public async isEmpty(): Promise<boolean> {
    const [attestationCount, blockProposalCount, checkpointProposalCount] = await Promise.all([
      this.attestationPerSlotAndSigner.sizeAsync(),
      this.blockProposalsPerSlotIndexAndHash.sizeAsync(),
      this.checkpointProposalsPerSlotAndHash.sizeAsync(),
    ]);

    return attestationCount === 0 && blockProposalCount === 0 && checkpointProposalCount === 0;
  }

  /** Number of bits reserved for indexWithinCheckpoint in position keys. */
  private static readonly INDEX_BITS = 10;
  /** Maximum indexWithinCheckpoint value (2^10 - 1 = 1023). */
  private static readonly MAX_INDEX = (1 << AttestationPool.INDEX_BITS) - 1;
  /** Decimal digits used to left-pad slot numbers in string keys.
   * 10 digits ≈ 3500 years at 36 s/slot, leaving ample headroom. */
  private static readonly SLOT_PAD_DIGITS = 10;

  /** Fixed-width decimal slot string for use in composite string keys. */
  private slotPaddedKey(slot: SlotNumber | number): string {
    return slot.toString().padStart(AttestationPool.SLOT_PAD_DIGITS, '0');
  }

  /** Fixed-width decimal index string for use in composite string keys. */
  private indexPaddedKey(indexWithinCheckpoint: number): string {
    return indexWithinCheckpoint.toString().padStart(4, '0');
  }

  /** Key for retained block proposals. */
  private getBlockProposalKey(
    slot: SlotNumber | number,
    indexWithinCheckpoint: number,
    payloadHash: BlockProposalHash,
  ): string {
    return `${this.slotPaddedKey(slot)}-${this.indexPaddedKey(indexWithinCheckpoint)}-${payloadHash}`;
  }

  /** Range bounds for all retained block proposals in a slot. */
  private getBlockProposalKeyRangeForSlot(slot: SlotNumber): { start: string; end: string } {
    return { start: `${this.slotPaddedKey(slot)}-`, end: `${this.slotPaddedKey(slot + 1)}-` };
  }

  /** Key for retained checkpoint proposals. */
  private getCheckpointProposalKey(slot: SlotNumber | number, payloadHash: CheckpointProposalHash): string {
    return `${this.slotPaddedKey(slot)}-${payloadHash}`;
  }

  /** Range bounds for all retained checkpoint proposals in a slot. */
  private getCheckpointProposalKeyRangeForSlot(slot: SlotNumber): { start: string; end: string } {
    return { start: `${this.slotPaddedKey(slot)}-`, end: `${this.slotPaddedKey(slot + 1)}-` };
  }

  /** Key for the per-(slot, signer) attestation main store and equivocation index. */
  private getSlotSignerKey(slot: SlotNumber, signerAddress: string): string {
    return `${this.slotPaddedKey(slot)}-${signerAddress}`;
  }

  /**
   * Returns range bounds for querying all attestations for a given slot.
   * Fixed-width padding ensures the slot prefix sorts cleanly, so using the next
   * slot's prefix as the upper bound captures exactly the current slot's entries.
   */
  private getAttestationKeyRangeForSlot(slot: SlotNumber): { start: string; end: string } {
    return { start: `${this.slotPaddedKey(slot)}-`, end: `${this.slotPaddedKey(slot + 1)}-` };
  }

  /** Creates a position key for block proposals: slot * 1024 + indexWithinCheckpoint.
   * Uses multiplication instead of bit-shift to avoid 32-bit signed integer overflow
   * (bit-shift overflows after slot ~2^21, roughly 278 days of uptime). */
  private getBlockPositionKey(slot: number, indexWithinCheckpoint: number): number {
    if (indexWithinCheckpoint > AttestationPool.MAX_INDEX) {
      throw new Error(
        `Value for indexWithinCheckpoint ${indexWithinCheckpoint} exceeds maximum ${AttestationPool.MAX_INDEX}`,
      );
    }
    return slot * (1 << AttestationPool.INDEX_BITS) + indexWithinCheckpoint;
  }

  /** Returns true if the multimap already contains the given value for the given key. */
  private async multimapHasValue<TKey extends number | string, TValue extends string>(
    map: AztecAsyncMultiMap<TKey, TValue>,
    key: TKey,
    value: TValue,
  ): Promise<boolean> {
    const values = await toArray(map.getValuesAsync(key));
    return values.includes(value);
  }

  /**
   * Attempts to add a block proposal to the pool.
   *
   * - Detects duplicates by signed-payload hash (not archive); a re-broadcast of the
   *   exact same signed payload returns `alreadyExists: true`.
   * - Distinct payload hashes at the same `(slot, indexWithinCheckpoint)` are tracked
   *   in the equivocation index and retained up to the cap.
   *
   * @param blockProposal - The block proposal to add
   * @returns Result indicating whether the proposal was added and duplicate detection info
   */
  public async tryAddBlockProposal(blockProposal: BlockProposal): Promise<TryAddResult> {
    return await this.store.transactionAsync(async () => {
      const positionKey = this.getBlockPositionKey(blockProposal.slotNumber, blockProposal.indexWithinCheckpoint);
      const payloadHash = blockProposal.getPayloadHash();

      // Hash already tracked => exact same signed payload was already received.
      if (await this.multimapHasValue(this.blockProposalHashesPerSlotAndIndex, positionKey, payloadHash)) {
        const count = await this.blockProposalHashesPerSlotAndIndex.getValueCountAsync(positionKey);
        return { added: false, alreadyExists: true, count };
      }

      // Cap reached for this position (no more new payload hashes accepted).
      const count = await this.blockProposalHashesPerSlotAndIndex.getValueCountAsync(positionKey);
      if (count >= MAX_BLOCK_PROPOSALS_PER_POSITION) {
        return { added: false, alreadyExists: false, count };
      }

      // Track the new payload hash for equivocation detection.
      await this.blockProposalHashesPerSlotAndIndex.set(positionKey, payloadHash);
      const proposalKey = this.getBlockProposalKey(
        blockProposal.slotNumber,
        blockProposal.indexWithinCheckpoint,
        payloadHash,
      );
      await this.blockProposalsPerSlotIndexAndHash.set(proposalKey, blockProposal.withoutSignedTxs().toBuffer());
      await this.blockProposalKeysPerArchive.set(blockProposal.archive.toString(), proposalKey);

      this.log.debug(
        `Added block proposal for slot ${blockProposal.slotNumber} and index ${blockProposal.indexWithinCheckpoint}`,
        {
          archive: blockProposal.archive.toString(),
          payloadHash,
          slotNumber: blockProposal.slotNumber,
          indexWithinCheckpoint: blockProposal.indexWithinCheckpoint,
        },
      );

      return { added: true, alreadyExists: false, count: count + 1 };
    });
  }

  /**
   * Get block proposal by archive root.
   *
   * Resolves the archive root through the archive index and returns the first
   * retained proposal for that archive. This lookup is used by block-txs req/resp,
   * where any retained proposal for the requested archive gives the tx hash list.
   *
   * @param archiveRoot - The archive root to look up
   * @return The block proposal if it exists and its archive matches, otherwise undefined.
   */
  public async getBlockProposalByArchive(archiveRoot: string): Promise<BlockProposal | undefined> {
    for await (const proposalKey of this.blockProposalKeysPerArchive.getValuesAsync(archiveRoot)) {
      const buffer = await this.blockProposalsPerSlotIndexAndHash.getAsync(proposalKey);
      if (!buffer || buffer.length === 0) {
        continue;
      }
      try {
        const proposal = BlockProposal.fromBuffer(buffer);
        if (proposal.archive.toString() === archiveRoot) {
          return proposal;
        }
      } catch {
        continue;
      }
    }
    return undefined;
  }

  /** Returns retained signed proposals for a slot. */
  public async getProposalsForSlot(slot: SlotNumber): Promise<ProposalsForSlot> {
    const blockProposals: BlockProposal[] = [];
    const checkpointProposals: CheckpointProposalCore[] = [];

    for await (const [_, buffer] of this.blockProposalsPerSlotIndexAndHash.entriesAsync(
      this.getBlockProposalKeyRangeForSlot(slot),
    )) {
      try {
        blockProposals.push(BlockProposal.fromBuffer(buffer));
      } catch {
        continue;
      }
    }

    for await (const [_, buffer] of this.checkpointProposalsPerSlotAndHash.entriesAsync(
      this.getCheckpointProposalKeyRangeForSlot(slot),
    )) {
      try {
        checkpointProposals.push(CheckpointProposal.fromBuffer(buffer));
      } catch {
        continue;
      }
    }

    return { blockProposals, checkpointProposals };
  }

  /** Checks if any block proposals exist for a given slot (at index 0). */
  public async hasBlockProposalsForSlot(slot: SlotNumber): Promise<boolean> {
    const positionKey = this.getBlockPositionKey(slot, 0);
    const count = await this.blockProposalHashesPerSlotAndIndex.getValueCountAsync(positionKey);
    return count > 0;
  }

  /**
   * Attempts to add a checkpoint proposal to the pool.
   *
   * - Detects duplicates by signed-payload hash (not archive); a re-broadcast of the
   *   exact same signed payload returns `alreadyExists: true`.
   * - Distinct payload hashes at the same slot are tracked in the equivocation index.
   *   Distinct payload bytes are retained up to the same cap so slashing watchers
   *   can recover signed proposals.
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
      const slot = proposal.slotNumber;
      const payloadHash = proposal.getPayloadHash();

      if (await this.multimapHasValue(this.checkpointProposalHashesPerSlot, slot, payloadHash)) {
        const count = await this.checkpointProposalHashesPerSlot.getValueCountAsync(slot);
        return { added: false, alreadyExists: true, count };
      }

      const count = await this.checkpointProposalHashesPerSlot.getValueCountAsync(slot);
      if (count >= MAX_CHECKPOINT_PROPOSALS_PER_SLOT) {
        return { added: false, alreadyExists: false, count };
      }

      // Track the new payload hash for equivocation detection.
      await this.checkpointProposalHashesPerSlot.set(slot, payloadHash);
      await this.checkpointProposalsPerSlotAndHash.set(
        this.getCheckpointProposalKey(slot, payloadHash),
        proposal.toBuffer(),
      );

      this.log.debug(`Added checkpoint proposal for slot ${slot}`, {
        archive: proposal.archive.toString(),
        payloadHash,
        slotNumber: slot,
      });

      return { added: true, alreadyExists: false, count: count + 1 };
    });
  }

  /**
   * Get a retained checkpoint proposal stored for the given slot.
   * If multiple proposals were retained for an equivocation, returns the lowest
   * payload hash deterministically.
   *
   * Returns a CheckpointProposalCore (without lastBlock info) since the lastBlock
   * is extracted and stored separately as a BlockProposal when added.
   *
   * @param slot - The slot to look up
   * @return The checkpoint proposal core if one is stored, otherwise undefined.
   */
  public async getCheckpointProposal(slot: SlotNumber): Promise<CheckpointProposalCore | undefined> {
    for await (const [_, buffer] of this.checkpointProposalsPerSlotAndHash.entriesAsync(
      this.getCheckpointProposalKeyRangeForSlot(slot),
    )) {
      try {
        if (buffer && buffer.length > 0) {
          return CheckpointProposal.fromBuffer(buffer);
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  /** Returns whether any checkpoint proposal is retained for the given slot. */
  public async hasCheckpointProposalForSlot(slot: SlotNumber): Promise<boolean> {
    return (await this.getCheckpointProposal(slot)) !== undefined;
  }

  /**
   * Adds own checkpoint attestations to the pool.
   * Skips per-signer cap and equivocation tracking; the caller is trusted.
   * Each (slot, signer) gets a single stored attestation; later additions overwrite.
   */
  public async addOwnCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    await this.store.transactionAsync(async () => {
      for (const attestation of attestations) {
        const slotNumber = attestation.payload.header.slotNumber;
        const sender = attestation.getSender();

        // Skip attestations with invalid signatures
        if (!sender) {
          this.log.warn(`Skipping own checkpoint attestation with invalid signature for slot ${slotNumber}`, {
            signature: attestation.signature.toString(),
            slotNumber,
            archive: attestation.archive.toString(),
          });
          continue;
        }

        const address = sender.toString();
        const ownKey = this.getSlotSignerKey(slotNumber, address);
        const payloadHash = attestation.getPayloadHash();

        // Store the signature in canonical (v ∈ {27, 28}) form; see tryAddCheckpointAttestation.
        await this.attestationPerSlotAndSigner.set(ownKey, attestation.withNormalizedSignature().toBuffer());
        this.metrics.trackMempoolItemAdded(ownKey);

        // Track our own payload hash so that an equivocating attestation from another
        // peer at the same (slot, signer) is detected as a duplicate.
        if (!(await this.multimapHasValue(this.attestationHashesPerSlotAndSigner, ownKey, payloadHash))) {
          await this.attestationHashesPerSlotAndSigner.set(ownKey, payloadHash);
        }

        this.log.debug(`Added own checkpoint attestation for slot ${slotNumber} from ${address}`, {
          signature: attestation.signature.toString(),
          slotNumber,
          address,
          archive: attestation.archive.toString(),
          payloadHash,
        });
      }
    });
  }

  /**
   * Get all checkpoint attestations for a given slot.
   *
   * Returns one attestation per (slot, signer) — the first seen for each signer.
   * Later equivocating attestations from the same signer are tracked in the index
   * but their bytes are not retained.
   *
   * @param slot - The slot to query
   * @return CheckpointAttestations
   */
  public async getCheckpointAttestationsForSlot(slot: SlotNumber): Promise<CheckpointAttestation[]> {
    const range = this.getAttestationKeyRangeForSlot(slot);
    const attestations: CheckpointAttestation[] = [];

    for await (const [_, buf] of this.attestationPerSlotAndSigner.entriesAsync(range)) {
      attestations.push(CheckpointAttestation.fromBuffer(buf));
    }

    return attestations;
  }

  /**
   * Get checkpoint attestations for a slot whose signed payload matches the given
   * proposal payload hash.
   *
   * @param slot - The slot to query
   * @param proposalPayloadHash - Hex-encoded keccak256 of the target proposal's signed payload
   * @return CheckpointAttestations whose `getPayloadHash()` matches `proposalPayloadHash`
   */
  public async getCheckpointAttestationsForSlotAndProposal(
    slot: SlotNumber,
    proposalPayloadHash: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]> {
    const all = await this.getCheckpointAttestationsForSlot(slot);
    return all.filter(att => att.getPayloadHash() === proposalPayloadHash);
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
      const oldestSlotPadded = this.slotPaddedKey(oldestSlot);

      // Delete checkpoint attestations whose key < `${oldestSlotPadded}-`. Fixed-width
      // decimal padding means the slot prefix sorts strictly before any key at that slot.
      for await (const key of this.attestationPerSlotAndSigner.keysAsync({ end: `${oldestSlotPadded}-` })) {
        await this.attestationPerSlotAndSigner.delete(key);
        this.metrics.trackMempoolItemRemoved(key);
        numberOfAttestations++;
      }

      // Clean up per-signer-per-slot index using the same end bound.
      for await (const key of this.attestationHashesPerSlotAndSigner.keysAsync({ end: `${oldestSlotPadded}-` })) {
        await this.attestationHashesPerSlotAndSigner.delete(key);
      }

      // Delete checkpoint proposals for slots < oldestSlot.
      for await (const slot of this.checkpointProposalHashesPerSlot.keysAsync({ end: oldestSlot })) {
        await this.checkpointProposalHashesPerSlot.delete(slot);
      }

      for await (const key of this.checkpointProposalsPerSlotAndHash.keysAsync({
        end: `${oldestSlotPadded}-`,
      })) {
        await this.checkpointProposalsPerSlotAndHash.delete(key);
        numberOfCheckpointProposals++;
      }

      // Delete block proposals for slots < oldestSlot, using blockProposalHashesPerSlotAndIndex as index.
      // Key format: slot * (1 << INDEX_BITS) + indexWithinCheckpoint
      const blockPositionEndKey = oldestSlot * (1 << AttestationPool.INDEX_BITS);
      for await (const positionKey of this.blockProposalHashesPerSlotAndIndex.keysAsync({ end: blockPositionEndKey })) {
        await this.blockProposalHashesPerSlotAndIndex.delete(positionKey);
      }

      for await (const [key, buffer] of this.blockProposalsPerSlotIndexAndHash.entriesAsync({
        end: `${oldestSlotPadded}-`,
      })) {
        try {
          const proposal = BlockProposal.fromBuffer(buffer);
          await this.blockProposalKeysPerArchive.deleteValue(proposal.archive.toString(), key);
        } catch {
          // ignore decode errors when cleaning up
        }
        await this.blockProposalsPerSlotIndexAndHash.delete(key);
        numberOfBlockProposals++;
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
   * - Detects duplicates by signed-payload hash (not archive); a re-broadcast of the
   *   exact same signed payload from the same signer returns `alreadyExists: true`.
   * - Distinct payload hashes from the same (slot, signer) are tracked in the
   *   equivocation index. The first one's bytes are stored; later distinct hashes
   *   bump `count` so libp2p can fire its duplicate callback.
   *
   * @param attestation - The checkpoint attestation to add
   * @returns Result indicating whether the attestation was added, existence info,
   *          and number of distinct payload hashes by this signer for this slot
   *          (for equivocation detection).
   */
  public async tryAddCheckpointAttestation(attestation: CheckpointAttestation): Promise<TryAddResult> {
    const slotNumber = attestation.payload.header.slotNumber;
    const sender = attestation.getSender();

    if (!sender) {
      return { added: false, alreadyExists: false, count: 0 };
    }

    const signerAddress = sender.toString();
    const slotSignerKey = this.getSlotSignerKey(slotNumber, signerAddress);
    const payloadHash = attestation.getPayloadHash();

    return await this.store.transactionAsync(async () => {
      if (await this.multimapHasValue(this.attestationHashesPerSlotAndSigner, slotSignerKey, payloadHash)) {
        const count = await this.attestationHashesPerSlotAndSigner.getValueCountAsync(slotSignerKey);
        return { added: false, alreadyExists: true, count };
      }

      const signerAttestationCount = await this.attestationHashesPerSlotAndSigner.getValueCountAsync(slotSignerKey);

      if (signerAttestationCount >= MAX_ATTESTATIONS_PER_SLOT_AND_SIGNER) {
        this.log.debug(`Rejecting attestation: signer ${signerAddress} exceeded per-slot cap for slot ${slotNumber}`, {
          slotNumber,
          signerAddress,
          archive: attestation.archive.toString(),
          payloadHash,
          signerAttestationCount,
        });
        return {
          added: false,
          alreadyExists: false,
          count: signerAttestationCount,
        };
      }

      // Track the new payload hash for equivocation detection.
      await this.attestationHashesPerSlotAndSigner.set(slotSignerKey, payloadHash);

      // Only the first distinct payload at (slot, signer) is stored; later
      // equivocations are detected via the multimap but their bytes are not retained.
      const alreadyHasStored = await this.attestationPerSlotAndSigner.hasAsync(slotSignerKey);
      if (!alreadyHasStored) {
        // Store the signature in canonical (v ∈ {27, 28}) form. `sender` recovered above, so the
        // signature is non-empty and safe to normalize; this keeps a yParity-encoded (v = 0/1) variant
        // from a malicious peer or an in-flight byte mutation out of the L1 bundle downstream.
        await this.attestationPerSlotAndSigner.set(slotSignerKey, attestation.withNormalizedSignature().toBuffer());
        this.metrics.trackMempoolItemAdded(slotSignerKey);
      }

      this.log.debug(`Added checkpoint attestation for slot ${slotNumber} from ${signerAddress}`, {
        signature: attestation.signature.toString(),
        slotNumber,
        address: signerAddress,
        archive: attestation.archive.toString(),
        payloadHash,
        stored: !alreadyHasStored,
      });

      return {
        added: true,
        alreadyExists: false,
        count: signerAttestationCount + 1,
      };
    });
  }
}

/** Creates an AttestationPool backed by a temporary store for testing. */
export async function createTestAttestationPool(telemetry?: TelemetryClient): Promise<AttestationPool> {
  const { openTmpStore } = await import('@aztec/kv-store/lmdb-v2');
  const store = await openTmpStore('test-attestation-pool');
  return new AttestationPool(store, telemetry);
}
