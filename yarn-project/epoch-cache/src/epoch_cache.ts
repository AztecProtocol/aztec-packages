import {
  EmptyL1RollupConstants,
  type L1RollupConstants,
  getEpochNumberAtTimestamp,
  getSlotAtTimestamp,
} from '@aztec/circuit-types';
import { RollupContract, createEthereumChain } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createDebugLogger } from '@aztec/foundation/log';

import { createPublicClient, encodeAbiParameters, http, keccak256 } from 'viem';

import { type EpochCacheConfig, getEpochCacheConfigEnvVars } from './config.js';

type EpochAndSlot = {
  epoch: bigint;
  slot: bigint;
  ts: bigint;
};

/**
 * Epoch cache
 *
 * This class is responsible for managing traffic to the l1 node, by caching the validator set.
 * It also provides a method to get the current or next proposer, and to check who is in the current slot.
 *
 * If the epoch changes, then we update the stored validator set.
 *
 * Note: This class is very dependent on the system clock being in sync.
 */
export class EpochCache {
  private committee: EthAddress[];
  private cachedEpoch: bigint;
  private cachedSampleSeed: bigint;
  private readonly log: Logger = createDebugLogger('aztec:EpochCache');

  constructor(
    private rollup: RollupContract,
    initialValidators: EthAddress[] = [],
    initialSampleSeed: bigint = 0n,
    private readonly l1constants: L1RollupConstants = EmptyL1RollupConstants,
  ) {
    this.committee = initialValidators;
    this.cachedSampleSeed = initialSampleSeed;

    this.log.debug(`Initialized EpochCache with constants and validators`, { l1constants, initialValidators });

    this.cachedEpoch = getEpochNumberAtTimestamp(BigInt(Math.floor(Date.now() / 1000)), this.l1constants);
  }

  static async create(rollupAddress: EthAddress, config?: EpochCacheConfig) {
    config = config ?? getEpochCacheConfigEnvVars();

    const chain = createEthereumChain(config.l1RpcUrl, config.l1ChainId);
    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: http(chain.rpcUrl),
      pollingInterval: config.viemPollingIntervalMS,
    });

    const rollup = new RollupContract(publicClient, rollupAddress.toString());
    const [l1StartBlock, l1GenesisTime, initialValidators, sampleSeed] = await Promise.all([
      rollup.getL1StartBlock(),
      rollup.getL1GenesisTime(),
      rollup.getCurrentEpochCommittee(),
      rollup.getCurrentSampleSeed(),
    ] as const);

    const l1RollupConstants: L1RollupConstants = {
      l1StartBlock,
      l1GenesisTime,
      slotDuration: config.aztecSlotDuration,
      epochDuration: config.aztecEpochDuration,
      ethereumSlotDuration: config.ethereumSlotDuration,
    };

    return new EpochCache(
      rollup,
      initialValidators.map(v => EthAddress.fromString(v)),
      sampleSeed,
      l1RollupConstants,
    );
  }

  getEpochAndSlotNow(): EpochAndSlot {
    const now = BigInt(Math.floor(Date.now() / 1000));
    return this.getEpochAndSlotAtTimestamp(now);
  }

  getEpochAndSlotInNextSlot(): EpochAndSlot {
    const nextSlotTs = BigInt(Math.floor(Date.now() / 1000) + this.l1constants.slotDuration);
    return this.getEpochAndSlotAtTimestamp(nextSlotTs);
  }

  getEpochAndSlotAtTimestamp(ts: bigint): EpochAndSlot {
    return {
      epoch: getEpochNumberAtTimestamp(ts, this.l1constants),
      slot: getSlotAtTimestamp(ts, this.l1constants),
      ts,
    };
  }

  /**
   * Get the current validator set
   *
   * @param nextSlot - If true, get the validator set for the next slot.
   * @returns The current validator set.
   */
  async getCommittee(nextSlot: boolean = false): Promise<EthAddress[]> {
    // If the current epoch has changed, then we need to make a request to update the validator set
    const { epoch: calculatedEpoch, ts } = nextSlot ? this.getEpochAndSlotInNextSlot() : this.getEpochAndSlotNow();

    if (calculatedEpoch !== this.cachedEpoch) {
      this.log.debug(`Epoch changed, updating validator set`, { calculatedEpoch, cachedEpoch: this.cachedEpoch });
      this.cachedEpoch = calculatedEpoch;
      const [committeeAtTs, sampleSeedAtTs] = await Promise.all([
        this.rollup.getCommitteeAt(ts),
        this.rollup.getSampleSeedAt(ts),
      ]);
      this.committee = committeeAtTs.map((v: `0x${string}`) => EthAddress.fromString(v));
      this.cachedSampleSeed = sampleSeedAtTs;
    }

    return this.committee;
  }

  /**
   * Get the ABI encoding of the proposer index - see Leonidas.sol _computeProposerIndex
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
   *
   * If we are at an epoch boundary, then we can update the cache for the next epoch, this is the last check
   * we do in the validator client, so we can update the cache here.
   */
  async getProposerInCurrentOrNextSlot(): Promise<[EthAddress, EthAddress]> {
    // Validators are sorted by their index in the committee, and getValidatorSet will cache
    const committee = await this.getCommittee();
    const { slot: currentSlot, epoch: currentEpoch } = this.getEpochAndSlotNow();
    const { slot: nextSlot, epoch: nextEpoch } = this.getEpochAndSlotInNextSlot();

    // Compute the proposer in this and the next slot
    const proposerIndex = this.computeProposerIndex(
      currentSlot,
      this.cachedEpoch,
      this.cachedSampleSeed,
      BigInt(committee.length),
    );

    // Check if the next proposer is in the next epoch
    if (nextEpoch !== currentEpoch) {
      await this.getCommittee(/*next slot*/ true);
    }
    const nextProposerIndex = this.computeProposerIndex(
      nextSlot,
      this.cachedEpoch,
      this.cachedSampleSeed,
      BigInt(committee.length),
    );

    const calculatedProposer = committee[Number(proposerIndex)];
    const nextCalculatedProposer = committee[Number(nextProposerIndex)];

    return [calculatedProposer, nextCalculatedProposer];
  }

  /**
   * Check if a validator is in the current epoch's committee
   */
  async isInCommittee(validator: EthAddress): Promise<boolean> {
    const committee = await this.getCommittee();
    return committee.some(v => v.equals(validator));
  }
}
