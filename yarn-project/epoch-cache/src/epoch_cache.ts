import {
  EmptyL1RollupConstants,
  type L1RollupConstants,
  getEpochNumberAtTimestamp,
  getSlotAtTimestamp,
} from '@aztec/circuit-types';
import {
  RollupContract,
  createEthereumChain,
} from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { getEpochCacheConfigEnvVars, type EpochCacheConfig } from './config.js';

import { createPublicClient, encodeAbiParameters, keccak256, http, PublicClient } from 'viem';
import { Logger } from '@aztec/foundation/log';
import { createDebugLogger } from '@aztec/foundation/log';

type EpochAndSlot = {
  epoch: bigint;
  slot: bigint;
  ts: bigint;
};

// TODO: adjust log levels in file
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

    this.log.verbose(`Initialized EpochCache with constants and validators`, { l1constants, initialValidators });

    this.cachedEpoch = getEpochNumberAtTimestamp(BigInt(Math.floor(Date.now() / 1000)), this.l1constants);
  }


  // TODO: cleanup and merge rollup getters with l1 createAndSync in the archiver
  // TODO: be aware that the timestamp source may be lagging behind since it is from the archiver??? - double check that there are no issues here
  //       how will this behave at the epoch boundary?
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

  async getEpochAndSlotNow(): Promise<EpochAndSlot> {
    const now = BigInt(Math.floor(Date.now() / 1000));
    return this.getEpochAndSlotAtTimestamp(now);
  }

  getEpochAndSlotAtTimestamp(ts: bigint): EpochAndSlot {
    return {
      epoch: getEpochNumberAtTimestamp(ts, this.l1constants),
      slot: getSlotAtTimestamp(ts, this.l1constants),
      ts,
    };
  }

  // TODO: when the validator is asking about this, it may be in a slot that is across the epoch boundary
  //       we need to make sure that whenever we receive a request we are certain that the timing is correct
  //       - my first attempt used node timers, but this did not work well in tests that we jump into the future
  // .     - now i am reading the timestamp from the chain, but i need to make sure that we are only proposing for
  //       - the next slot, which means i sort of still need access to the archiver, to know what the last slot we
  //       - saw was, and that we do not get requested to attest to slots that are in the past


  async getCommittee(): Promise<EthAddress[]> {
    // If the current epoch has changed, then we need to make a request to update the validator set
    const { epoch: calculatedEpoch, ts } = await this.getEpochAndSlotNow();

    if (calculatedEpoch !== this.cachedEpoch) {
      this.log.verbose(`Epoch changed, updating validator set`, { calculatedEpoch, cachedEpoch: this.cachedEpoch });
      this.cachedEpoch = calculatedEpoch;
      const [committeeAtTs, sampleSeedAtTs] = await Promise.all([
        this.rollup.getCommitteeAt(ts),
        this.rollup.getSampleSeedAt(ts),
      ]);
      this.committee = committeeAtTs.map((v: `0x${string}`) => EthAddress.fromString(v));
      this.cachedSampleSeed = sampleSeedAtTs;
      console.log('this.committee updated to ', this.committee);
    }

    return this.committee;
  }

  getProposerIndexEncoding(epoch: bigint, slot: bigint, seed: bigint): `0x${string}` {
    return encodeAbiParameters([
      { type: 'uint256', name: 'epoch' }, { type: 'uint256', name: 'slot' }, { type: 'uint256', name: 'seed' }],
      [epoch, slot, seed]);
  }

  async computeProposerIndex(slot: bigint, epoch: bigint, seed: bigint, size: bigint): Promise<bigint> {
    return BigInt(keccak256(this.getProposerIndexEncoding(epoch, slot, seed))) % size;
  }

  // TODO: just use another timing library
  async getCurrentProposer(slot: bigint): Promise<EthAddress> {
    console.log('\n\n\n\n\ngetting current proposer\n\n\n\n\n');
    // Validators are sorted by their index in the committee, and getValidatorSet will cache
    // TODO: should we get the timestamp from the underlying l1 node?
    const committee = await this.getCommittee();
    // const { slot: currentSlot, ts } = await this.getEpochAndSlotNow();
    // console.log('currentSlot', currentSlot);
    const [proposerFromL1] = await Promise.all([this.rollup.getCurrentProposer()]);

    console.log('timestampFromL1', await this.rollup.getTimestamp());
    const { slot: currentSlot, ts } = await this.getEpochAndSlotNow();
    console.log('local ts', ts);

    // TODO: could also cache this
    const proposerIndex = await this.computeProposerIndex(slot, this.cachedEpoch, this.cachedSampleSeed, BigInt(committee.length));
    const proposerIndexFromL1 = await this.rollup.getInternalProposerIndexAt(ts);
    console.log('locally calculated proposerIndex', proposerIndex);
    console.log('proposerIndexFromL1', proposerIndexFromL1);

    // return committee[Number(proposerIndex)];
    // TODO: fix this, we need to request the seed from l1 for this epoch, we can cache this along side the epoch information
    const calculatedProposer = committee[Number(proposerIndex)];


    const [internalSampleEncoding, epoch] = await this.rollup.getInternalSampleEncodingAt(ts);

    console.log('self proposer encoding', this.getProposerIndexEncoding(this.cachedEpoch, slot, this.cachedSampleSeed));
    console.log('internalSampleEncoding', internalSampleEncoding);

    console.log('calculatedProposer', calculatedProposer);
    console.log('proposerFromL1', proposerFromL1);

    return calculatedProposer;
  }

  async isInCommittee(validator: EthAddress): Promise<boolean> {
    const committee = await this.getCommittee();
    return committee.some(v => v.equals(validator));
  }
}
