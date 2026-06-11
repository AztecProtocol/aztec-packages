import { createEthereumChain } from '@aztec/ethereum/chain';
import { makeL1HttpTransport } from '@aztec/ethereum/client';
import { NoCommitteeError, RollupContract } from '@aztec/ethereum/contracts';
import { getFinalizedL1Block } from '@aztec/ethereum/queries';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import {
  type L1RollupConstants,
  getEpochAtSlot,
  getEpochNumberAtTimestamp,
  getNextL1SlotTimestamp,
  getSlotAtNextL1Block,
  getSlotAtTimestamp,
  getSlotRangeForEpoch,
  getStartTimestampForEpoch,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';

import { createPublicClient, encodeAbiParameters, keccak256 } from 'viem';

import { type EpochCacheConfig, getEpochCacheConfigEnvVars } from './config.js';

/** The proposer pipelines by building one slot ahead. */
export const PROPOSER_PIPELINING_SLOT_OFFSET = 1;

/** Flat return type for compound epoch/slot getters. */
export type EpochAndSlot = {
  slot: SlotNumber;
  epoch: EpochNumber;
  ts: bigint;
};

export type EpochCommitteeInfo = {
  committee: EthAddress[] | undefined;
  seed: bigint;
  epoch: EpochNumber;
  /** True if the epoch is within an open escape hatch window. */
  isEscapeHatchOpen: boolean;
};

export type SlotTag = 'now' | 'next' | SlotNumber;

/** Minimal L1 block info used for cache provenance. */
type L1BlockInfo = { number: bigint; hash: `0x${string}`; timestamp: bigint };

/** Resolved cache entry with L1 provenance metadata. */
type CachedEpochEntry = {
  data: EpochCommitteeInfo;
  /** L1 block number at which the committee data was originally queried. */
  lastQueryL1BlockNumber: bigint;
  /** L1 block hash at which the committee data was originally queried. Used to detect reorgs. */
  lastQueryL1BlockHash: `0x${string}`;
  /** Latest L1 block timestamp at the time of the most recent refresh (full fetch or lightweight check). */
  lastRefreshL1Timestamp: bigint;
  /** Whether the epoch's sampling data falls within finalized L1 history. */
  finalized: boolean;
};

export interface EpochCacheInterface {
  getCommittee(slot: SlotTag | undefined): Promise<EpochCommitteeInfo>;
  getSlotNow(): SlotNumber;
  getTargetSlot(): SlotNumber;
  getEpochNow(): EpochNumber;
  getTargetEpoch(): EpochNumber;
  getEpochAndSlotNow(): EpochAndSlot & { nowMs: bigint };
  getEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint };
  /** Returns epoch/slot info for the next L1 slot with pipeline offset applied. */
  getTargetEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint };
  isEscapeHatchOpen(epoch: EpochNumber): Promise<boolean>;
  isEscapeHatchOpenAtSlot(slot: SlotTag): Promise<boolean>;
  getProposerIndexEncoding(epoch: EpochNumber, slot: SlotNumber, seed: bigint): `0x${string}`;
  computeProposerIndex(slot: SlotNumber, epoch: EpochNumber, seed: bigint, size: bigint): bigint;
  getCurrentAndNextSlot(): { currentSlot: SlotNumber; nextSlot: SlotNumber };
  getTargetAndNextSlot(): { targetSlot: SlotNumber; nextSlot: SlotNumber };
  getProposerAttesterAddressInSlot(slot: SlotNumber): Promise<EthAddress | undefined>;
  getRegisteredValidators(): Promise<EthAddress[]>;
  isInCommittee(slot: SlotTag, validator: EthAddress): Promise<boolean>;
  filterInCommittee(slot: SlotTag, validators: EthAddress[]): Promise<EthAddress[]>;
  getL1Constants(): L1RollupConstants;
}

/**
 * Epoch cache
 *
 * This class is responsible for managing traffic to the l1 node, by caching the validator set.
 * Keeps the last N epochs in cache.
 * It also provides a method to get the current or next proposer, and to check who is in the current slot.
 *
 * Note: This class is very dependent on the system clock being in sync.
 */
export class EpochCache implements EpochCacheInterface {
  /**
   * Single map holding both resolved entries and in-flight promises.
   * A `Promise` value means a fetch is in progress; concurrent callers await it.
   */
  protected cache: Map<EpochNumber, CachedEpochEntry | Promise<CachedEpochEntry>> = new Map();
  private allValidators: Set<string> = new Set();
  private lastValidatorRefresh = 0;
  private readonly log: Logger = createLogger('epoch-cache');

  constructor(
    private rollup: RollupContract,
    private readonly l1constants: L1RollupConstants & {
      lagInEpochsForValidatorSet: number;
      lagInEpochsForRandao: number;
    },
    private readonly dateProvider: DateProvider = new DateProvider(),
    protected readonly config = { cacheSize: 12, validatorRefreshIntervalSeconds: 60 },
  ) {
    this.log.debug(`Initialized EpochCache`, {
      l1constants,
    });
  }

  static async create(
    rollupOrAddress: EthAddress | RollupContract,
    config?: EpochCacheConfig,
    deps: { dateProvider?: DateProvider } = {},
  ) {
    config = config ?? getEpochCacheConfigEnvVars();

    // Load the rollup contract if we were given an address
    let rollup: RollupContract;
    if ('address' in rollupOrAddress) {
      rollup = rollupOrAddress;
    } else {
      const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
      const publicClient = createPublicClient({
        chain: chain.chainInfo,
        transport: makeL1HttpTransport(config.l1RpcUrls, { timeout: config.l1HttpTimeoutMS }),
        pollingInterval: config.viemPollingIntervalMS,
      });
      rollup = new RollupContract(publicClient, rollupOrAddress.toString());
    }

    const [
      l1StartBlock,
      l1GenesisTime,
      proofSubmissionEpochs,
      slotDuration,
      epochDuration,
      lagInEpochsForValidatorSet,
      lagInEpochsForRandao,
      targetCommitteeSize,
      rollupManaLimit,
    ] = await Promise.all([
      rollup.getL1StartBlock(),
      rollup.getL1GenesisTime(),
      rollup.getProofSubmissionEpochs(),
      rollup.getSlotDuration(),
      rollup.getEpochDuration(),
      rollup.getLagInEpochsForValidatorSet(),
      rollup.getLagInEpochsForRandao(),
      rollup.getTargetCommitteeSize(),
      rollup.getManaLimit(),
    ] as const);

    const l1RollupConstants = {
      l1StartBlock,
      l1GenesisTime,
      proofSubmissionEpochs: Number(proofSubmissionEpochs),
      slotDuration: Number(slotDuration),
      epochDuration: Number(epochDuration),
      ethereumSlotDuration: config.ethereumSlotDuration,
      l1PublishLeadTime: config.l1PublishLeadTime,
      lagInEpochsForValidatorSet: Number(lagInEpochsForValidatorSet),
      lagInEpochsForRandao: Number(lagInEpochsForRandao),
      targetCommitteeSize: Number(targetCommitteeSize),
      rollupManaLimit: Number(rollupManaLimit),
    };

    return new EpochCache(rollup, l1RollupConstants, deps.dateProvider, {
      cacheSize: 12,
      validatorRefreshIntervalSeconds: 60,
    });
  }

  public getL1Constants(): L1RollupConstants {
    return this.l1constants;
  }

  public getSlotNow(): SlotNumber {
    return this.getEpochAndSlotNow().slot;
  }

  public getTargetSlot(): SlotNumber {
    const slotNow = this.getSlotNow();
    const offset = PROPOSER_PIPELINING_SLOT_OFFSET;
    return SlotNumber(slotNow + offset);
  }

  public getEpochNow(): EpochNumber {
    return this.getEpochAndSlotNow().epoch;
  }

  public getTargetEpoch(): EpochNumber {
    return getEpochAtSlot(this.getTargetSlot(), this.l1constants);
  }

  public getEpochAndSlotNow(): EpochAndSlot & { nowMs: bigint } {
    const nowMs = BigInt(this.dateProvider.now());
    const nowSeconds = nowMs / 1000n;
    return { ...this.getEpochAndSlotAtTimestamp(nowSeconds), nowMs };
  }

  private getEpochAndSlotAtSlot(slot: SlotNumber): EpochAndSlot {
    return this.getEpochAndSlotAtTimestamp(getTimestampForSlot(slot, this.l1constants));
  }

  public getEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint } {
    const nowSeconds = this.dateProvider.nowInSeconds();
    const nextSlotTs = getNextL1SlotTimestamp(nowSeconds, this.l1constants);
    return { ...this.getEpochAndSlotAtTimestamp(nextSlotTs), nowSeconds: BigInt(nowSeconds) };
  }

  public getTargetEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint } {
    const result = this.getEpochAndSlotInNextL1Slot();
    const offset = PROPOSER_PIPELINING_SLOT_OFFSET;
    const targetSlot = SlotNumber(result.slot + offset);
    return { ...result, slot: targetSlot, epoch: getEpochAtSlot(targetSlot, this.l1constants) };
  }

  private getEpochAndSlotAtTimestamp(ts: bigint): EpochAndSlot {
    const slot = getSlotAtTimestamp(ts, this.l1constants);
    const epoch = getEpochNumberAtTimestamp(ts, this.l1constants);
    return {
      slot,
      epoch,
      ts: getTimestampForSlot(slot, this.l1constants),
    };
  }

  public getCommitteeForEpoch(epoch: EpochNumber): Promise<EpochCommitteeInfo> {
    const [startSlot] = getSlotRangeForEpoch(epoch, this.l1constants);
    return this.getCommittee(startSlot);
  }

  /** Returns whether the escape hatch is open for the given epoch. */
  public async isEscapeHatchOpen(epoch: EpochNumber): Promise<boolean> {
    const info = await this.getCommitteeForEpoch(epoch);
    return info.isEscapeHatchOpen;
  }

  /**
   * Returns whether the escape hatch is open for the epoch containing the given slot.
   *
   * This is a lightweight helper intended for callers that already have a slot number and only
   * need the escape hatch flag (without pulling full committee info).
   */
  public async isEscapeHatchOpenAtSlot(slot: SlotTag = 'now'): Promise<boolean> {
    const epoch =
      slot === 'now'
        ? this.getEpochNow()
        : slot === 'next'
          ? this.getEpochAndSlotInNextL1Slot().epoch
          : getEpochAtSlot(slot, this.l1constants);

    return await this.isEscapeHatchOpen(epoch);
  }

  /**
   * Get the current validator set.
   *
   * Returns cached data if the entry is finalized or still fresh (queried less than one
   * Ethereum slot ago). Stale non-finalized entries are re-queried, and concurrent callers
   * coalesce on the same in-flight promise so the L1 query happens only once.
   */
  public async getCommittee(slot: SlotTag = 'now'): Promise<EpochCommitteeInfo> {
    const { epoch, ts } = this.getEpochAndTimestamp(slot);

    const cached = this.cache.get(epoch);

    // In-flight promise: another caller is already fetching this epoch — just await it.
    if (cached instanceof Promise) {
      return (await cached).data;
    }

    // Resolved entry: return it if finalized or still fresh.
    if (cached && (cached.finalized || !this.isStale(cached))) {
      return cached.data;
    }

    // Stale non-finalized entry: do a lightweight refresh first (check block hash + finalized ts).
    // Only fall back to a full re-fetch if the L1 block was reorged.
    if (cached) {
      const promise = this.refreshStaleEntry(cached, epoch, ts);
      this.cache.set(epoch, promise);
      try {
        return (await promise).data;
      } catch (err) {
        this.cache.set(epoch, cached);
        throw err;
      }
    }

    // No entry at all: full fetch.
    const promise = this.fetchAndCache(epoch, ts);
    this.cache.set(epoch, promise);
    try {
      return (await promise).data;
    } catch (err) {
      this.cache.delete(epoch);
      throw err;
    }
  }

  private getEpochAndTimestamp(slot: SlotTag = 'now'): { epoch: EpochNumber; ts: bigint } {
    if (slot === 'now') {
      return this.getEpochAndSlotNow();
    } else if (slot === 'next') {
      return this.getEpochAndSlotInNextL1Slot();
    } else {
      return this.getEpochAndSlotAtSlot(slot);
    }
  }

  /** Evicts oldest cache entries (resolved or in-flight) beyond cacheSize. */
  private purgeCache(): void {
    if (this.cache.size <= this.config.cacheSize) {
      return;
    }
    const toPurge = Array.from(this.cache.keys())
      .sort((a, b) => Number(b - a))
      .slice(this.config.cacheSize);
    toPurge.forEach(key => this.cache.delete(key));
  }

  /** Returns true if a non-finalized cache entry is older than one Ethereum slot. */
  private isStale(entry: CachedEpochEntry): boolean {
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    return nowSeconds - entry.lastRefreshL1Timestamp >= BigInt(this.l1constants.ethereumSlotDuration);
  }

  /** Whether a cached epoch entry has been marked as finalized. Returns undefined if not cached or still in-flight. */
  public isFinalized(epoch: EpochNumber): boolean | undefined {
    const entry = this.cache.get(epoch);
    if (!entry || entry instanceof Promise) {
      return undefined;
    }
    return entry.finalized;
  }

  /** Returns the latest L1 timestamp stored in the cached entry. Undefined if not cached or in-flight. */
  public getCachedLastRefreshL1Timestamp(epoch: EpochNumber): bigint | undefined {
    const entry = this.cache.get(epoch);
    if (!entry || entry instanceof Promise) {
      return undefined;
    }
    return entry.lastRefreshL1Timestamp;
  }

  /** Computes the sampling timestamp for an epoch's committee data. */
  private getSamplingTimestamp(epoch: EpochNumber): bigint {
    const { lagInEpochsForRandao, epochDuration, slotDuration } = this.l1constants;
    const epochStartTs = getStartTimestampForEpoch(epoch, this.l1constants);
    return epochStartTs - BigInt(lagInEpochsForRandao) * BigInt(epochDuration) * BigInt(slotDuration);
  }

  /**
   * Lightweight refresh for a stale non-finalized entry. Queries only the block hash at
   * the original block number and the finalized block timestamp — avoids the expensive
   * getCommitteeAt and getSampleSeedAt calls on the rollup contract.
   *
   * If the block hash still matches (no L1 reorg), we keep the existing data and just
   * update the provenance timestamp. If the finalized block has caught up, we promote the
   * entry to finalized. If there was a reorg (hash mismatch), we fall back to a full fetch.
   */
  private async refreshStaleEntry(stale: CachedEpochEntry, epoch: EpochNumber, ts: bigint): Promise<CachedEpochEntry> {
    const [blockAtOriginal, l1FinalizedBlock, latestBlock] = await Promise.all([
      this.rollup.client.getBlock({ blockNumber: stale.lastQueryL1BlockNumber, includeTransactions: false }),
      getFinalizedL1Block(this.rollup.client),
      this.rollup.client.getBlock({ includeTransactions: false }),
    ]);

    if (blockAtOriginal.hash === stale.lastQueryL1BlockHash) {
      // No reorg: the data is still valid. Check if we can now mark it as finalized.
      const samplingTs = this.getSamplingTimestamp(epoch);
      const finalized =
        !!(stale.data.committee && stale.data.committee.length > 0) &&
        l1FinalizedBlock !== undefined &&
        samplingTs <= l1FinalizedBlock.timestamp;

      const refreshed: CachedEpochEntry = {
        ...stale,
        lastRefreshL1Timestamp: latestBlock.timestamp,
        finalized,
      };
      this.cache.set(epoch, refreshed);
      return refreshed;
    }

    // Reorg detected: block hash mismatch. Do a full re-fetch.
    // Pass the already-fetched block timestamps to avoid redundant queries.
    this.log.warn(`L1 reorg detected for epoch ${epoch}: block ${stale.lastQueryL1BlockNumber} hash changed`, {
      epoch,
      expectedHash: stale.lastQueryL1BlockHash,
      actualHash: blockAtOriginal.hash,
    });
    return this.fetchAndCache(epoch, ts, { latestBlock, finalizedBlock: l1FinalizedBlock });
  }

  /**
   * Fetches committee data from L1, determines finalization status, and stores in the cache.
   *
   * Uses `lagInEpochsForRandao` (the binding constraint, always <= lagInEpochsForValidatorSet)
   * and computes the sampling timestamp from the epoch start to match the L1 contract's logic.
   *
   * When called from refreshStaleEntry after a reorg, the latest and finalized blocks are
   * passed in to avoid redundant L1 queries.
   */
  private async fetchAndCache(
    epoch: EpochNumber,
    ts: bigint,
    prefetched?: { latestBlock: L1BlockInfo; finalizedBlock: { timestamp: bigint } | undefined },
  ): Promise<CachedEpochEntry> {
    const [committee, seedBuffer, latestBlock, finalizedBlock, isEscapeHatchOpen] = await Promise.all([
      this.rollup.getCommitteeAt(ts),
      this.rollup.getSampleSeedAt(ts),
      prefetched?.latestBlock ?? this.rollup.client.getBlock({ includeTransactions: false }),
      prefetched !== undefined ? prefetched.finalizedBlock : getFinalizedL1Block(this.rollup.client),
      this.rollup.isEscapeHatchOpen(epoch),
    ]);

    const samplingTs = this.getSamplingTimestamp(epoch);

    if (samplingTs > latestBlock.timestamp) {
      throw new Error(
        `Cannot query committee for future epoch ${epoch}: ` +
          `sampling timestamp ${samplingTs} is beyond latest L1 block at ${latestBlock.timestamp}. ` +
          `Check your Ethereum node is synced.`,
      );
    }

    // Empty committees are never marked finalized so they always get re-queried after TTL.
    // If L1 has no finalized block yet (devnet startup), entries stay unfinalized.
    const hasCommittee = !!(committee && committee.length > 0);
    const finalized = hasCommittee && finalizedBlock !== undefined && samplingTs <= finalizedBlock.timestamp;
    const data: EpochCommitteeInfo = { committee, seed: seedBuffer.toBigInt(), epoch, isEscapeHatchOpen };
    const entry: CachedEpochEntry = {
      data,
      lastQueryL1BlockNumber: latestBlock.number!,
      lastQueryL1BlockHash: latestBlock.hash!,
      lastRefreshL1Timestamp: latestBlock.timestamp,
      finalized,
    };

    this.cache.set(epoch, entry);
    this.purgeCache();

    return entry;
  }

  /**
   * Get the ABI encoding of the proposer index - see ValidatorSelectionLib.sol computeProposerIndex
   */
  getProposerIndexEncoding(epoch: EpochNumber, slot: SlotNumber, seed: bigint): `0x${string}` {
    return encodeAbiParameters(
      [
        { type: 'uint256', name: 'epoch' },
        { type: 'uint256', name: 'slot' },
        { type: 'uint256', name: 'seed' },
      ],
      [BigInt(epoch), BigInt(slot), seed],
    );
  }

  public computeProposerIndex(slot: SlotNumber, epoch: EpochNumber, seed: bigint, size: bigint): bigint {
    // if committe size is 0, then mod 1 is 0
    if (size === 0n) {
      return 0n;
    }
    return BigInt(keccak256(this.getProposerIndexEncoding(epoch, slot, seed))) % size;
  }

  /** Returns the current and next L2 slot in next eth L1 Slot. */
  public getCurrentAndNextSlot(): { currentSlot: SlotNumber; nextSlot: SlotNumber } {
    const currentSlot = this.getSlotNow();
    const next = this.getEpochAndSlotInNextL1Slot();

    return {
      currentSlot,
      nextSlot: next.slot,
    };
  }

  /** Returns the target and next L2 slot in the next L1 slot. */
  public getTargetAndNextSlot(): { targetSlot: SlotNumber; nextSlot: SlotNumber } {
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const offset = PROPOSER_PIPELINING_SLOT_OFFSET;

    const currentSlot = getSlotAtTimestamp(nowSeconds, this.l1constants);
    const targetSlot = SlotNumber(currentSlot + offset);

    const nextL2SlotOnL1 = getSlotAtNextL1Block(nowSeconds, this.l1constants);
    const nextSlot = SlotNumber(nextL2SlotOnL1 + offset);

    return { targetSlot, nextSlot };
  }

  /**
   * Get the proposer attester address in the given L2 slot
   * @returns The proposer attester address. If the committee does not exist, we throw a NoCommitteeError.
   * If the committee is empty (i.e. target committee size is 0, and anyone can propose), we return undefined.
   */
  public getProposerAttesterAddressInSlot(slot: SlotNumber): Promise<EthAddress | undefined> {
    const epochAndSlot = this.getEpochAndSlotAtSlot(slot);
    return this.getProposerAttesterAddressAt(epochAndSlot);
  }

  /**
   * Get the proposer attester address in the next slot
   * @returns The proposer attester address. If the committee does not exist, we throw a NoCommitteeError.
   * If the committee is empty (i.e. target committee size is 0, and anyone can propose), we return undefined.
   */
  public getProposerAttesterAddressInNextSlot(): Promise<EthAddress | undefined> {
    const epochAndSlot = this.getEpochAndSlotInNextL1Slot();
    return this.getProposerAttesterAddressAt(epochAndSlot);
  }

  /**
   * Get the proposer attester address at a given epoch and slot
   * @param when - The epoch and slot to get the proposer attester address at
   * @returns The proposer attester address. If the committee does not exist, we throw a NoCommitteeError.
   * If the committee is empty (i.e. target committee size is 0, and anyone can propose), we return undefined.
   */
  private async getProposerAttesterAddressAt(when: EpochAndSlot) {
    const { epoch, slot } = when;
    const { committee, seed } = await this.getCommittee(slot);
    if (!committee) {
      throw new NoCommitteeError();
    } else if (committee.length === 0) {
      return undefined;
    }

    const proposerIndex = this.computeProposerIndex(slot, epoch, seed, BigInt(committee.length));
    return committee[Number(proposerIndex)];
  }

  public getProposerFromEpochCommittee(
    epochCommitteeInfo: EpochCommitteeInfo,
    slot: SlotNumber,
  ): EthAddress | undefined {
    if (!epochCommitteeInfo.committee || epochCommitteeInfo.committee.length === 0) {
      return undefined;
    }
    const proposerIndex = this.computeProposerIndex(
      slot,
      epochCommitteeInfo.epoch,
      epochCommitteeInfo.seed,
      BigInt(epochCommitteeInfo.committee.length),
    );

    return epochCommitteeInfo.committee[Number(proposerIndex)];
  }

  /** Check if a validator is in the given slot's committee */
  async isInCommittee(slot: SlotTag, validator: EthAddress): Promise<boolean> {
    const { committee } = await this.getCommittee(slot);
    if (!committee) {
      return false;
    }
    return committee.some(v => v.equals(validator));
  }

  /** From the set of given addresses, return all that are on the committee for the given slot */
  async filterInCommittee(slot: SlotTag, validators: EthAddress[]): Promise<EthAddress[]> {
    const { committee } = await this.getCommittee(slot);
    if (!committee) {
      return [];
    }
    const committeeSet = new Set(committee.map(v => v.toString()));
    return validators.filter(v => committeeSet.has(v.toString()));
  }

  async getRegisteredValidators(): Promise<EthAddress[]> {
    const validatorRefreshIntervalMs = this.config.validatorRefreshIntervalSeconds * 1000;
    const validatorRefreshTime = this.lastValidatorRefresh + validatorRefreshIntervalMs;
    const now = this.dateProvider.now();
    if (validatorRefreshTime < now) {
      const currentSet = await this.rollup.getAttesters(BigInt(Math.floor(now / 1000)));
      this.allValidators = new Set(currentSet.map(v => v.toString()));
      this.lastValidatorRefresh = now;
    }
    return Array.from(this.allValidators.keys()).map(v => EthAddress.fromString(v));
  }
}
