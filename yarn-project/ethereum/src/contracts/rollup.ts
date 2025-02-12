import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemSignature } from '@aztec/foundation/eth-signature';
import { RollupAbi, RollupStorage, SlasherAbi } from '@aztec/l1-artifacts';

import { type Account, type GetContractReturnType, type Hex, getAddress, getContract } from 'viem';

import { getPublicClient } from '../client.js';
import { type DeployL1ContractsReturnType } from '../deploy_l1_contracts.js';
import { type L1ContractAddresses } from '../l1_contract_addresses.js';
import { type L1ReaderConfig } from '../l1_reader.js';
import { type ViemPublicClient } from '../types.js';
import { formatViemError } from '../utils.js';
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
  private readonly rollup: GetContractReturnType<typeof RollupAbi, ViemPublicClient>;

  static get checkBlobStorageSlot(): bigint {
    const asString = RollupStorage.find(storage => storage.label === 'checkBlob')?.slot;
    if (asString === undefined) {
      throw new Error('checkBlobStorageSlot not found');
    }
    return BigInt(asString);
  }

  static getFromL1ContractsValues(deployL1ContractsValues: DeployL1ContractsReturnType) {
    const {
      publicClient,
      l1ContractAddresses: { rollupAddress },
    } = deployL1ContractsValues;
    return new RollupContract(publicClient, rollupAddress.toString());
  }

  static getFromConfig(config: L1ReaderConfig) {
    const client = getPublicClient(config);
    const address = config.l1Contracts.rollupAddress.toString();
    return new RollupContract(client, address);
  }

  constructor(public readonly client: ViemPublicClient, address: Hex) {
    this.rollup = getContract({ address, abi: RollupAbi, client });
  }

  public get address() {
    return this.rollup.address;
  }

  @memoize
  public async getSlashingProposer() {
    const slasherAddress = await this.rollup.read.getSlasher();
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
    return this.rollup.read.getGenesisTime();
  }

  @memoize
  getProofSubmissionWindow() {
    return this.rollup.read.getProofSubmissionWindow();
  }

  @memoize
  getEpochDuration() {
    return this.rollup.read.getEpochDuration();
  }

  @memoize
  getSlotDuration() {
    return this.rollup.read.getSlotDuration();
  }

  @memoize
  getTargetCommitteeSize() {
    return this.rollup.read.getTargetCommitteeSize();
  }

  @memoize
  getMinimumStake() {
    return this.rollup.read.getMinimumStake();
  }

  public async getSlashingProposerAddress() {
    const slasherAddress = await this.rollup.read.getSlasher();
    const slasher = getContract({
      address: getAddress(slasherAddress.toString()),
      abi: SlasherAbi,
      client: this.client,
    });
    return EthAddress.fromString(await slasher.read.PROPOSER());
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

  getProposerAt(timestamp: bigint) {
    return this.rollup.read.getProposerAt([timestamp]);
  }

  getBlock(blockNumber: bigint) {
    return this.rollup.read.getBlock([blockNumber]);
  }

  getTips() {
    return this.rollup.read.getTips();
  }

  getTimestampForSlot(slot: bigint) {
    return this.rollup.read.getTimestampForSlot([slot]);
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
        this.rollup.read.getStakingAsset(),
      ] as const)
    ).map(EthAddress.fromString);

    return {
      rollupAddress: EthAddress.fromString(this.address),
      inboxAddress,
      outboxAddress,
      feeJuicePortalAddress,
      feeJuiceAddress,
      stakingAssetAddress,
      rewardDistributorAddress,
    };
  }

  public async getEpochNumberForSlotNumber(slotNumber: bigint): Promise<bigint> {
    return await this.rollup.read.getEpochAtSlot([slotNumber]);
  }

  getEpochProofPublicInputs(
    args: readonly [
      bigint,
      bigint,
      readonly [
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
      ],
      readonly `0x${string}`[],
      `0x${string}`,
      `0x${string}`,
    ],
  ) {
    return this.rollup.read.getEpochProofPublicInputs(args);
  }

  public async getEpochToProve(): Promise<bigint | undefined> {
    try {
      return await this.rollup.read.getEpochToProve();
    } catch (err: unknown) {
      throw formatViemError(err);
    }
  }

  public async validateHeader(
    args: readonly [
      `0x${string}`,
      ViemSignature[],
      `0x${string}`,
      bigint,
      `0x${string}`,
      {
        ignoreDA: boolean;
        ignoreSignatures: boolean;
      },
    ],
    account: `0x${string}` | Account,
  ): Promise<void> {
    try {
      await this.rollup.read.validateHeader(args, { account });
    } catch (error: unknown) {
      throw formatViemError(error);
    }
  }

  /**
   * @notice  Calls `canProposeAtTime` with the time of the next Ethereum block and the sender address
   *
   * @dev     Throws if unable to propose
   *
   * @param archive - The archive that we expect to be current state
   * @return [slot, blockNumber] - If you can propose, the L2 slot number and L2 block number of the next Ethereum block,
   * @throws otherwise
   */
  public async canProposeAtNextEthBlock(
    archive: Buffer,
    account: `0x${string}` | Account,
    slotDuration: bigint | number,
  ): Promise<[bigint, bigint]> {
    if (typeof slotDuration === 'number') {
      slotDuration = BigInt(slotDuration);
    }
    const timeOfNextL1Slot = (await this.client.getBlock()).timestamp + slotDuration;
    try {
      const [slot, blockNumber] = await this.rollup.read.canProposeAtTime(
        [timeOfNextL1Slot, `0x${archive.toString('hex')}`],
        { account },
      );
      return [slot, blockNumber];
    } catch (err: unknown) {
      throw formatViemError(err);
    }
  }
}
