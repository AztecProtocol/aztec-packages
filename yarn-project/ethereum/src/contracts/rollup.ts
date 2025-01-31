import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemSignature } from '@aztec/foundation/eth-signature';
import { RollupAbi, SlasherAbi } from '@aztec/l1-artifacts';

import {
  type Account,
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  createPublicClient,
  getAddress,
  getContract,
  http,
} from 'viem';

import { createEthereumChain } from '../chain.js';
import { type DeployL1Contracts } from '../deploy_l1_contracts.js';
import { type L1ContractAddresses } from '../l1_contract_addresses.js';
import { type L1ReaderConfig } from '../l1_reader.js';
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

export type EpochProofQuoteViemArgs = {
  epochToProve: bigint;
  validUntilSlot: bigint;
  bondAmount: bigint;
  prover: `0x${string}`;
  basisPointFee: number;
};

export class RollupContract {
  private readonly rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>;

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

  constructor(public readonly client: PublicClient<HttpTransport, Chain>, address: Hex) {
    this.rollup = getContract({ address, abi: RollupAbi, client });
  }

  public get address() {
    return this.rollup.address;
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

  public async getSlashingProposerAddress() {
    const slasherAddress = await this.rollup.read.SLASHER();
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

  getProofCommitmentEscrow() {
    return this.rollup.read.PROOF_COMMITMENT_ESCROW();
  }

  getTips() {
    return this.rollup.read.getTips();
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
  public async getProofClaim() {
    const {
      epochToProve,
      basisPointFee,
      bondAmount,
      bondProvider: bondProviderHex,
      proposerClaimant: proposerClaimantHex,
    } = await this.rollup.read.getProofClaim();

    const bondProvider = EthAddress.fromString(bondProviderHex);
    const proposerClaimant = EthAddress.fromString(proposerClaimantHex);

    if (bondProvider.isZero() && proposerClaimant.isZero() && epochToProve === 0n) {
      return undefined;
    }

    return {
      epochToProve,
      basisPointFee,
      bondAmount,
      bondProvider,
      proposerClaimant,
    };
  }

  async getClaimableEpoch(): Promise<bigint | undefined> {
    try {
      return await this.rollup.read.getClaimableEpoch();
    } catch (err: unknown) {
      throw formatViemError(err);
    }
  }

  public async getEpochToProve(): Promise<bigint | undefined> {
    try {
      return await this.rollup.read.getEpochToProve();
    } catch (err: unknown) {
      throw formatViemError(err);
    }
  }

  public async validateProofQuote(
    quote: {
      quote: EpochProofQuoteViemArgs;
      signature: ViemSignature;
    },
    account: `0x${string}` | Account,
    slotDuration: bigint | number,
  ): Promise<void> {
    if (typeof slotDuration === 'number') {
      slotDuration = BigInt(slotDuration);
    }
    const timeOfNextL1Slot = BigInt((await this.client.getBlock()).timestamp + slotDuration);
    const args = [timeOfNextL1Slot, quote] as const;
    try {
      await this.rollup.read.validateEpochProofRightClaimAtTime(args, { account });
    } catch (err) {
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
