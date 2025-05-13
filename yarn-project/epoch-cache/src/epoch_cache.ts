import { RollupContract, createEthereumChain } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import {
  EmptyL1RollupConstants,
  type L1RollupConstants,
  getEpochAtSlot,
  getEpochNumberAtTimestamp,
  getSlotAtTimestamp,
  getTimestampRangeForEpoch,
} from '@aztec/stdlib/epoch-helpers';

import { createPublicClient, encodeAbiParameters, fallback, http, keccak256 } from 'viem';

import { type EpochCacheConfig, getEpochCacheConfigEnvVars } from './config.js';

type EpochAndSlot = {
  epoch: bigint;
  slot: bigint;
  ts: bigint;
};

export type EpochCommitteeInfo = {
  committee: EthAddress[];
  seed: bigint;
  epoch: bigint;
};

export interface EpochCacheInterface {
  getCommittee(slot: 'now' | 'next' | bigint | undefined): Promise<EpochCommitteeInfo>;
  getEpochAndSlotNow(): EpochAndSlot;
  getProposerIndexEncoding(epoch: bigint, slot: bigint, seed: bigint): `0x${string}`;
  computeProposerIndex(slot: bigint, epoch: bigint, seed: bigint, size: bigint): bigint;
  getProposerInCurrentOrNextSlot(): Promise<{
    currentProposer: EthAddress;
    nextProposer: EthAddress;
    currentSlot: bigint;
    nextSlot: bigint;
  }>;
  isInCommittee(validator: EthAddress): Promise<boolean>;
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
  private readonly log: Logger = createLogger('epoch-cache');

  constructor(
    private rollup: RollupContract,
    initialEpoch: bigint = 0n,
    initialValidators: EthAddress[] = [],
    initialSampleSeed: bigint = 0n,
    private readonly l1constants: L1RollupConstants = EmptyL1RollupConstants,
    private readonly dateProvider: DateProvider = new DateProvider(),
    private readonly config = { cacheSize: 12 },
  ) {
    this.cache.set(initialEpoch, { epoch: initialEpoch, committee: initialValidators, seed: initialSampleSeed });
    this.log.debug(`Initialized EpochCache with ${initialValidators.length} validators`, {
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
    const [l1StartBlock, l1GenesisTime, initialValidators, sampleSeed, epochNumber] = await Promise.all([
      rollup.getL1StartBlock(),
      rollup.getL1GenesisTime(),
      rollup.getCurrentEpochCommittee(),
      rollup.getCurrentSampleSeed(),
      rollup.getEpochNumber(),
    ] as const);

    const l1RollupConstants: L1RollupConstants = {
      l1StartBlock,
      l1GenesisTime,
      proofSubmissionWindow: config.aztecProofSubmissionWindow,
      slotDuration: config.aztecSlotDuration,
      epochDuration: config.aztecEpochDuration,
      ethereumSlotDuration: config.ethereumSlotDuration,
    };

    return new EpochCache(
      rollup,
      epochNumber,
      initialValidators.map(v => EthAddress.fromString(v)),
      sampleSeed,
      l1RollupConstants,
      deps.dateProvider,
    );
  }

  public getL1Constants(): L1RollupConstants {
    return this.l1constants;
  }

  public getEpochAndSlotNow(): EpochAndSlot {
    return this.getEpochAndSlotAtTimestamp(this.nowInSeconds());
  }

  private nowInSeconds(): bigint {
    return BigInt(Math.floor(this.dateProvider.now() / 1000));
  }

  private getEpochAndSlotAtSlot(slot: bigint): EpochAndSlot {
    const epoch = getEpochAtSlot(slot, this.l1constants);
    const ts = getTimestampRangeForEpoch(epoch, this.l1constants)[0];
    return { epoch, ts, slot };
  }

  private getEpochAndSlotInNextSlot(): EpochAndSlot {
    const nextSlotTs = this.nowInSeconds() + BigInt(this.l1constants.slotDuration);
    return this.getEpochAndSlotAtTimestamp(nextSlotTs);
  }

  private getEpochAndSlotAtTimestamp(ts: bigint): EpochAndSlot {
    return {
      epoch: getEpochNumberAtTimestamp(ts, this.l1constants),
      slot: getSlotAtTimestamp(ts, this.l1constants),
      ts,
    };
  }

  /**
   * Get the current validator set
   * @param nextSlot - If true, get the validator set for the next slot.
   * @returns The current validator set.
   */
  public async getCommittee(slot: 'now' | 'next' | bigint = 'now'): Promise<EpochCommitteeInfo> {
    const { epoch, ts } = this.getEpochAndTimestamp(slot);

    if (this.cache.has(epoch)) {
      return this.cache.get(epoch)!;
    }

    const epochData = await this.computeCommittee({ epoch, ts });
    this.cache.set(epoch, epochData);

    const toPurge = Array.from(this.cache.keys())
      .sort((a, b) => Number(b - a))
      .slice(this.config.cacheSize);
    toPurge.forEach(key => this.cache.delete(key));

    return epochData;
  }

  private getEpochAndTimestamp(slot: 'now' | 'next' | bigint = 'now') {
    if (slot === 'now') {
      return this.getEpochAndSlotNow();
    } else if (slot === 'next') {
      return this.getEpochAndSlotInNextSlot();
    } else {
      return this.getEpochAndSlotAtSlot(slot);
    }
  }

  private async computeCommittee(when: { epoch: bigint; ts: bigint }): Promise<EpochCommitteeInfo> {
    const { ts, epoch } = when;
    const [committeeHex, seed] = await Promise.all([this.rollup.getCommitteeAt(ts), this.rollup.getSampleSeedAt(ts)]);
    const committee = committeeHex.map((v: `0x${string}`) => EthAddress.fromString(v));
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
    return BigInt(keccak256(this.getProposerIndexEncoding(epoch, slot, seed))) % size;
  }

  /**
   * Returns the current and next proposer
   *
   * We return the next proposer as the node will check if it is the proposer at the next ethereum block, which
   * can be the next slot. If this is the case, then it will send proposals early.
   */
  async getProposerInCurrentOrNextSlot(): Promise<{
    currentProposer: EthAddress;
    nextProposer: EthAddress;
    currentSlot: bigint;
    nextSlot: bigint;
  }> {
    const current = this.getEpochAndSlotNow();
    const next = this.getEpochAndSlotInNextSlot();

    return {
      currentProposer: await this.getProposerAt(current),
      nextProposer: await this.getProposerAt(next),
      currentSlot: current.slot,
      nextSlot: next.slot,
    };
  }

  private async getProposerAt(when: EpochAndSlot) {
    const { epoch, slot } = when;
    const { seed, committee } = await this.getCommittee(slot);
    const proposerIndex = this.computeProposerIndex(slot, epoch, seed, BigInt(committee.length));
    return committee[Number(proposerIndex)];
  }

  /**
   * Check if a validator is in the current epoch's committee
   */
  async isInCommittee(validator: EthAddress): Promise<boolean> {
    const { committee } = await this.getCommittee();
    return committee.some(v => v.equals(validator));
  }
}
