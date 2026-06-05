import type { OutboxContract } from '@aztec/ethereum/contracts';
import type { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { chunkBy } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { L2Block } from '@aztec/stdlib/block';
import type { CheckpointData } from '@aztec/stdlib/checkpoint';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import { type L2ToL1MembershipWitness, computeL2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import type { IndexedTxEffect, TxHash } from '@aztec/stdlib/tx';

/**
 * Archiver-side view of the data the resolver needs to assemble a witness. The archiver implements
 * each of these natively, so no L2 RPC plumbing is required.
 */
export interface OutboxTreesArchiverView {
  getBlocks(query: { epoch: EpochNumber; onlyCheckpointed: true }): Promise<L2Block[]>;
  getBlock(query: { number: BlockNumber }): Promise<L2Block | undefined>;
  getCheckpointsData(query: { epoch: EpochNumber }): Promise<CheckpointData[]>;
  getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined>;
}

/** A cached per-epoch set of Outbox roots, tagged with the synced L1 block they were read at. */
type CachedRoots = {
  /** The `MAX_CHECKPOINTS_PER_EPOCH`-length array of partial-proof roots the L1 Outbox holds for the epoch. */
  roots: Fr[];
  /** The node's synced L1 block number at the moment we fetched these roots. */
  fetchedAtL1Block: bigint;
};

/**
 * Holds an in-memory cache of per-epoch Outbox roots used to build L2-to-L1 message membership
 * witnesses, plus the single-flight registry that dedupes concurrent fetches.
 *
 * Roots are fetched lazily on request and cached against the node's synced L1 block: a cached entry
 * is reused only while the synced L1 block is unchanged, and re-fetched from L1 once the node
 * advances. The cache is intentionally not persisted — entries are valid for at most one L1 slot, so
 * there is nothing worth carrying across restarts. The four merkle-tree levels are rebuilt per
 * request from the archiver's raw L2 data via `computeL2ToL1MembershipWitness`; no trees or
 * intermediate out-hashes are cached.
 *
 * TODO: Re-add permanent caching for sealed-and-L1-finalized epochs so their roots can be frozen
 * and served without any L1 read once they can no longer change. That logic was dropped here to keep
 * the cache simple; it would likely want a persisted store again.
 */
export class OutboxTreesResolver {
  /** In-memory cache of per-epoch Outbox roots, keyed by epoch number. */
  #cache: Map<EpochNumber, CachedRoots> = new Map();

  /** Single-flight registry for in-flight roots fetches, keyed by epoch number. */
  #pending: Map<EpochNumber, Promise<Fr[] | undefined>> = new Map();

  /** Adapter exposing the slice of the node API that `computeL2ToL1MembershipWitness` requires. */
  #node: Parameters<typeof computeL2ToL1MembershipWitness>[0];

  constructor(
    private readonly outbox: OutboxContract,
    private readonly archiver: OutboxTreesArchiverView,
    private readonly getSyncedL1BlockNumber: () => Promise<bigint | undefined>,
    private readonly epochDuration: number,
    private readonly log: Logger = createLogger('archiver:outbox'),
  ) {
    this.#node = this.makeNodeView();
  }

  /**
   * Builds the L2-to-L1 membership witness for `message` in tx `txHash`. Returns `undefined` if the
   * tx isn't yet in a block/epoch, or if the Outbox holds no covering partial-proof root for the
   * tx's checkpoint as of the node's synced L1 block — callers should retry in that case.
   */
  public async getL2ToL1MembershipWitness(
    txHash: TxHash,
    message: Fr,
    messageIndexInTx?: number,
  ): Promise<L2ToL1MembershipWitness | undefined> {
    const indexed = await this.archiver.getTxEffect(txHash);
    if (!indexed) {
      this.log.trace(`No tx effect for tx, no witness available`, { txHash });
      return undefined;
    }

    // Derive the epoch from the tx's slot the same way the node assembles a mined receipt, so the
    // witness helper sees the same view a `getTxReceipt` caller would.
    const epochNumber = getEpochAtSlot(indexed.slotNumber, { epochDuration: this.epochDuration });
    const roots = await this.#getRoots(epochNumber);
    if (roots === undefined) {
      return undefined;
    }

    const receipt = {
      txHash,
      epochNumber,
      blockNumber: indexed.l2BlockNumber,
      txIndexInBlock: indexed.txIndexInBlock,
    };

    const syncedBefore = await this.getSyncedL1BlockNumber();
    try {
      return await computeL2ToL1MembershipWitness(this.#node, roots, message, receipt, messageIndexInTx);
    } catch (err) {
      // The helper throws if the locally-assembled epoch root disagrees with the cached Outbox root.
      // The cached roots are pinned to the node's synced L1 block, but the helper reads block /
      // checkpoint data live, so if the archiver advanced mid-assembly the two can momentarily reflect
      // different heights and produce a transient mismatch. When the synced block moved during
      // assembly we treat the mismatch as transient and return undefined so the caller can retry; a
      // mismatch at a stable synced block is a genuine node/L1 disagreement and must surface.
      const syncedAfter = await this.getSyncedL1BlockNumber();
      if (syncedBefore !== syncedAfter && err instanceof Error && err.message.includes('does not match Outbox')) {
        this.log.debug(`Transient outbox root mismatch during sync, returning no witness`, {
          txHash,
          epoch: epochNumber,
        });
        return undefined;
      }
      throw err;
    }
  }

  /**
   * Lazily returns the per-epoch Outbox roots, reusing the cached entry while the node's synced L1
   * block is unchanged and re-fetching from L1 once it advances. Returns `undefined` if the node has
   * not established a synced L1 block yet. Concurrent requests for the same epoch share a single
   * in-flight fetch via {@link #pending}.
   */
  #getRoots(epoch: EpochNumber): Promise<Fr[] | undefined> {
    const inFlight = this.#pending.get(epoch);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.#refreshRoots(epoch).finally(() => {
      this.#pending.delete(epoch);
    });
    this.#pending.set(epoch, promise);
    return promise;
  }

  /**
   * Single-flight body for {@link #getRoots}. Re-reads the cached entry and synced block here —
   * rather than capturing them before winning the {@link #pending} slot — so a late entrant that
   * missed the slot cannot overwrite a fresher entry the previous winner just wrote.
   */
  async #refreshRoots(epoch: EpochNumber): Promise<Fr[] | undefined> {
    const synced = await this.getSyncedL1BlockNumber();
    if (synced === undefined) {
      // The archiver has no synced L1 block yet, so there is no consistent height to read the Outbox
      // at. The caller retries once the node has synced.
      return undefined;
    }

    const cached = this.#cache.get(epoch);
    if (cached && cached.fetchedAtL1Block === synced) {
      return cached.roots;
    }

    // TODO: Re-add permanent caching for sealed-and-L1-finalized epochs so we can skip the L1 read
    // entirely once an epoch's roots can no longer change. For now the cache is valid only for the
    // current synced L1 block and we re-query the Outbox whenever the node advances.
    const roots = await this.outbox.getRoots(epoch, { blockNumber: synced });
    this.#cache.set(epoch, { roots, fetchedAtL1Block: synced });
    this.log.trace(`Fetched outbox roots for epoch ${epoch}`, {
      epoch,
      syncedL1Block: synced,
      nonZeroRoots: roots.filter(r => !r.isZero()).length,
    });
    return roots;
  }

  /**
   * Returns the L2-to-L1 messages in `epoch`, organized as `checkpoint[] → block[] → tx[] →
   * message[]`. Mirrors `AztecNodeService.getL2ToL1Messages` so the resolver can run off the
   * archiver directly without going through the node RPC surface.
   */
  async #getL2ToL1Messages(epoch: EpochNumber): Promise<Fr[][][][]> {
    const blocks = await this.archiver.getBlocks({ epoch, onlyCheckpointed: true });
    const blocksInCheckpoints = chunkBy(blocks, block => block.header.globalVariables.slotNumber);
    return blocksInCheckpoints.map(slotBlocks =>
      slotBlocks.map(block => block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs)),
    );
  }

  /**
   * Builds the node-shaped adapter handed to `computeL2ToL1MembershipWitness`. The helper invokes
   * `getL2ToL1Messages` / `getBlock` / `getCheckpointsData`; `getTxReceipt` is part of the helper's
   * node type but is never invoked because we always pass an already-resolved receipt.
   */
  private makeNodeView(): Parameters<typeof computeL2ToL1MembershipWitness>[0] {
    return {
      getL2ToL1Messages: (epoch: EpochNumber) => this.#getL2ToL1Messages(epoch),
      getBlock: ((param: BlockNumber) => this.archiver.getBlock({ number: param })) as Parameters<
        typeof computeL2ToL1MembershipWitness
      >[0]['getBlock'],
      getCheckpointsData: (query: { epoch: EpochNumber }) => this.archiver.getCheckpointsData(query),
      getTxReceipt: (() => {
        throw new Error('OutboxTreesResolver always passes a resolved receipt; getTxReceipt must not be called');
      }) as Parameters<typeof computeL2ToL1MembershipWitness>[0]['getTxReceipt'],
    };
  }
}
