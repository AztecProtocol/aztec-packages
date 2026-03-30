import { createEthereumChain } from '@aztec/ethereum/chain';
import { makeL1HttpTransport } from '@aztec/ethereum/client';
import { NoCommitteeError, RollupContract } from '@aztec/ethereum/contracts';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { Buffer32 } from '@aztec/foundation/buffer';
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
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';

import { createPublicClient, encodeAbiParameters, keccak256 } from 'viem';

import { type EpochCacheConfig, getEpochCacheConfigEnvVars } from './config.js';
import { EpochNotFinalizedError, EpochNotStableError } from './errors.js';
import {
  type EpochAndSlot,
  type EpochCacheConstants,
  type EpochCacheInterface,
  type EpochCommitteeInfo,
  PROPOSER_PIPELINING_SLOT_OFFSET,
  type SlotTag,
} from './types.js';

export { EpochNotFinalizedError, EpochNotStableError } from './errors.js';
export {
  type EpochAndSlot,
  type EpochCacheConstants,
  type EpochCacheInterface,
  type EpochCommitteeInfo,
  PROPOSER_PIPELINING_SLOT_OFFSET,
  type SlotTag,
} from './types.js';

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
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  protected cache: Map<EpochNumber, EpochCommitteeInfo> = new Map();
  private allValidators: Set<string> = new Set();
  private lastValidatorRefresh = 0;
  private readonly log: Logger = createLogger('epoch-cache');

  protected enableProposerPipelining: boolean;

  constructor(
    private rollup: RollupContract,
    private readonly l1constants: EpochCacheConstants,
    private readonly dateProvider: DateProvider = new DateProvider(),
    protected readonly config = { cacheSize: 12, validatorRefreshIntervalSeconds: 60, enableProposerPipelining: false },
  ) {
    this.enableProposerPipelining = this.config.enableProposerPipelining;
    this.log.debug(`Initialized EpochCache`, {
      l1constants,
      enableProposerPipelining: this.enableProposerPipelining,
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
      lagInEpochsForValidatorSet: Number(lagInEpochsForValidatorSet),
      lagInEpochsForRandao: Number(lagInEpochsForRandao),
      targetCommitteeSize: Number(targetCommitteeSize),
      rollupManaLimit: Number(rollupManaLimit),
    };

    return new EpochCache(rollup, l1RollupConstants, deps.dateProvider, {
      cacheSize: 12,
      validatorRefreshIntervalSeconds: 60,
      enableProposerPipelining: config.enableProposerPipelining,
    });
  }

  public getL1Constants(): L1RollupConstants {
    return this.l1constants;
  }

  /** Returns L1 constants including the lag parameters used for committee computation. */
  public getEpochCacheConstants(): EpochCacheConstants {
    return this.l1constants;
  }

  public isProposerPipeliningEnabled(): boolean {
    return this.enableProposerPipelining;
  }

  public getSlotNow(): SlotNumber {
    return this.getEpochAndSlotNow().slot;
  }

  public getTargetSlot(): SlotNumber {
    const slotNow = this.getSlotNow();
    const offset = this.isProposerPipeliningEnabled() ? PROPOSER_PIPELINING_SLOT_OFFSET : 0;
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
    if (!this.isProposerPipeliningEnabled()) {
      return this.getEpochAndSlotInNextL1Slot();
    }

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

  /**
   * Returns whether the escape hatch is open for the given epoch.
   *
   * Uses the already-cached EpochCommitteeInfo when available. If not cached, it will fetch
   * the epoch committee info (which includes the escape hatch flag) and return it.
   */
  public async isEscapeHatchOpen(epoch: EpochNumber): Promise<boolean> {
    const cached = this.cache.get(epoch);
    if (cached) {
      return cached.isEscapeHatchOpen;
    }
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
   * Get the current validator set
   * @param nextSlot - If true, get the validator set for the next slot.
   * @returns The current validator set.
   */
  public async getCommittee(slot: SlotTag = 'now'): Promise<EpochCommitteeInfo> {
    const { epoch, ts } = this.getEpochAndTimestamp(slot);

    if (this.cache.has(epoch)) {
      return this.cache.get(epoch)!;
    }

    const epochData = await this.computeCommittee({ epoch, ts });
    // If the committee size is 0 or undefined, then do not cache
    if (!epochData.committee || epochData.committee.length === 0) {
      return epochData;
    }
    this.cache.set(epoch, epochData);

    const toPurge = Array.from(this.cache.keys())
      .sort((a, b) => Number(b - a))
      .slice(this.config.cacheSize);
    toPurge.forEach(key => this.cache.delete(key));

    return epochData;
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

  private async computeCommittee(when: { epoch: EpochNumber; ts: bigint }): Promise<EpochCommitteeInfo> {
    const { ts, epoch } = when;
    let committee: EthAddress[] | undefined;
    let seedBuffer: Buffer32;
    let l1FinalizedTimestamp: bigint;
    let isEscapeHatchOpen: boolean;
    try {
      [committee, seedBuffer, l1FinalizedTimestamp, isEscapeHatchOpen] = await Promise.all([
        this.rollup.getCommitteeAt(ts),
        this.rollup.getSampleSeedAt(ts),
        this.rollup.client.getBlock({ blockTag: 'finalized', includeTransactions: false }).then(b => b.timestamp),
        this.rollup.isEscapeHatchOpen(epoch),
      ]);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('ValidatorSelection__EpochNotStable')) {
        throw new EpochNotStableError(epoch, err);
      }
      throw err;
    }
    // Use the finalized block tag to ensure the RANDAO seed and validator set snapshot
    // fall within finalized L1 history, protecting against L1 reorgs that could change
    // the committee after we cache it. Uses lagInEpochsForRandao as the binding constraint
    // (it's always <= lagInEpochsForValidatorSet). The sampling timestamp is computed from
    // the epoch start (not the individual slot timestamp) to match the L1 contract's logic.
    const { lagInEpochsForRandao, epochDuration, slotDuration } = this.l1constants;
    const epochStartTs = getTimestampForSlot(getSlotRangeForEpoch(epoch, this.l1constants)[0], this.l1constants);
    const lagSeconds = BigInt(lagInEpochsForRandao) * BigInt(epochDuration) * BigInt(slotDuration);
    const samplingTs = epochStartTs - lagSeconds;
    if (samplingTs > l1FinalizedTimestamp) {
      throw new EpochNotFinalizedError(epoch, samplingTs, l1FinalizedTimestamp);
    }
    return { committee, seed: seedBuffer.toBigInt(), epoch, isEscapeHatchOpen };
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
    // if committee size is 0, then mod 1 is 0
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

  /** Returns the target and next L2 slot in the next L1 slot */
  public getTargetAndNextSlot(): { targetSlot: SlotNumber; nextSlot: SlotNumber } {
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const offset = this.isProposerPipeliningEnabled() ? PROPOSER_PIPELINING_SLOT_OFFSET : 0;

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
