import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemSignature } from '@aztec/foundation/eth-signature';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { EconomicsAbi } from '@aztec/l1-artifacts/EconomicsAbi';
import { EscapeHatchAbi } from '@aztec/l1-artifacts/EscapeHatchAbi';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { RollupStorage } from '@aztec/l1-artifacts/RollupStorage';

import chunk from 'lodash.chunk';
import {
  type Account,
  type GetContractReturnType,
  type Hex,
  type StateOverride,
  type WatchContractEventReturnType,
  encodeFunctionData,
  getContract,
  hexToBigInt,
  keccak256,
} from 'viem';

import { getPublicClient } from '../client.js';
import type { DeployAztecL1ContractsReturnType } from '../deploy_aztec_l1_contracts.js';
import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import type { L1ReaderConfig } from '../l1_reader.js';
import type { L1TxRequest, L1TxUtils } from '../l1_tx_utils/index.js';
import type { ViemClient } from '../types.js';
import { formatViemError } from '../utils.js';
import { EmpireSlashingProposerContract } from './empire_slashing_proposer.js';
import { GSEContract } from './gse.js';
import type { L1EventLog } from './log.js';
import { SlasherContract } from './slasher_contract.js';
import { TallySlashingProposerContract } from './tally_slashing_proposer.js';
import { checkBlockTag } from './utils.js';

export type ViemCommitteeAttestation = {
  addr: `0x${string}`;
  signature: ViemSignature;
};

export type ViemCommitteeAttestations = {
  signatureIndices: `0x${string}`;
  signaturesOrAddresses: `0x${string}`;
};

export type L1RollupContractAddresses = Pick<
  L1ContractAddresses,
  | 'rollupAddress'
  | 'inboxAddress'
  | 'outboxAddress'
  | 'feeJuicePortalAddress'
  | 'feeJuiceAddress'
  | 'stakingAssetAddress'
  | 'rewardDistributorAddress'
  | 'slashFactoryAddress'
  | 'gseAddress'
>;

export type EpochProofPublicInputArgs = {
  previousArchive: `0x${string}`;
  endArchive: `0x${string}`;
  outHash: `0x${string}`;
  proverId: `0x${string}`;
};

export type ViemHeader = {
  lastArchiveRoot: `0x${string}`;
  blockHeadersHash: `0x${string}`;
  blobsHash: `0x${string}`;
  inHash: `0x${string}`;
  outHash: `0x${string}`;
  slotNumber: bigint;
  timestamp: bigint;
  coinbase: `0x${string}`;
  feeRecipient: `0x${string}`;
  gasFees: ViemGasFees;
  totalManaUsed: bigint;
};

export type ViemGasFees = {
  feePerDaGas: bigint;
  feePerL2Gas: bigint;
};

export enum SlashingProposerType {
  None = 0,
  Tally = 1,
  Empire = 2,
}

/**
 * Status of a validator/attester in the staking system.
 * Matches the Status enum in StakingLib.sol
 */
export enum AttesterStatus {
  NONE = 0,
  VALIDATING = 1,
  ZOMBIE = 2,
  EXITING = 3,
}

/**
 * Fee header data for a checkpoint
 */
export type FeeHeader = {
  excessMana: bigint;
  manaUsed: bigint;
  ethPerFeeAsset: bigint;
  congestionCost: bigint;
  proverCost: bigint;
};

/**
 * Checkpoint log data returned from the rollup contract
 */
export type CheckpointLog = {
  archive: Fr;
  headerHash: Buffer32;
  blobCommitmentsHash: Buffer32;
  attestationsHash: Buffer32;
  payloadDigest: Buffer32;
  slotNumber: SlotNumber;
  feeHeader: FeeHeader;
};

/**
 * L1 fee data (base fee and blob fee)
 */
export type L1FeeData = {
  baseFee: bigint;
  blobFee: bigint;
};

/** Components of the minimum fee per mana, as returned by the L1 rollup contract. */
export type ManaMinFeeComponents = {
  sequencerCost: bigint;
  proverCost: bigint;
  congestionCost: bigint;
  congestionMultiplier: bigint;
};

/**
 * Reward configuration for the rollup
 */
export type RewardConfig = {
  rewardDistributor: EthAddress;
  sequencerBps: bigint;
  checkpointReward: bigint;
};

/**
 * Exit information for a validator
 */
export type Exit = {
  withdrawalId: bigint;
  amount: bigint;
  exitableAt: bigint;
  recipientOrWithdrawer: EthAddress;
  isRecipient: boolean;
  exists: boolean;
};

/**
 * Attester configuration including public key and withdrawer
 */
export type AttesterConfig = {
  publicKey: {
    x: bigint;
    y: bigint;
  };
  withdrawer: EthAddress;
};

/**
 * Complete view of an attester's state
 */
export type AttesterView = {
  status: AttesterStatus;
  effectiveBalance: bigint;
  exit: Exit;
  config: AttesterConfig;
};

/**
 * Return for a status call
 */
export type RollupStatusResponse = {
  provenCheckpointNumber: CheckpointNumber;
  provenArchive: Fr;
  pendingCheckpointNumber: CheckpointNumber;
  pendingArchive: Fr;
  archiveOfMyCheckpoint: Fr;
};

/** Arguments for the CheckpointProposed event. */
export type CheckpointProposedArgs = {
  checkpointNumber: CheckpointNumber;
  archive: Fr;
  versionedBlobHashes: Buffer[];
  /** Hash of attestations emitted in the CheckpointProposed event. */
  attestationsHash: Buffer32;
  /** Digest of the payload emitted in the CheckpointProposed event. */
  payloadDigest: Buffer32;
};

/** Log type for CheckpointProposed events. */
export type CheckpointProposedLog = L1EventLog<CheckpointProposedArgs>;

export class RollupContract {
  private readonly rollup: GetContractReturnType<typeof RollupAbi, ViemClient>;

  private static cachedStfStorageSlot: Hex | undefined;
  private cachedEscapeHatch?: {
    address: EthAddress;
    contract: GetContractReturnType<typeof EscapeHatchAbi, ViemClient>;
  };

  static get checkBlobStorageSlot(): bigint {
    const asString = RollupStorage.find(storage => storage.label === 'checkBlob')?.slot;
    if (asString === undefined) {
      throw new Error('checkBlobStorageSlot not found');
    }
    return BigInt(asString);
  }

  static get stfStorageSlot(): Hex {
    return (RollupContract.cachedStfStorageSlot ??= keccak256(Buffer.from('aztec.stf.storage', 'utf-8')));
  }

  static getFromL1ContractsValues(deployL1ContractsValues: DeployAztecL1ContractsReturnType) {
    const {
      l1Client,
      l1ContractAddresses: { rollupAddress },
    } = deployL1ContractsValues;
    return new RollupContract(l1Client, rollupAddress.toString());
  }

  static getFromConfig(config: L1ReaderConfig) {
    const client = getPublicClient(config);
    const address = config.l1Contracts.rollupAddress.toString();
    return new RollupContract(client, address);
  }

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    this.rollup = getContract({ address, abi: RollupAbi, client });
  }

  async getGSE(): Promise<EthAddress> {
    return EthAddress.fromString(await this.rollup.read.getGSE());
  }

  public get address() {
    return this.rollup.address;
  }

  getContract(): GetContractReturnType<typeof RollupAbi, ViemClient> {
    return this.rollup;
  }

  public async getSlashingProposer(): Promise<
    EmpireSlashingProposerContract | TallySlashingProposerContract | undefined
  > {
    const slasher = await this.getSlasherContract();
    if (!slasher) {
      return undefined;
    }

    const proposerAddress = await slasher.getProposer();
    const proposerAbi = [
      {
        type: 'function',
        name: 'SLASHING_PROPOSER_TYPE',
        inputs: [],
        outputs: [{ name: '', type: 'uint8', internalType: 'enum SlasherFlavor' }],
        stateMutability: 'view',
      },
    ] as const;

    const proposer = getContract({ address: proposerAddress.toString(), abi: proposerAbi, client: this.client });
    const proposerType = await proposer.read.SLASHING_PROPOSER_TYPE();
    if (proposerType === SlashingProposerType.Tally.valueOf()) {
      return new TallySlashingProposerContract(this.client, proposerAddress);
    } else if (proposerType === SlashingProposerType.Empire.valueOf()) {
      return new EmpireSlashingProposerContract(this.client, proposerAddress);
    } else {
      throw new Error(`Unknown slashing proposer type: ${proposerType}`);
    }
  }

  @memoize
  getL1StartBlock(): Promise<bigint> {
    return this.rollup.read.L1_BLOCK_AT_GENESIS();
  }

  @memoize
  getL1GenesisTime(): Promise<bigint> {
    return this.rollup.read.getGenesisTime();
  }

  @memoize
  async getProofSubmissionEpochs(): Promise<number> {
    return Number(await this.rollup.read.getProofSubmissionEpochs());
  }

  @memoize
  async getEpochDuration(): Promise<number> {
    return Number(await this.rollup.read.getEpochDuration());
  }

  @memoize
  async getSlotDuration(): Promise<number> {
    return Number(await this.rollup.read.getSlotDuration());
  }

  @memoize
  async getTargetCommitteeSize(): Promise<number> {
    return Number(await this.rollup.read.getTargetCommitteeSize());
  }

  @memoize
  getEjectionThreshold(): Promise<bigint> {
    return this.rollup.read.getEjectionThreshold();
  }

  @memoize
  getLocalEjectionThreshold(): Promise<bigint> {
    return this.rollup.read.getLocalEjectionThreshold();
  }

  @memoize
  async getLagInEpochsForValidatorSet(): Promise<number> {
    return Number(await this.rollup.read.getLagInEpochsForValidatorSet());
  }

  @memoize
  async getLagInEpochsForRandao(): Promise<number> {
    return Number(await this.rollup.read.getLagInEpochsForRandao());
  }

  @memoize
  getActivationThreshold(): Promise<bigint> {
    return this.rollup.read.getActivationThreshold();
  }

  @memoize
  async getExitDelay(): Promise<number> {
    return Number(await this.rollup.read.getExitDelay());
  }

  async getManaTarget(): Promise<bigint> {
    const economics = await this.getCurrentEconomics();
    return (await economics.read.getFeeConfig()).manaTarget;
  }

  async getProvingCostPerMana(): Promise<bigint> {
    const economics = await this.getCurrentEconomics();
    return (await economics.read.getFeeConfig()).provingCostPerMana;
  }

  async getProvingCostPerManaInFeeAsset(): Promise<bigint> {
    const timestamp = BigInt((await this.client.getBlock()).timestamp);
    const checkpointOfInterest = await this.getCheckpointOfInterest(timestamp);
    return (await this.getEconomicsAt(timestamp)).read.getProvingCostPerManaInFeeAsset([checkpointOfInterest]);
  }

  async getManaLimit(): Promise<bigint> {
    return (await this.getCurrentEconomics()).read.getManaLimit();
  }

  @memoize
  getVersion(): Promise<bigint> {
    return this.rollup.read.getVersion();
  }

  @memoize
  async getGenesisArchiveTreeRoot(): Promise<Fr> {
    return Fr.fromString(await this.rollup.read.archiveAt([0n]));
  }

  @memoize
  async getVkTreeRoot(): Promise<Fr> {
    const slot = BigInt(RollupContract.stfStorageSlot) + 4n;
    const value = await this.client.getStorageAt({ address: this.address, slot: `0x${slot.toString(16)}` });
    return Fr.fromString(value ?? '0x0');
  }

  @memoize
  async getProtocolContractsHash(): Promise<Fr> {
    const slot = BigInt(RollupContract.stfStorageSlot) + 5n;
    const value = await this.client.getStorageAt({ address: this.address, slot: `0x${slot.toString(16)}` });
    return Fr.fromString(value ?? '0x0');
  }

  /**
   * Returns rollup constants used for epoch queries.
   * Return type is `L1RollupConstants` which is defined in stdlib,
   * so we cant reference it until we move this contract to that package.
   */
  @memoize
  public async getRollupConstants(): Promise<{
    l1StartBlock: bigint;
    l1GenesisTime: bigint;
    slotDuration: number;
    epochDuration: number;
    proofSubmissionEpochs: number;
    targetCommitteeSize: number;
    rollupManaLimit: number;
  }> {
    const [
      l1StartBlock,
      l1GenesisTime,
      slotDuration,
      epochDuration,
      proofSubmissionEpochs,
      targetCommitteeSize,
      rollupManaLimit,
    ] = await Promise.all([
      this.getL1StartBlock(),
      this.getL1GenesisTime(),
      this.getSlotDuration(),
      this.getEpochDuration(),
      this.getProofSubmissionEpochs(),
      this.getTargetCommitteeSize(),
      this.getManaLimit(),
    ]);
    return {
      l1StartBlock,
      l1GenesisTime,
      slotDuration,
      epochDuration: Number(epochDuration),
      proofSubmissionEpochs: Number(proofSubmissionEpochs),
      targetCommitteeSize,
      rollupManaLimit: Number(rollupManaLimit),
    };
  }

  async getSlasherAddress(): Promise<EthAddress> {
    return EthAddress.fromString(await this.rollup.read.getSlasher());
  }

  /**
   * Returns the configured escape hatch contract address, or zero if disabled.
   */
  async getEscapeHatchAddress(): Promise<EthAddress> {
    return EthAddress.fromString(await this.rollup.read.getEscapeHatch());
  }

  private async getEscapeHatchContract(): Promise<
    GetContractReturnType<typeof EscapeHatchAbi, ViemClient> | undefined
  > {
    const escapeHatchAddress = await this.getEscapeHatchAddress();
    if (escapeHatchAddress.isZero()) {
      return undefined;
    }

    // Cache the viem contract wrapper since it will be used frequently.
    if (!this.cachedEscapeHatch || !this.cachedEscapeHatch.address.equals(escapeHatchAddress)) {
      this.cachedEscapeHatch = {
        address: escapeHatchAddress,
        contract: getContract({
          address: escapeHatchAddress.toString(),
          abi: EscapeHatchAbi,
          client: this.client,
        }),
      };
    }

    return this.cachedEscapeHatch.contract;
  }

  /**
   * Returns whether the escape hatch is open for the given epoch.
   * If escape hatch is not configured, returns false.
   *
   * This function is intentionally defensive: any failure to query the escape hatch
   * (RPC issues, transient errors, etc.) is treated as "closed" to avoid callers
   * needing to sprinkle try/catch everywhere.
   */
  async isEscapeHatchOpen(epoch: EpochNumber): Promise<boolean> {
    try {
      const escapeHatch = await this.getEscapeHatchContract();
      if (!escapeHatch) {
        return false;
      }

      const [isOpen] = await escapeHatch.read.isHatchOpen([BigInt(epoch)]);
      return isOpen;
    } catch {
      return false;
    }
  }

  /**
   * Returns a SlasherContract instance for interacting with the slasher contract.
   */
  async getSlasherContract(): Promise<SlasherContract | undefined> {
    const slasherAddress = await this.getSlasherAddress();
    if (slasherAddress.isZero()) {
      return undefined;
    }
    return new SlasherContract(this.client, slasherAddress);
  }

  async getOwner(): Promise<EthAddress> {
    return EthAddress.fromString(await this.rollup.read.owner());
  }

  async getActiveAttesterCount(): Promise<number> {
    return Number(await this.rollup.read.getActiveAttesterCount());
  }

  public async getSlashingProposerAddress() {
    const slasher = await this.getSlasherContract();
    if (!slasher) {
      return EthAddress.ZERO;
    }
    return await slasher.getProposer();
  }

  async getCheckpointReward(): Promise<bigint> {
    return (await this.getRewardConfig()).checkpointReward;
  }

  async getCheckpointNumber(): Promise<CheckpointNumber> {
    return CheckpointNumber.fromBigInt(await this.rollup.read.getPendingCheckpointNumber());
  }

  async getProvenCheckpointNumber(options?: { blockNumber?: bigint }): Promise<CheckpointNumber> {
    await checkBlockTag(options?.blockNumber, this.client);
    return CheckpointNumber.fromBigInt(await this.rollup.read.getProvenCheckpointNumber(options));
  }

  async getSlotNumber(): Promise<SlotNumber> {
    return SlotNumber.fromBigInt(await this.rollup.read.getCurrentSlot());
  }

  async getL1FeesAt(timestamp: bigint): Promise<L1FeeData> {
    const result = await (await this.getEconomicsAt(timestamp)).read.getL1FeesAt([timestamp]);
    return {
      baseFee: result.baseFee,
      blobFee: result.blobFee,
    };
  }

  async getEthPerFeeAsset(): Promise<bigint> {
    const timestamp = BigInt((await this.client.getBlock()).timestamp);
    const checkpointOfInterest = await this.getCheckpointOfInterest(timestamp);
    return (await this.getEconomicsAt(timestamp)).read.getEthPerFeeAsset([checkpointOfInterest]);
  }

  private async getCurrentEconomics() {
    return this.getEconomicsForEpoch(await this.rollup.read.getCurrentEpoch());
  }

  private async getEconomicsAt(timestamp: bigint) {
    return getContract({
      address: await this.getEconomicsAddressAt(timestamp),
      abi: EconomicsAbi,
      client: this.client,
    });
  }

  private async getEconomicsForEpoch(epoch: bigint) {
    return getContract({
      address: await this.rollup.read.getEconomicsForEpoch([epoch]),
      abi: EconomicsAbi,
      client: this.client,
    });
  }

  private async getEconomicsAddressAt(timestamp: bigint) {
    const epoch = await this.rollup.read.getEpochAt([timestamp]);
    return this.rollup.read.getEconomicsForEpoch([epoch]);
  }

  private async getCheckpointOfInterest(timestamp: bigint): Promise<bigint> {
    const shouldPrune = await this.rollup.read.canPruneAtTime([timestamp]);
    return shouldPrune ? this.rollup.read.getProvenCheckpointNumber() : this.rollup.read.getPendingCheckpointNumber();
  }

  async getCommitteeAt(timestamp: bigint): Promise<EthAddress[] | undefined> {
    const { result } = await this.client
      .simulateContract({
        address: this.address,
        abi: RollupAbi,
        functionName: 'getCommitteeAt',
        args: [timestamp],
      })
      .catch(e => {
        if (e instanceof Error && e.message.includes('ValidatorSelection__InsufficientValidatorSetSize')) {
          return { result: undefined };
        }
        throw e;
      });

    return result ? result.map(addr => EthAddress.fromString(addr)) : undefined;
  }

  async getSampleSeedAt(timestamp: bigint): Promise<Buffer32> {
    return Buffer32.fromBigInt(await this.rollup.read.getSampleSeedAt([timestamp]));
  }

  async getCurrentSampleSeed(): Promise<Buffer32> {
    return Buffer32.fromBigInt(await this.rollup.read.getCurrentSampleSeed());
  }

  async getCurrentEpoch(): Promise<EpochNumber> {
    return EpochNumber.fromBigInt(await this.rollup.read.getCurrentEpoch());
  }

  async getCurrentEpochCommittee(): Promise<EthAddress[] | undefined> {
    const { result } = await this.client
      .simulateContract({
        address: this.address,
        abi: RollupAbi,
        functionName: 'getCurrentEpochCommittee',
        args: [],
      })
      .catch(e => {
        if (e instanceof Error && e.message.includes('ValidatorSelection__InsufficientValidatorSetSize')) {
          return { result: undefined };
        }
        throw e;
      });

    return result ? result.map(addr => EthAddress.fromString(addr)) : undefined;
  }

  async getCurrentProposer(): Promise<EthAddress> {
    const { result } = await this.client.simulateContract({
      address: this.address,
      abi: RollupAbi,
      functionName: 'getCurrentProposer',
      args: [],
    });

    return EthAddress.fromString(result);
  }

  async getProposerAt(timestamp: bigint): Promise<EthAddress> {
    const { result } = await this.client.simulateContract({
      address: this.address,
      abi: RollupAbi,
      functionName: 'getProposerAt',
      args: [timestamp],
    });

    return EthAddress.fromString(result);
  }

  async getCheckpoint(checkpointNumber: CheckpointNumber): Promise<CheckpointLog> {
    const checkpoint = BigInt(checkpointNumber);
    const [result, epoch] = await Promise.all([
      this.rollup.read.getCheckpoint([checkpoint]),
      this.rollup.read.getEpochForCheckpoint([checkpoint]),
    ]);
    const economics = await this.getEconomicsForEpoch(epoch);
    const feeHeader =
      checkpoint === 0n
        ? {
            excessMana: 0n,
            manaUsed: 0n,
            ethPerFeeAsset: await economics.read.getEthPerFeeAsset([0n]),
            congestionCost: 0n,
            proverCost: 0n,
          }
        : await economics.read.getFeeHeader([checkpoint]);

    return {
      archive: Fr.fromString(result.archive),
      headerHash: Buffer32.fromString(result.headerHash),
      blobCommitmentsHash: Buffer32.fromString(result.blobCommitmentsHash),
      attestationsHash: Buffer32.fromString(result.attestationsHash),
      payloadDigest: Buffer32.fromString(result.payloadDigest),
      slotNumber: SlotNumber.fromBigInt(result.slotNumber),
      feeHeader: {
        excessMana: feeHeader.excessMana,
        manaUsed: feeHeader.manaUsed,
        ethPerFeeAsset: feeHeader.ethPerFeeAsset,
        congestionCost: feeHeader.congestionCost,
        proverCost: feeHeader.proverCost,
      },
    };
  }

  /** Returns the pending checkpoint from the rollup contract */
  getPendingCheckpoint() {
    // We retry because of race conditions during prunes: we may get a pending checkpoint number which is immediately
    // reorged out due to a prune happening, causing the subsequent getCheckpoint call to fail. So we try again in that case.
    return retry(
      async () => {
        const pendingCheckpointNumber = await this.getCheckpointNumber();
        const pendingCheckpoint = await this.getCheckpoint(pendingCheckpointNumber);
        return pendingCheckpoint;
      },
      'getting pending checkpoint',
      makeBackoff([0.5, 0.5, 0.5]),
    );
  }

  async getTips(): Promise<{ pending: CheckpointNumber; proven: CheckpointNumber }> {
    const { pending, proven } = await this.rollup.read.getTips();
    return {
      pending: CheckpointNumber.fromBigInt(pending),
      proven: CheckpointNumber.fromBigInt(proven),
    };
  }

  getTimestampForSlot(slot: SlotNumber): Promise<bigint> {
    return this.rollup.read.getTimestampForSlot([BigInt(slot)]);
  }

  async getEntryQueueLength(): Promise<number> {
    return Number(await this.rollup.read.getEntryQueueLength());
  }

  async getAvailableValidatorFlushes(): Promise<number> {
    return Number(await this.rollup.read.getAvailableValidatorFlushes());
  }

  async getNextFlushableEpoch(): Promise<EpochNumber> {
    return EpochNumber.fromBigInt(await this.rollup.read.getNextFlushableEpoch());
  }

  async getCurrentEpochNumber(): Promise<EpochNumber> {
    return EpochNumber.fromBigInt(await this.rollup.read.getCurrentEpoch());
  }

  async getEpochNumberForCheckpoint(checkpointNumber: CheckpointNumber): Promise<EpochNumber> {
    return EpochNumber.fromBigInt(await this.rollup.read.getEpochForCheckpoint([BigInt(checkpointNumber)]));
  }

  async getRollupAddresses(): Promise<L1RollupContractAddresses> {
    const [
      inboxAddress,
      outboxAddress,
      feeJuicePortalAddress,
      feeJuiceAddress,
      stakingAssetAddress,
      gseAddress,
      rewardConfig,
    ] = await Promise.all([
      this.rollup.read.getInbox(),
      this.rollup.read.getOutbox(),
      this.rollup.read.getFeeAssetPortal(),
      this.rollup.read.getFeeAsset(),
      this.rollup.read.getStakingAsset(),
      this.rollup.read.getGSE(),
      this.getRewardConfig(),
    ] as const);

    return {
      rollupAddress: EthAddress.fromString(this.address),
      inboxAddress: EthAddress.fromString(inboxAddress),
      outboxAddress: EthAddress.fromString(outboxAddress),
      feeJuicePortalAddress: EthAddress.fromString(feeJuicePortalAddress),
      feeJuiceAddress: EthAddress.fromString(feeJuiceAddress),
      stakingAssetAddress: EthAddress.fromString(stakingAssetAddress),
      rewardDistributorAddress: rewardConfig.rewardDistributor,
      gseAddress: EthAddress.fromString(gseAddress),
    };
  }

  public async getFeeJuicePortal() {
    return EthAddress.fromString(await this.rollup.read.getFeeAssetPortal());
  }

  public async getEpochNumberForSlotNumber(slotNumber: SlotNumber): Promise<EpochNumber> {
    return EpochNumber.fromBigInt(await this.rollup.read.getEpochAtSlot([BigInt(slotNumber)]));
  }

  async getEpochProofPublicInputs(
    args: readonly [bigint, bigint, EpochProofPublicInputArgs, readonly `0x${string}`[], `0x${string}`],
  ): Promise<Fr[]> {
    const result = await this.rollup.read.getEpochProofPublicInputs(args);
    return result.map(Fr.fromString);
  }

  public async validateHeader(
    args: readonly [
      ViemHeader,
      ViemCommitteeAttestations,
      `0x${string}`[],
      ViemSignature,
      `0x${string}`,
      `0x${string}`,
      {
        ignoreDA: boolean;
        ignoreSignatures: boolean;
      },
    ],
    account: `0x${string}` | Account,
  ): Promise<void> {
    try {
      await this.client.simulateContract({
        address: this.address,
        abi: RollupAbi,
        functionName: 'validateHeaderWithAttestations',
        args,
        account,
      });
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
   * @return [slot, checkpointNumber, timeOfNextL1Slot] - If you can propose, the L2 slot number, checkpoint number and
   * timestamp of the next L1 block
   * @throws otherwise
   */
  public async canProposeAt(
    archive: Buffer,
    account: `0x${string}` | Account,
    timestamp: bigint,
    opts: { forcePendingCheckpointNumber?: CheckpointNumber } = {},
  ): Promise<{ slot: SlotNumber; checkpointNumber: CheckpointNumber; timeOfNextL1Slot: bigint }> {
    const timeOfNextL1Slot = timestamp;
    const who = typeof account === 'string' ? account : account.address;

    try {
      const {
        result: [slot, checkpointNumber],
      } = await this.client.simulateContract({
        address: this.address,
        abi: RollupAbi,
        functionName: 'canProposeAtTime',
        args: [timeOfNextL1Slot, `0x${archive.toString('hex')}`, who],
        account,
        stateOverride: await this.makePendingCheckpointNumberOverride(opts.forcePendingCheckpointNumber),
      });

      return {
        slot: SlotNumber.fromBigInt(slot),
        checkpointNumber: CheckpointNumber.fromBigInt(checkpointNumber),
        timeOfNextL1Slot,
      };
    } catch (err: unknown) {
      throw formatViemError(err);
    }
  }

  /**
   * Returns a state override that sets the pending checkpoint number to the specified value. Useful for simulations.
   * Requires querying the current state of the contract to get the current proven checkpoint number, as they are both
   * stored in the same slot. If the argument is undefined, it returns an empty override.
   */
  public async makePendingCheckpointNumberOverride(
    forcePendingCheckpointNumber: CheckpointNumber | undefined,
  ): Promise<StateOverride> {
    if (forcePendingCheckpointNumber === undefined) {
      return [];
    }
    const slot = RollupContract.stfStorageSlot;
    const currentValue = await this.client.getStorageAt({ address: this.address, slot });
    const currentProvenCheckpointNumber = currentValue ? hexToBigInt(currentValue) & ((1n << 128n) - 1n) : 0n;
    const newValue = (BigInt(forcePendingCheckpointNumber) << 128n) | currentProvenCheckpointNumber;
    return [
      {
        address: this.address,
        stateDiff: [{ slot, value: `0x${newValue.toString(16).padStart(64, '0')}` }],
      },
    ];
  }

  /** Creates a request to Rollup#invalidateBadAttestation to be simulated or sent */
  public buildInvalidateBadAttestationRequest(
    checkpointNumber: CheckpointNumber,
    attestationsAndSigners: ViemCommitteeAttestations,
    committee: EthAddress[],
    invalidIndex: number,
  ): L1TxRequest {
    return {
      to: this.address,
      abi: RollupAbi,
      data: encodeFunctionData({
        abi: RollupAbi,
        functionName: 'invalidateBadAttestation',
        args: [
          BigInt(checkpointNumber),
          attestationsAndSigners,
          committee.map(addr => addr.toString()),
          BigInt(invalidIndex),
        ],
      }),
    };
  }

  /** Creates a request to Rollup#invalidateInsufficientAttestations to be simulated or sent */
  public buildInvalidateInsufficientAttestationsRequest(
    checkpointNumber: CheckpointNumber,
    attestationsAndSigners: ViemCommitteeAttestations,
    committee: EthAddress[],
  ): L1TxRequest {
    return {
      to: this.address,
      abi: RollupAbi,
      data: encodeFunctionData({
        abi: RollupAbi,
        functionName: 'invalidateInsufficientAttestations',
        args: [BigInt(checkpointNumber), attestationsAndSigners, committee.map(addr => addr.toString())],
      }),
    };
  }

  /** Calls getHasSubmitted directly. Returns whether the given prover has submitted a proof with the given length for the given epoch. */
  public async getHasSubmittedProof(
    epochNumber: EpochNumber,
    numberOfCheckpointsInEpoch: number,
    prover: Hex | EthAddress,
  ) {
    if (prover instanceof EthAddress) {
      prover = prover.toString();
    }
    const economics = await this.getEconomicsForEpoch(BigInt(epochNumber));
    return economics.read.getHasSubmitted([BigInt(epochNumber), BigInt(numberOfCheckpointsInEpoch), prover]);
  }

  async getManaMinFeeAt(timestamp: bigint, inFeeAsset: boolean): Promise<bigint> {
    const checkpointOfInterest = await this.getCheckpointOfInterest(timestamp);
    const economics = await this.getEconomicsAt(timestamp);
    const parameters = await economics.read.getProposalFeeParameters([checkpointOfInterest, timestamp, inFeeAsset]);
    return parameters.manaMinFee;
  }

  async getManaMinFeeComponentsAt(timestamp: bigint, inFeeAsset: boolean): Promise<ManaMinFeeComponents> {
    const checkpointOfInterest = await this.getCheckpointOfInterest(timestamp);
    const economics = await this.getEconomicsAt(timestamp);
    const result = await economics.read.getManaMinFeeComponentsAt([checkpointOfInterest, timestamp, inFeeAsset]);
    return {
      sequencerCost: result.sequencerCost,
      proverCost: result.proverCost,
      congestionCost: result.congestionCost,
      congestionMultiplier: result.congestionMultiplier,
    };
  }

  async getSlotAt(timestamp: bigint): Promise<SlotNumber> {
    return SlotNumber.fromBigInt(await this.rollup.read.getSlotAt([timestamp]));
  }

  async status(checkpointNumber: CheckpointNumber, options?: { blockNumber?: bigint }): Promise<RollupStatusResponse> {
    await checkBlockTag(options?.blockNumber, this.client);
    const result = await this.rollup.read.status([BigInt(checkpointNumber)], options);
    return {
      provenCheckpointNumber: CheckpointNumber.fromBigInt(result[0]),
      provenArchive: Fr.fromString(result[1]),
      pendingCheckpointNumber: CheckpointNumber.fromBigInt(result[2]),
      pendingArchive: Fr.fromString(result[3]),
      archiveOfMyCheckpoint: Fr.fromString(result[4]),
    };
  }

  async canPruneAtTime(timestamp: bigint, options?: { blockNumber?: bigint }): Promise<boolean> {
    await checkBlockTag(options?.blockNumber, this.client);
    return this.rollup.read.canPruneAtTime([timestamp], options);
  }

  async archive(): Promise<Fr> {
    return Fr.fromString(await this.rollup.read.archive());
  }

  async archiveAt(checkpointNumber: CheckpointNumber): Promise<Fr> {
    return Fr.fromString(await this.rollup.read.archiveAt([BigInt(checkpointNumber)]));
  }

  async getSequencerRewards(address: Hex | EthAddress): Promise<bigint> {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    return (await this.getCurrentEconomics()).read.getSequencerRewards([address]);
  }

  async getSpecificProverRewardsForEpoch(epoch: bigint, prover: Hex | EthAddress): Promise<bigint> {
    if (prover instanceof EthAddress) {
      prover = prover.toString();
    }
    const economics = await this.getEconomicsForEpoch(epoch);
    return economics.read.getSpecificProverRewardsForEpoch([epoch, prover]);
  }

  async getAttesters(timestamp?: bigint): Promise<EthAddress[]> {
    const attesterSize = await this.getActiveAttesterCount();
    const gse = new GSEContract(this.client, await this.getGSE());
    const ts = timestamp ?? (await this.client.getBlock()).timestamp;
    const indices = Array.from({ length: attesterSize }, (_, i) => BigInt(i));
    const chunks = chunk(indices, 1000);

    const results = await Promise.all(chunks.map(chunk => gse.getAttestersFromIndicesAtTime(this.address, ts, chunk)));
    return results.flat().map(addr => EthAddress.fromString(addr));
  }

  async getAttesterView(address: Hex | EthAddress): Promise<AttesterView> {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    const result = await this.rollup.read.getAttesterView([address]);
    return {
      status: result.status as AttesterStatus,
      effectiveBalance: result.effectiveBalance,
      exit: {
        withdrawalId: result.exit.withdrawalId,
        amount: result.exit.amount,
        exitableAt: result.exit.exitableAt,
        recipientOrWithdrawer: EthAddress.fromString(result.exit.recipientOrWithdrawer),
        isRecipient: result.exit.isRecipient,
        exists: result.exit.exists,
      },
      config: {
        publicKey: {
          x: result.config.publicKey.x,
          y: result.config.publicKey.y,
        },
        withdrawer: EthAddress.fromString(result.config.withdrawer),
      },
    };
  }

  async getStatus(address: Hex | EthAddress): Promise<AttesterStatus> {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    return (await this.rollup.read.getStatus([address])) as AttesterStatus;
  }

  async getBlobCommitmentsHash(checkpointNumber: CheckpointNumber): Promise<Buffer32> {
    return Buffer32.fromString(await this.rollup.read.getBlobCommitmentsHash([BigInt(checkpointNumber)]));
  }

  async getCurrentBlobCommitmentsHash(): Promise<Buffer32> {
    return Buffer32.fromString(await this.rollup.read.getCurrentBlobCommitmentsHash());
  }

  async getStakingAsset(): Promise<EthAddress> {
    return EthAddress.fromString(await this.rollup.read.getStakingAsset());
  }

  async getRewardConfig(): Promise<RewardConfig> {
    const result = await (await this.getCurrentEconomics()).read.getRewardConfig();
    return {
      rewardDistributor: EthAddress.fromString(result.rewardDistributor),
      sequencerBps: BigInt(result.sequencerBps),
      checkpointReward: result.checkpointReward,
    };
  }

  setupEpoch(l1TxUtils: L1TxUtils) {
    return l1TxUtils.sendAndMonitorTransaction({
      to: this.address,
      abi: RollupAbi,
      data: encodeFunctionData({
        abi: RollupAbi,
        functionName: 'setupEpoch',
        args: [],
      }),
    });
  }

  vote(l1TxUtils: L1TxUtils, proposalId: bigint) {
    return l1TxUtils.sendAndMonitorTransaction({
      to: this.address,
      abi: RollupAbi,
      data: encodeFunctionData({
        abi: RollupAbi,
        functionName: 'vote',
        args: [proposalId],
      }),
    });
  }

  public listenToSlasherChanged(
    callback: (args: { oldSlasher: `0x${string}`; newSlasher: `0x${string}` }) => unknown,
  ): WatchContractEventReturnType {
    return this.rollup.watchEvent.SlasherUpdated(
      {},
      {
        onLogs: logs => {
          for (const log of logs) {
            const args = log.args;
            if (args.oldSlasher && args.newSlasher) {
              callback(args as { oldSlasher: `0x${string}`; newSlasher: `0x${string}` });
            }
          }
        },
      },
    );
  }

  public listenToCheckpointInvalidated(
    callback: (args: { checkpointNumber: CheckpointNumber }) => unknown,
  ): WatchContractEventReturnType {
    return this.rollup.watchEvent.CheckpointInvalidated(
      {},
      {
        onLogs: logs => {
          for (const log of logs) {
            const args = log.args;
            if (args.checkpointNumber !== undefined) {
              callback({ checkpointNumber: CheckpointNumber.fromBigInt(args.checkpointNumber) });
            }
          }
        },
      },
    );
  }

  public async getSlashEvents(l1BlockHash: Hex): Promise<{ amount: bigint; attester: EthAddress }[]> {
    const events = await this.rollup.getEvents.Slashed({}, { blockHash: l1BlockHash, strict: true });
    return events.map(event => ({
      amount: event.args.amount!,
      attester: EthAddress.fromString(event.args.attester!),
    }));
  }

  public listenToSlash(
    callback: (args: { amount: bigint; attester: EthAddress }) => unknown,
  ): WatchContractEventReturnType {
    return this.rollup.watchEvent.Slashed(
      {},
      {
        strict: true,
        onLogs: logs => {
          for (const log of logs) {
            const args = log.args;
            callback({ amount: args.amount!, attester: EthAddress.fromString(args.attester!) });
          }
        },
      },
    );
  }

  /** Fetches CheckpointProposed events within the given block range. */
  async getCheckpointProposedEvents(fromBlock: bigint, toBlock: bigint): Promise<CheckpointProposedLog[]> {
    const logs = await this.rollup.getEvents.CheckpointProposed({}, { fromBlock, toBlock });
    return logs
      .filter(log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock)
      .map(log => ({
        l1BlockNumber: log.blockNumber!,
        l1BlockHash: Buffer32.fromString(log.blockHash!),
        l1TransactionHash: log.transactionHash!,
        args: {
          checkpointNumber: CheckpointNumber.fromBigInt(log.args.checkpointNumber!),
          archive: Fr.fromString(log.args.archive!),
          versionedBlobHashes: log.args.versionedBlobHashes!.map(h => Buffer.from(h.slice(2), 'hex')),
          attestationsHash: (() => {
            if (!log.args.attestationsHash) {
              throw new Error(
                `CheckpointProposed event missing attestationsHash for checkpoint ${log.args.checkpointNumber}`,
              );
            }
            return Buffer32.fromString(log.args.attestationsHash);
          })(),
          payloadDigest: (() => {
            if (!log.args.payloadDigest) {
              throw new Error(
                `CheckpointProposed event missing payloadDigest for checkpoint ${log.args.checkpointNumber}`,
              );
            }
            return Buffer32.fromString(log.args.payloadDigest);
          })(),
        },
      }));
  }
}
