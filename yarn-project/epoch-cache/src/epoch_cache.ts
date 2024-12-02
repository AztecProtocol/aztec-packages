import {
  EmptyL1RollupConstants,
  type L1RollupConstants,
  getEpochNumberAtTimestamp,
  getSlotAtTimestamp,
} from '@aztec/circuit-types';
import {
  RollupContract,
  createEthereumChain,
  getL1ContractsConfigEnvVars,
  getL1ReaderConfigFromEnv,
} from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';

import { createPublicClient, http } from 'viem';

type EpochAndSlot = {
  epoch: bigint;
  slot: bigint;
  ts: bigint;
};

export class EpochCache {
  private validators: EthAddress[];
  private cachedEpoch: bigint;

  constructor(
    private rollup: RollupContract,
    initialValidators: EthAddress[] = [],
    private readonly l1constants: L1RollupConstants = EmptyL1RollupConstants,
  ) {
    this.validators = initialValidators;

    this.cachedEpoch = getEpochNumberAtTimestamp(BigInt(Math.floor(Date.now() / 1000)), this.l1constants);
  }

  // TODO: cleanup and merge rollup getters with l1 createAndSync in the archiver
  static async create(rollupAddress: EthAddress) {
    const l1ReaderConfig = getL1ReaderConfigFromEnv();
    const l1constants = getL1ContractsConfigEnvVars();

    const chain = createEthereumChain(l1ReaderConfig.l1RpcUrl, l1ReaderConfig.l1ChainId);
    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: http(chain.rpcUrl),
      pollingInterval: l1ReaderConfig.viemPollingIntervalMS,
    });

    const rollup = new RollupContract(publicClient, rollupAddress.toString());
    const [l1StartBlock, l1GenesisTime, initialValidators] = await Promise.all([
      rollup.getL1StartBlock(),
      rollup.getL1GenesisTime(),
      rollup.getCurrentEpochCommittee(),
    ] as const);

    const l1RollupConstants: L1RollupConstants = {
      l1StartBlock,
      l1GenesisTime,
      slotDuration: l1constants.aztecSlotDuration,
      epochDuration: l1constants.aztecEpochDuration,
      ethereumSlotDuration: l1constants.ethereumSlotDuration,
    };

    return new EpochCache(
      rollup,
      initialValidators.map(v => EthAddress.fromString(v)),
      l1RollupConstants,
    );
  }

  getEpochAndSlotNow(): EpochAndSlot {
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

  async getValidatorSet(): Promise<EthAddress[]> {
    // If the current epoch has changed, then we need to make a request to update the validator set
    const { epoch: calculatedEpoch, ts } = this.getEpochAndSlotNow();

    if (calculatedEpoch !== this.cachedEpoch) {
      this.cachedEpoch = calculatedEpoch;
      const validatorSet = await this.rollup.getCommitteeAt(ts);
      this.validators = validatorSet.map((v: `0x${string}`) => EthAddress.fromString(v));
    }

    return this.validators;
  }

  async getCurrentValidator(): Promise<EthAddress> {
    // Validators are sorted by their index in the committee, and getValidatorSet will cache
    // TODO: should we get the timestamp from the underlying l1 node?
    const { slot: currentSlot } = this.getEpochAndSlotNow();
    const validators = await this.getValidatorSet();

    return validators[Number(currentSlot) % validators.length];
  }

  async isInCommittee(validator: EthAddress): Promise<boolean> {
    const validators = await this.getValidatorSet();
    return validators.includes(validator);
  }
}
