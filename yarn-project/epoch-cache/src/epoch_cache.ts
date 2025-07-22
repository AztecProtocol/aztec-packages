import { NoCommitteeError, RollupContract, createEthereumChain } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import {
  EmptyL1RollupConstants,
  type L1RollupConstants,
  getEpochAtSlot,
  getEpochNumberAtTimestamp,
  getSlotAtTimestamp,
  getSlotRangeForEpoch,
  getTimestampForSlot,
  getTimestampRangeForEpoch,
} from '@aztec/stdlib/epoch-helpers';

import { createPublicClient, encodeAbiParameters, fallback, http, keccak256 } from 'viem';

import { type EpochCacheConfig, getEpochCacheConfigEnvVars } from './config.js';

export type EpochAndSlot = {
  epoch: bigint;
  slot: bigint;
  ts: bigint;
};

export type EpochCommitteeInfo = {
  committee: EthAddress[] | undefined;
  seed: bigint;
  epoch: bigint;
};

export type SlotTag = 'now' | 'next' | bigint;

export interface EpochCacheInterface {
  getCommittee(slot: SlotTag | undefined): Promise<EpochCommitteeInfo>;
  getEpochAndSlotNow(): EpochAndSlot;
  getEpochAndSlotInNextL1Slot(): EpochAndSlot & { now: bigint };
  getProposerIndexEncoding(epoch: bigint, slot: bigint, seed: bigint): `0x${string}`;
  computeProposerIndex(slot: bigint, epoch: bigint, seed: bigint, size: bigint): bigint;
  getProposerAttesterAddressInCurrentOrNextSlot(): Promise<{
    currentProposer: EthAddress | undefined;
    nextProposer: EthAddress | undefined;
    currentSlot: bigint;
    nextSlot: bigint;
  }>;
  getRegisteredValidators(): Promise<EthAddress[]>;
  isInCommittee(slot: SlotTag, validator: EthAddress): Promise<boolean>;
  filterInCommittee(slot: SlotTag, validators: EthAddress[]): Promise<EthAddress[]>;
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
  private cache: Map<bigint, EpochCommitteeInfo> = new Map();
  private allValidators: Set<string> = new Set();
  private lastValidatorRefresh = 0;
  private readonly log: Logger = createLogger('epoch-cache');

  constructor(
    private rollup: RollupContract,
    initialEpoch: bigint = 0n,
    initialValidators: EthAddress[] | undefined = undefined,
    initialSampleSeed: bigint = 0n,
    private readonly l1constants: L1RollupConstants = EmptyL1RollupConstants,
    private readonly dateProvider: DateProvider = new DateProvider(),
    private readonly config = { cacheSize: 12, validatorRefreshIntervalSeconds: 60 },
  ) {
    this.cache.set(initialEpoch, { epoch: initialEpoch, committee: initialValidators, seed: initialSampleSeed });
    this.log.debug(`Initialized EpochCache with ${initialValidators?.length ?? 'no'} validators`, {
      l1constants,
      initialValidators,
      initialSampleSeed,
      initialEpoch,
    });
  }

  static async create(
    rollupAddress: EthAddress,
    config?: EpochCacheConfig,
    deps: { dateProvider?: DateProvider } = {},
  ) {
    config = config ?? getEpochCacheConfigEnvVars();

    const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback(config.l1RpcUrls.map(url => http(url))),
      pollingInterval: config.viemPollingIntervalMS,
    });

    const rollup = new RollupContract(publicClient, rollupAddress.toString());
    const [l1StartBlock, l1GenesisTime, initialValidators, sampleSeed, epochNumber, proofSubmissionEpochs] =
      await Promise.all([
        rollup.getL1StartBlock(),
        rollup.getL1GenesisTime(),
        rollup.getCurrentEpochCommittee(),
        rollup.getCurrentSampleSeed(),
        rollup.getEpochNumber(),
        rollup.getProofSubmissionEpochs(),
      ] as const);

    const l1RollupConstants: L1RollupConstants = {
      l1StartBlock,
      l1GenesisTime,
      proofSubmissionEpochs: Number(proofSubmissionEpochs),
      slotDuration: config.aztecSlotDuration,
      epochDuration: config.aztecEpochDuration,
      ethereumSlotDuration: config.ethereumSlotDuration,
    };

    return new EpochCache(
      rollup,
      epochNumber,
      initialValidators?.map(v => EthAddress.fromString(v)),
      sampleSeed,
      l1RollupConstants,
      deps.dateProvider,
    );
  }

  public getL1Constants(): L1RollupConstants {
    return this.l1constants;
  }

  public getEpochAndSlotNow(): EpochAndSlot & { now: bigint } {
    const now = this.nowInSeconds();
    return { ...this.getEpochAndSlotAtTimestamp(now), now };
  }

  public nowInSeconds(): bigint {
    return BigInt(Math.floor(this.dateProvider.now() / 1000));
  }

  private getEpochAndSlotAtSlot(slot: bigint): EpochAndSlot {
    const epoch = getEpochAtSlot(slot, this.l1constants);
    const ts = getTimestampRangeForEpoch(epoch, this.l1constants)[0];
    return { epoch, ts, slot };
  }

  public getEpochAndSlotInNextL1Slot(): EpochAndSlot & { now: bigint } {
    const now = this.nowInSeconds();
    const nextSlotTs = now + BigInt(this.l1constants.ethereumSlotDuration);
    return { ...this.getEpochAndSlotAtTimestamp(nextSlotTs), now };
  }

  private getEpochAndSlotAtTimestamp(ts: bigint): EpochAndSlot {
    const slot = getSlotAtTimestamp(ts, this.l1constants);
    return {
      epoch: getEpochNumberAtTimestamp(ts, this.l1constants),
      ts: getTimestampForSlot(slot, this.l1constants),
      slot,
    };
  }

  public getCommitteeForEpoch(epoch: bigint): Promise<EpochCommitteeInfo> {
    const [startSlot] = getSlotRangeForEpoch(epoch, this.l1constants);
    return this.getCommittee(startSlot);
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

  private getEpochAndTimestamp(slot: SlotTag = 'now') {
    if (slot === 'now') {
      return this.getEpochAndSlotNow();
    } else if (slot === 'next') {
      return this.getEpochAndSlotInNextL1Slot();
    } else {
      return this.getEpochAndSlotAtSlot(slot);
    }
  }

  private async computeCommittee(when: { epoch: bigint; ts: bigint }): Promise<EpochCommitteeInfo> {
    const { ts, epoch } = when;
    const [committeeHex, seed] = await Promise.all([this.rollup.getCommitteeAt(ts), this.rollup.getSampleSeedAt(ts)]);
    const committee = committeeHex?.map((v: `0x${string}`) => EthAddress.fromString(v));
    return { committee, seed, epoch };
  }

  /**
   * Get the ABI encoding of the proposer index - see ValidatorSelectionLib.sol computeProposerIndex
   */
  getProposerIndexEncoding(epoch: bigint, slot: bigint, seed: bigint): `0x${string}` {
    return encodeAbiParameters(
      [
        { type: 'uint256', name: 'epoch' },
        { type: 'uint256', name: 'slot' },
        { type: 'uint256', name: 'seed' },
      ],
      [epoch, slot, seed],
    );
  }

  computeProposerIndex(slot: bigint, epoch: bigint, seed: bigint, size: bigint): bigint {
    // if committe size is 0, then mod 1 is 0
    if (size === 0n) {
      return 0n;
    }
    return BigInt(keccak256(this.getProposerIndexEncoding(epoch, slot, seed))) % size;
  }

  /**
   * Returns the current and next proposer's attester address
   *
   * We return the next proposer's attester address as the node will check if it is the proposer at the next ethereum block,
   * which can be the next slot. If this is the case, then it will send proposals early.
   */
  async getProposerAttesterAddressInCurrentOrNextSlot(): Promise<{
    currentSlot: bigint;
    nextSlot: bigint;
    currentProposer: EthAddress | undefined;
    nextProposer: EthAddress | undefined;
  }> {
    const current = this.getEpochAndSlotNow();
    const next = this.getEpochAndSlotInNextL1Slot();

    return {
      currentProposer: await this.getProposerAttesterAddressAt(current),
      nextProposer: await this.getProposerAttesterAddressAt(next),
      currentSlot: current.slot,
      nextSlot: next.slot,
    };
  }

  /**
   * Get the proposer attester address in the next slot
   * @returns The proposer attester address. If the committee does not exist, we throw a NoCommitteeError.
   * If the committee is empty (i.e. target committee size is 0, and anyone can propose), we return undefined.
   */
  getProposerAttesterAddressInNextSlot(): Promise<EthAddress | undefined> {
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
    if (validatorRefreshTime < this.dateProvider.now()) {
      const currentSet = await this.rollup.getAttesters();
      this.allValidators = new Set(currentSet);
      this.lastValidatorRefresh = this.dateProvider.now();
    }
    return Array.from(this.allValidators.keys().map(v => EthAddress.fromString(v)));
  }
}
