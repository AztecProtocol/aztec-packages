import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import { RollupAbi, SlasherAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  createPublicClient,
  getContract,
  http,
} from 'viem';

import { createEthereumChain } from '../chain.js';
import { type DeployL1Contracts } from '../deploy_l1_contracts.js';
import { type L1ContractAddresses } from '../l1_contract_addresses.js';
import { type L1ReaderConfig } from '../l1_reader.js';
import { SlashingProposerContract } from './slashing_proposer.js';

export type L1RollupContractAddresses = Pick<
  L1ContractAddresses,
  | 'rollupAddress'
  | 'inboxAddress'
  | 'outboxAddress'
  | 'feeJuicePortalAddress'
  | 'feeJuiceAddress'
  | 'stakingAssetAddress'
  | 'rewardDistributorAddress'
>;

export class RollupContract {
  private readonly rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>;

  constructor(public readonly client: PublicClient<HttpTransport, Chain>, address: Hex) {
    this.rollup = getContract({ address, abi: RollupAbi, client });
  }

  public get address() {
    return EthAddress.fromString(this.rollup.address);
  }

  @memoize
  public async getSlashingProposer() {
    const slasherAddress = await this.rollup.read.SLASHER();
    const slasher = getContract({ address: slasherAddress, abi: SlasherAbi, client: this.client });
    const proposerAddress = await slasher.read.PROPOSER();
    return new SlashingProposerContract(this.client, proposerAddress);
  }

  @memoize
  getL1StartBlock() {
    return this.rollup.read.L1_BLOCK_AT_GENESIS();
  }

  @memoize
  getL1GenesisTime() {
    return this.rollup.read.GENESIS_TIME();
  }

  @memoize
  getClaimDurationInL2Slots() {
    return this.rollup.read.CLAIM_DURATION_IN_L2_SLOTS();
  }

  @memoize
  getEpochDuration() {
    return this.rollup.read.EPOCH_DURATION();
  }

  @memoize
  getSlotDuration() {
    return this.rollup.read.SLOT_DURATION();
  }

  @memoize
  getTargetCommitteeSize() {
    return this.rollup.read.TARGET_COMMITTEE_SIZE();
  }

  @memoize
  getMinimumStake() {
    return this.rollup.read.MINIMUM_STAKE();
  }

  getBlockNumber() {
    return this.rollup.read.getPendingBlockNumber();
  }

  getProvenBlockNumber() {
    return this.rollup.read.getProvenBlockNumber();
  }

  getSlotNumber() {
    return this.rollup.read.getCurrentSlot();
  }

  getCommitteeAt(timestamp: bigint) {
    return this.rollup.read.getCommitteeAt([timestamp]);
  }

  getSampleSeedAt(timestamp: bigint) {
    return this.rollup.read.getSampleSeedAt([timestamp]);
  }

  getCurrentSampleSeed() {
    return this.rollup.read.getCurrentSampleSeed();
  }

  getCurrentEpochCommittee() {
    return this.rollup.read.getCurrentEpochCommittee();
  }

  getCurrentProposer() {
    return this.rollup.read.getCurrentProposer();
  }

  async getEpochNumber(blockNumber?: bigint) {
    blockNumber ??= await this.getBlockNumber();
    return this.rollup.read.getEpochForBlock([BigInt(blockNumber)]);
  }

  async getRollupAddresses(): Promise<L1RollupContractAddresses> {
    const [
      inboxAddress,
      outboxAddress,
      feeJuicePortalAddress,
      rewardDistributorAddress,
      feeJuiceAddress,
      stakingAssetAddress,
    ] = (
      await Promise.all([
        this.rollup.read.INBOX(),
        this.rollup.read.OUTBOX(),
        this.rollup.read.FEE_JUICE_PORTAL(),
        this.rollup.read.REWARD_DISTRIBUTOR(),
        this.rollup.read.ASSET(),
        this.rollup.read.STAKING_ASSET(),
      ] as const)
    ).map(EthAddress.fromString);

    return {
      rollupAddress: this.address,
      inboxAddress,
      outboxAddress,
      feeJuicePortalAddress,
      feeJuiceAddress,
      stakingAssetAddress,
      rewardDistributorAddress,
    };
  }

  static getFromL1ContractsValues(deployL1ContractsValues: DeployL1Contracts) {
    const {
      publicClient,
      l1ContractAddresses: { rollupAddress },
    } = deployL1ContractsValues;
    return new RollupContract(publicClient, rollupAddress.toString());
  }

  static getFromConfig(config: L1ReaderConfig) {
    const client = createPublicClient({
      transport: http(config.l1RpcUrl),
      chain: createEthereumChain(config.l1RpcUrl, config.l1ChainId).chainInfo,
    });
    const address = config.l1Contracts.rollupAddress.toString();
    return new RollupContract(client, address);
  }
}
