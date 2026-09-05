import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemSignature } from '@aztec/foundation/eth-signature';
import { createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { getErrorCause } from '@aztec/foundation/types';
import { ErrorsAbi } from '@aztec/l1-artifacts/ErrorsAbi';
import { EscapeHatchAbi } from '@aztec/l1-artifacts/EscapeHatchAbi';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { RollupStorage } from '@aztec/l1-artifacts/RollupStorage';

import chunk from 'lodash.chunk';
import {
  type Account,
  ContractFunctionRevertedError,
  type GetContractReturnType,
  type Hex,
  type Log,
  RpcRequestError,
  type StateOverride,
  type WatchContractEventReturnType,
  decodeErrorResult,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getContract,
  hexToBigInt,
  keccak256,
} from 'viem';

import { getPublicClient } from '../client.js';
import type { DeployAztecL1ContractsReturnType } from '../deploy_aztec_l1_contracts.js';
import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import type { L1ReaderConfig } from '../l1_reader.js';
import type { L1TxRequest, L1TxUtils, ReadOnlyL1TxUtils } from '../l1_tx_utils/index.js';
import type { ViemClient } from '../types.js';
import { formatViemError, mergeAbis } from '../utils.js';
import { GSEContract } from './gse.js';
import type { L1EventLog } from './log.js';
import { SlasherContract } from './slasher_contract.js';
import { SlashingProposerContract } from './slashing_proposer.js';
import { checkBlockTag } from './utils.js';
import { type WatchContractEventOptions, watchContractEvent } from './watch_event.js';

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
  | 'gseAddress'
>;

export type EpochProofPublicInputArgs = {
  previousArchive: `0x${string}`;
  endArchive: `0x${string}`;
  outHash: `0x${string}`;
  /** Inbox rolling hash before the epoch's first checkpoint's messages. */
  previousInboxRollingHash: `0x${string}`;
  /** Inbox rolling hash after the epoch's last checkpoint's messages. */
  endInboxRollingHash: `0x${string}`;
  proverId: `0x${string}`;
};

export type ViemHeader = {
  lastArchiveRoot: `0x${string}`;
  blockHeadersHash: `0x${string}`;
  blobsHash: `0x${string}`;
  inboxRollingHash: `0x${string}`;
  outHash: `0x${string}`;
  slotNumber: bigint;
  timestamp: bigint;
  coinbase: `0x${string}`;
  feeRecipient: `0x${string}`;
  gasFees: ViemGasFees;
  totalManaUsed: bigint;
  accumulatedFees: bigint;
};

export type ViemGasFees = {
  feePerDaGas: bigint;
  feePerL2Gas: bigint;
};

/** Inputs of the Rollup's integrated header and Inbox preflight, mirroring the contract's `CheckpointPreflightArgs`. */
export type CheckpointPreflightArgs = {
  header: ViemHeader;
  attestations: ViemCommitteeAttestations;
  signers: `0x${string}`[];
  attestationsAndSignersSignature: ViemSignature;
  digest: `0x${string}`;
  blobsHash: `0x${string}`;
  flags: { ignoreDA: boolean };
  /** Cumulative Inbox message count the checkpoint consumed up to; must be a live bucket boundary. */
  expectedTotal: bigint;
  /** Checkpoint number the header was built on; the call derives the real parent and rejects any other. */
  expectedParentCheckpointNumber: bigint;
};

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

/**
 * Field offsets within the CompressedTempCheckpointLog struct in Solidity storage. The `SlotNumber`
 * word also packs the inbox consumption counts, which Solidity places in the same slot.
 */
export enum TempCheckpointLogField {
  HeaderHash = 0,
  BlobCommitmentsHash = 1,
  OutHash = 2,
  AttestationsHash = 3,
  PayloadDigest = 4,
  SlotNumber = 5,
  FeeHeader = 6,
  InboxRollingHash = 7,
}

/**
 * Field-level override input for `tempCheckpointLogs[checkpointNumber]`. Covers the fields the
 * `propose()` path actually reads back. `payloadDigest` is `Buffer32` because it carries an
 * arbitrary `bytes32` value rather than a BN254 scalar. `slotNumber` carries the uint32 portion
 * of the on-chain `CompressedSlot`.
 *
 * `slotNumber`, `inboxMsgTotal` and `inboxConsumedBucket` share a single storage word, so supplying
 * any one of them rewrites all three; the ones left out land as zero.
 */
export type TempCheckpointLogOverrideFields = {
  headerHash?: Fr;
  outHash?: Fr;
  payloadDigest?: Buffer32;
  slotNumber?: SlotNumber;
  /** Cumulative Inbox message count consumed as of this checkpoint. */
  inboxMsgTotal?: bigint;
  /** Inbox bucket sequence number this checkpoint's rolling hash corresponds to. */
  inboxConsumedBucket?: bigint;
  feeHeader?: FeeHeader;
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
  booster: EthAddress;
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

const INSUFFICIENT_VALIDATOR_SET_SIZE_ERROR = 'ValidatorSelection__InsufficientValidatorSetSize';

/** SlasherUpdated events are rare governance operations, so their watcher polls well below the client's interval. */
const SLASHER_UPDATED_POLLING_INTERVAL_MS = 60_000;

function isValidatorSelectionError(err: unknown, errorName: string): boolean {
  return (
    getErrorCause(err, ContractFunctionRevertedError)?.data?.errorName === errorName ||
    decodeRpcRequestErrorName(err) === errorName
  );
}

function decodeRpcRequestErrorName(err: unknown): string | undefined {
  const data = getErrorCause(err, RpcRequestError)?.data;
  if (!isHexString(data)) {
    return undefined;
  }

  try {
    return decodeErrorResult({ abi: RollupAbi, data }).errorName;
  } catch {
    return undefined;
  }
}

function isHexString(value: unknown): value is Hex {
  return typeof value === 'string' && value.startsWith('0x');
}

function requireUintFits(value: bigint, bits: number, name: string): bigint {
  if (value < 0n || value >= 1n << BigInt(bits)) {
    throw new Error(`${name} ${value} does not fit in uint${bits}`);
  }
  return value;
}

export class RollupContract {
  private readonly rollup: GetContractReturnType<typeof RollupAbi, ViemClient>;
  private readonly logger = createLogger('ethereum:rollup');

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
    const address = config.rollupAddress.toString();
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

  public async getSlashingProposer(): Promise<SlashingProposerContract | undefined> {
    const slasher = await this.getSlasherContract();
    if (!slasher) {
      return undefined;
    }

    const proposerAddress = await slasher.getProposer();
    if (proposerAddress.isZero()) {
      return undefined;
    }

    return new SlashingProposerContract(this.client, proposerAddress);
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

  @memoize
  getManaTarget(): Promise<bigint> {
    return this.rollup.read.getManaTarget();
  }

  @memoize
  getProvingCostPerMana(): Promise<bigint> {
    return this.rollup.read.getProvingCostPerManaInEth();
  }

  @memoize
  getProvingCostPerManaInFeeAsset(): Promise<bigint> {
    return this.rollup.read.getProvingCostPerManaInFeeAsset();
  }

  @memoize
  getManaLimit(): Promise<bigint> {
    return this.rollup.read.getManaLimit();
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
    return Fr.fromString(await this.rollup.read.getVkTreeRoot());
  }

  @memoize
  async getProtocolContractsHash(): Promise<Fr> {
    return Fr.fromString(await this.rollup.read.getProtocolContractsHash());
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
    } catch (err) {
      this.logger.warn('isEscapeHatchOpen failed (treating as closed); RPC or contract error may cause liveness risk', {
        epoch: Number(epoch),
        error: err,
      });
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

  async getActiveAttesterCount(options?: { blockNumber?: bigint }): Promise<number> {
    await checkBlockTag(options?.blockNumber, this.client);
    return Number(await this.rollup.read.getActiveAttesterCount(options));
  }

  /**
   * Number of attesters that were staked at the given (historical) L1 timestamp. This is the count that
   * validator-set sampling uses to decide whether an epoch gets a committee, and the historical counterpart
   * of {@link getActiveAttesterCount} (which reads at the latest L1 block).
   */
  async getAttesterCountAtTime(timestamp: bigint, options?: { blockNumber?: bigint }): Promise<number> {
    const gse = new GSEContract(this.client, await this.getGSE());
    return gse.getAttesterCountAtTime(this.address, timestamp, options);
  }

  public async getSlashingProposerAddress() {
    const slasher = await this.getSlasherContract();
    if (!slasher) {
      return EthAddress.ZERO;
    }
    return await slasher.getProposer();
  }

  getCheckpointReward(): Promise<bigint> {
    return this.rollup.read.getCheckpointReward();
  }

  async getCheckpointNumber(options?: { blockNumber?: bigint }): Promise<CheckpointNumber> {
    await checkBlockTag(options?.blockNumber, this.client);
    return CheckpointNumber.fromBigInt(await this.rollup.read.getPendingCheckpointNumber(options));
  }

  async getProvenCheckpointNumber(options?: { blockNumber?: bigint }): Promise<CheckpointNumber> {
    await checkBlockTag(options?.blockNumber, this.client);
    return CheckpointNumber.fromBigInt(await this.rollup.read.getProvenCheckpointNumber(options));
  }

  async getSlotNumber(options?: { blockNumber?: bigint }): Promise<SlotNumber> {
    await checkBlockTag(options?.blockNumber, this.client);
    return SlotNumber.fromBigInt(await this.rollup.read.getCurrentSlot(options));
  }

  async getL1FeesAt(timestamp: bigint, options?: { blockNumber?: bigint }): Promise<L1FeeData> {
    await checkBlockTag(options?.blockNumber, this.client);
    const result = await this.rollup.read.getL1FeesAt([timestamp], options);
    return {
      baseFee: result.baseFee,
      blobFee: result.blobFee,
    };
  }

  async getFeeHeader(checkpointNumber: bigint): Promise<FeeHeader> {
    const result = await this.rollup.read.getFeeHeader([checkpointNumber]);
    return {
      excessMana: result.excessMana,
      manaUsed: result.manaUsed,
      ethPerFeeAsset: result.ethPerFeeAsset,
      congestionCost: result.congestionCost,
      proverCost: result.proverCost,
    };
  }

  getEthPerFeeAsset(): Promise<bigint> {
    return this.rollup.read.getEthPerFeeAsset();
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
        if (isValidatorSelectionError(e, INSUFFICIENT_VALIDATOR_SET_SIZE_ERROR)) {
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
        if (isValidatorSelectionError(e, INSUFFICIENT_VALIDATOR_SET_SIZE_ERROR)) {
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

  async getCheckpoint(checkpointNumber: CheckpointNumber, options?: { blockNumber?: bigint }): Promise<CheckpointLog> {
    await checkBlockTag(options?.blockNumber, this.client);
    const result = await this.rollup.read.getCheckpoint([BigInt(checkpointNumber)], options);
    return {
      archive: Fr.fromString(result.archive),
      headerHash: Buffer32.fromString(result.headerHash),
      blobCommitmentsHash: Buffer32.fromString(result.blobCommitmentsHash),
      attestationsHash: Buffer32.fromString(result.attestationsHash),
      payloadDigest: Buffer32.fromString(result.payloadDigest),
      slotNumber: SlotNumber.fromBigInt(result.slotNumber),
      feeHeader: {
        excessMana: result.feeHeader.excessMana,
        manaUsed: result.feeHeader.manaUsed,
        ethPerFeeAsset: result.feeHeader.ethPerFeeAsset,
        congestionCost: result.feeHeader.congestionCost,
        proverCost: result.feeHeader.proverCost,
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

  /**
   * Returns the effective pending checkpoint, accounting for potential prunes.
   * When a prune can happen, the L1 contract uses the proven checkpoint instead of the pending one.
   * This mirrors the behavior of getEffectivePendingCheckpointNumber in STFLib.sol.
   * @param atTimestamp - The timestamp to evaluate pruneability at. Defaults to the current L1 block timestamp.
   * @param options - Optional L1 block number to pin the queries to.
   */
  getEffectivePendingCheckpoint(atTimestamp?: bigint, options?: { blockNumber?: bigint }) {
    return retry(
      async () => {
        const timestamp = atTimestamp ?? (await this.client.getBlock()).timestamp;
        const canPrune = await this.canPruneAtTime(timestamp, options);
        if (canPrune) {
          const provenCheckpointNumber = await this.getProvenCheckpointNumber(options);
          return await this.getCheckpoint(provenCheckpointNumber, options);
        }
        const pendingCheckpointNumber = await this.getCheckpointNumber(options);
        return await this.getCheckpoint(pendingCheckpointNumber, options);
      },
      'getting effective pending checkpoint',
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
      rewardDistributorAddress,
      feeJuiceAddress,
      stakingAssetAddress,
      gseAddress,
    ] = (
      await Promise.all([
        this.rollup.read.getInbox(),
        this.rollup.read.getOutbox(),
        this.rollup.read.getFeeAssetPortal(),
        this.rollup.read.getRewardDistributor(),
        this.rollup.read.getFeeAsset(),
        this.rollup.read.getStakingAsset(),
        this.rollup.read.getGSE(),
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
      gseAddress,
    };
  }

  public async getFeeJuicePortal() {
    return EthAddress.fromString(await this.rollup.read.getFeeAssetPortal());
  }

  public async getEpochNumberForSlotNumber(slotNumber: SlotNumber): Promise<EpochNumber> {
    return EpochNumber.fromBigInt(await this.rollup.read.getEpochAtSlot([BigInt(slotNumber)]));
  }

  async getEpochProofPublicInputs(
    args: readonly [bigint, bigint, EpochProofPublicInputArgs, readonly ViemHeader[], `0x${string}`],
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
   * Simulates `validateCheckpointHeaderAndInbox` at the intended execution time and state, and returns the Inbox
   * bucket sequence to submit to `propose` as `bucketHint`.
   *
   * The call derives the parent checkpoint from the simulated Rollup storage the way `propose` does (the proven tip if
   * the pending chain is prunable at `time`), so `stateOverrides` must describe the state the real transaction will
   * see: a pipelined parent, or the tips after a bundled invalidation. It runs over `eth_simulateV1` with a block time
   * override, the same transport as the header-only preflight, and throws a formatted error naming the contract
   * revert (`Rollup__UnexpectedParentCheckpoint`, `Rollup__InboxTotalNotAtBucketBoundary`,
   * `Inbox__NoBucketAtOrBeforeTotal`, or any header/Inbox consumption error `propose` raises) when the checkpoint is
   * not publishable in that context.
   * @param l1TxUtils - The simulation transport
   * @param args - The header validation inputs plus the consumed Inbox total and the expected parent
   * @param opts - The block timestamp to simulate at, the state overrides to apply, and the simulated sender
   */
  public async validateCheckpointHeaderAndInbox(
    l1TxUtils: Pick<ReadOnlyL1TxUtils, 'simulate'>,
    args: CheckpointPreflightArgs,
    opts: { time: bigint; stateOverrides?: StateOverride; from?: `0x${string}` },
  ): Promise<bigint> {
    const { result } = await l1TxUtils.simulate(
      {
        to: this.address,
        data: encodeFunctionData({ abi: RollupAbi, functionName: 'validateCheckpointHeaderAndInbox', args: [args] }),
        from: opts.from,
      },
      { time: opts.time },
      opts.stateOverrides ?? [],
      mergeAbis([RollupAbi, ErrorsAbi]),
    );
    return decodeFunctionResult({ abi: RollupAbi, functionName: 'validateCheckpointHeaderAndInbox', data: result });
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
    stateOverride: StateOverride = [],
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
        stateOverride,
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
   * Returns a state override that sets the pending and/or proven checkpoint numbers. Useful for simulations.
   * Both values share a single storage slot (pending in the upper 128 bits, proven in the lower 128 bits), so
   * a single combined override is emitted to avoid the second state-diff clobbering the first. The current live
   * value is read once to preserve any half not being overridden. Returns an empty override if neither is set.
   *
   * Throws if the resulting `proven > pending`, which would crash the simulation: `STFLib.canPruneAtTime` calls
   * `getEpochForCheckpoint(proven + 1)` whenever `pending != proven`, and that asserts `_n <= tips.pending`.
   */
  public async makeChainTipsOverride(override: {
    pending?: CheckpointNumber;
    proven?: CheckpointNumber;
  }): Promise<StateOverride> {
    if (override.pending === undefined && override.proven === undefined) {
      return [];
    }
    const slot = RollupContract.stfStorageSlot;
    const currentValue = await this.client.getStorageAt({ address: this.address, slot });
    const currentRaw = currentValue ? hexToBigInt(currentValue) : 0n;
    const currentPending = currentRaw >> 128n;
    const currentProven = currentRaw & ((1n << 128n) - 1n);
    const newPending = override.pending !== undefined ? BigInt(override.pending) : currentPending;
    const newProven = override.proven !== undefined ? BigInt(override.proven) : currentProven;
    if (newProven > newPending) {
      throw new Error(`Invalid chain tips override: proven (${newProven}) > pending (${newPending})`);
    }
    const newValue = (newPending << 128n) | newProven;
    return [
      {
        address: this.address,
        stateDiff: [{ slot, value: `0x${newValue.toString(16).padStart(64, '0')}` }],
      },
    ];
  }

  /**
   * Returns a state override that patches `tempCheckpointLogs[checkpointNumber]` with every field that
   * the L1 contract reads during `propose()` for the checkpoint that builds on top of it (proposer
   * pipelining simulation). Mirrors the writes done by `ProposeLib.addTempCheckpointLog`.
   *
   * `blobCommitmentsHash` and `attestationsHash` are intentionally not exposed here — the propose path
   * never asserts against them, so leaving them at storage zero is harmless.
   *
   * One diff entry is emitted per storage word touched, so words left out keep their on-chain values.
   * `slotNumber` and the two inbox consumption counts share a word: any of them rewrites all three.
   */
  public async makeTempCheckpointLogOverride(
    checkpointNumber: CheckpointNumber,
    fields: TempCheckpointLogOverrideFields,
  ): Promise<StateOverride> {
    const constants = await this.getRollupConstants();
    const slotAt = (field: TempCheckpointLogField) =>
      `0x${this.computeTempCheckpointLogStorageSlot(checkpointNumber, field, constants).toString(16).padStart(64, '0')}` as const;
    const word = (v: bigint) => `0x${v.toString(16).padStart(64, '0')}` as const;

    const stateDiff: { slot: `0x${string}`; value: `0x${string}` }[] = [];

    if (fields.headerHash) {
      stateDiff.push({ slot: slotAt(TempCheckpointLogField.HeaderHash), value: fields.headerHash.toString() });
    }
    if (fields.outHash) {
      stateDiff.push({ slot: slotAt(TempCheckpointLogField.OutHash), value: fields.outHash.toString() });
    }
    if (fields.payloadDigest) {
      stateDiff.push({
        slot: slotAt(TempCheckpointLogField.PayloadDigest),
        value: fields.payloadDigest.toString() as `0x${string}`,
      });
    }
    if (
      fields.slotNumber !== undefined ||
      fields.inboxMsgTotal !== undefined ||
      fields.inboxConsumedBucket !== undefined
    ) {
      // The L1 struct packs the slot number and the two inbox consumption counts into one word, so this
      // diff always writes all three. Widths are enforced here because the L1 writers cast through
      // SafeCast and revert on overflow; a malformed override must surface rather than silently truncate
      // into a neighbouring field.
      const slotNumber = requireUintFits(BigInt(fields.slotNumber ?? 0), 32, 'slotNumber');
      const inboxMsgTotal = requireUintFits(fields.inboxMsgTotal ?? 0n, 64, 'inboxMsgTotal');
      const inboxConsumedBucket = requireUintFits(fields.inboxConsumedBucket ?? 0n, 64, 'inboxConsumedBucket');
      stateDiff.push({
        slot: slotAt(TempCheckpointLogField.SlotNumber),
        value: word(slotNumber | (inboxMsgTotal << 32n) | (inboxConsumedBucket << 96n)),
      });
    }
    if (fields.feeHeader) {
      stateDiff.push({
        slot: slotAt(TempCheckpointLogField.FeeHeader),
        value: word(RollupContract.compressFeeHeader(fields.feeHeader)),
      });
    }

    if (stateDiff.length === 0) {
      return [];
    }
    return [{ address: this.address, stateDiff }];
  }

  /**
   * Returns a state override that sets archives[checkpointNumber] to the given archive value.
   * Used when simulating a canProposeAtTime call where the local archive differs from L1
   * (e.g. pipelining where the parent checkpoint hasn't landed on L1 yet).
   */
  public makeArchiveOverride(checkpointNumber: CheckpointNumber, archive: Fr): StateOverride {
    const archivesMappingBase = hexToBigInt(RollupContract.stfStorageSlot) + 1n;
    const archiveSlot = hexToBigInt(
      keccak256(
        encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }],
          [BigInt(checkpointNumber), archivesMappingBase],
        ),
      ),
    );
    return [
      {
        address: this.address,
        stateDiff: [
          {
            slot: `0x${archiveSlot.toString(16).padStart(64, '0')}`,
            value: archive.toString(),
          },
        ],
      },
    ];
  }

  /** Merges multiple StateOverride arrays, combining stateDiff entries for the same address. */
  public static mergeStateOverrides(...overrides: StateOverride[]): StateOverride {
    type StateDiffEntry = { slot: `0x${string}`; value: `0x${string}` };
    const byAddress = new Map<string, { address: `0x${string}`; balance?: bigint; stateDiff: StateDiffEntry[] }>();
    for (const override of overrides) {
      for (const entry of override) {
        const key = entry.address.toLowerCase();
        const existing = byAddress.get(key);
        if (existing) {
          existing.stateDiff.push(...(entry.stateDiff ?? []));
          if (entry.balance !== undefined) {
            existing.balance = entry.balance;
          }
        } else {
          byAddress.set(key, {
            address: entry.address,
            balance: entry.balance,
            stateDiff: [...(entry.stateDiff ?? [])],
          });
        }
      }
    }
    return [...byAddress.values()];
  }

  /** Compresses a FeeHeader into a uint256 matching FeeHeaderLib.compress() in FeeStructs.sol. */
  public static compressFeeHeader(feeHeader: FeeHeader): bigint {
    const MASK_48_BITS = (1n << 48n) - 1n;
    const MASK_64_BITS = (1n << 64n) - 1n;
    const MASK_63_BITS = (1n << 63n) - 1n;

    let value = BigInt(feeHeader.manaUsed) & ((1n << 32n) - 1n); // bits [0:31]
    value |= (feeHeader.excessMana < MASK_48_BITS ? feeHeader.excessMana : MASK_48_BITS) << 32n; // bits [32:79]
    value |= (BigInt(feeHeader.ethPerFeeAsset) & MASK_48_BITS) << 80n; // bits [80:127]
    value |= (feeHeader.congestionCost < MASK_64_BITS ? feeHeader.congestionCost : MASK_64_BITS) << 128n; // bits [128:191]
    value |= (feeHeader.proverCost < MASK_63_BITS ? feeHeader.proverCost : MASK_63_BITS) << 192n; // bits [192:254]
    value |= 1n << 255n; // preheat flag
    return value;
  }

  /** Computes the fee header for a child checkpoint given parent fee header and child data.
   *  Must stay in sync with Solidity FeeLib.sol (computeNewEthPerFeeAsset, clampedAdd). */
  public static computeChildFeeHeader(
    parentFeeHeader: FeeHeader,
    childManaUsed: bigint,
    feeAssetPriceModifier: bigint,
    manaTarget: bigint,
  ): FeeHeader {
    const MIN_ETH_PER_FEE_ASSET = 100n;
    const MAX_ETH_PER_FEE_ASSET = 100_000_000_000_000n; // 1e14, matches FeeLib.sol

    // excessMana = clampedAdd(parent.excessMana + parent.manaUsed, -manaTarget)
    const sum = parentFeeHeader.excessMana + parentFeeHeader.manaUsed;
    const excessMana = sum > manaTarget ? sum - manaTarget : 0n;

    // ethPerFeeAsset = computeNewEthPerFeeAsset(max(parent.ethPerFeeAsset, MIN), modifier)
    const parentPrice =
      parentFeeHeader.ethPerFeeAsset > MIN_ETH_PER_FEE_ASSET ? parentFeeHeader.ethPerFeeAsset : MIN_ETH_PER_FEE_ASSET;
    let newPrice: bigint;
    if (feeAssetPriceModifier >= 0n) {
      newPrice = (parentPrice * (10_000n + feeAssetPriceModifier)) / 10_000n;
    } else {
      const absMod = -feeAssetPriceModifier;
      newPrice = (parentPrice * (10_000n - absMod)) / 10_000n;
    }
    if (newPrice < MIN_ETH_PER_FEE_ASSET) {
      newPrice = MIN_ETH_PER_FEE_ASSET;
    }
    if (newPrice > MAX_ETH_PER_FEE_ASSET) {
      newPrice = MAX_ETH_PER_FEE_ASSET;
    }

    return {
      excessMana,
      manaUsed: childManaUsed,
      ethPerFeeAsset: newPrice,
      congestionCost: 0n,
      proverCost: 0n,
    };
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
  public getHasSubmittedProof(epochNumber: EpochNumber, numberOfCheckpointsInEpoch: number, prover: Hex | EthAddress) {
    if (prover instanceof EthAddress) {
      prover = prover.toString();
    }
    return this.rollup.read.getHasSubmitted([BigInt(epochNumber), BigInt(numberOfCheckpointsInEpoch), prover]);
  }

  getManaMinFeeAt(timestamp: bigint, inFeeAsset: boolean, stateOverride?: StateOverride): Promise<bigint> {
    return this.rollup.read.getManaMinFeeAt([timestamp, inFeeAsset], { stateOverride });
  }

  async getManaMinFeeComponentsAt(timestamp: bigint, inFeeAsset: boolean): Promise<ManaMinFeeComponents> {
    const result = await this.rollup.read.getManaMinFeeComponentsAt([timestamp, inFeeAsset]);
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

  getSequencerRewards(address: Hex | EthAddress): Promise<bigint> {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    return this.rollup.read.getSequencerRewards([address]);
  }

  getSpecificProverRewardsForEpoch(epoch: bigint, prover: Hex | EthAddress): Promise<bigint> {
    if (prover instanceof EthAddress) {
      prover = prover.toString();
    }
    return this.rollup.read.getSpecificProverRewardsForEpoch([epoch, prover]);
  }

  async getAttesters(timestamp?: bigint): Promise<EthAddress[]> {
    // Pin every read to a single L1 block so the attester count and the chunked index reads
    // observe a consistent set. Without this, the count and each chunk default to `latest` and
    // can straddle a block boundary (or reorg), yielding an inconsistent or truncated set.
    const block = await this.client.getBlock();
    const blockNumber = block.number ?? undefined;
    const ts = timestamp ?? block.timestamp;
    const attesterSize = await this.getActiveAttesterCount({ blockNumber });
    const gse = new GSEContract(this.client, await this.getGSE());
    const indices = Array.from({ length: attesterSize }, (_, i) => BigInt(i));
    const chunks = chunk(indices, 1000);

    const results = await Promise.all(
      chunks.map(chunk => gse.getAttestersFromIndicesAtTime(this.address, ts, chunk, { blockNumber })),
    );
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
    const result = await this.rollup.read.getRewardConfig();
    return {
      rewardDistributor: EthAddress.fromString(result.rewardDistributor),
      sequencerBps: BigInt(result.sequencerBps),
      booster: EthAddress.fromString(result.booster),
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

  /**
   * Watches for SlasherUpdated events. Events are delivered by polling `eth_getLogs`: a reorg may re-emit them and
   * removals are never reported, and events mined within roughly one polling interval of subscribing may be missed.
   * Slasher rotations are rare governance operations, so by default this polls much slower than the other watchers.
   */
  public listenToSlasherChanged(
    callback: (args: { oldSlasher: `0x${string}`; newSlasher: `0x${string}` }) => unknown,
    options?: WatchContractEventOptions,
  ): WatchContractEventReturnType {
    return watchContractEvent(
      this.client,
      this.logger,
      {
        address: this.address,
        abi: RollupAbi,
        eventName: 'SlasherUpdated',
        onLog: log => {
          const { oldSlasher, newSlasher } = log.args;
          if (oldSlasher && newSlasher) {
            return callback({ oldSlasher, newSlasher });
          }
        },
      },
      { pollingIntervalMs: SLASHER_UPDATED_POLLING_INTERVAL_MS, ...options },
    );
  }

  /**
   * Watches for CheckpointInvalidated events. Events are delivered by polling `eth_getLogs`: a reorg may re-emit
   * them and removals are never reported, and events mined within roughly one polling interval of subscribing may
   * be missed.
   */
  public listenToCheckpointInvalidated(
    callback: (args: { checkpointNumber: CheckpointNumber; event: Log }) => unknown,
    options?: WatchContractEventOptions,
  ): WatchContractEventReturnType {
    return watchContractEvent(
      this.client,
      this.logger,
      {
        address: this.address,
        abi: RollupAbi,
        eventName: 'CheckpointInvalidated',
        onLog: log => {
          const { checkpointNumber } = log.args;
          if (checkpointNumber !== undefined) {
            return callback({ checkpointNumber: CheckpointNumber.fromBigInt(checkpointNumber), event: log });
          }
        },
      },
      options,
    );
  }

  public async getSlashEvents(l1BlockHash: Hex): Promise<{ amount: bigint; attester: EthAddress }[]> {
    const events = await this.rollup.getEvents.Slashed({}, { blockHash: l1BlockHash, strict: true });
    return events.map(event => ({
      amount: event.args.amount!,
      attester: EthAddress.fromString(event.args.attester!),
    }));
  }

  /**
   * Watches for Slashed events. Events are delivered by polling `eth_getLogs`: a reorg may re-emit them and
   * removals are never reported, and events mined within roughly one polling interval of subscribing may be missed.
   */
  public listenToSlash(
    callback: (args: { amount: bigint; attester: EthAddress }) => unknown,
    options?: WatchContractEventOptions,
  ): WatchContractEventReturnType {
    return watchContractEvent(
      this.client,
      this.logger,
      {
        address: this.address,
        abi: RollupAbi,
        eventName: 'Slashed',
        strict: true,
        onLog: log => callback({ amount: log.args.amount, attester: EthAddress.fromString(log.args.attester) }),
      },
      options,
    );
  }

  /**
   * Fetches OwnershipTransferred events emitted on the L1 block this rollup was deployed on.
   * The Rollup inherits from Ownable and emits this event in its constructor, so the event
   * is guaranteed to exist on `l1StartBlock` for any correctly deployed rollup. Used as a
   * probe to detect RPC nodes that prune historical logs.
   */
  async getOwnershipTransferredEventsAtDeploy() {
    const l1StartBlock = await this.getL1StartBlock();
    return await this.rollup.getEvents.OwnershipTransferred({}, { fromBlock: l1StartBlock, toBlock: l1StartBlock });
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

  /** Packs pending and proven checkpoint numbers into the chain tips storage format. */
  static packChainTips(pendingCheckpointNumber: bigint, provenCheckpointNumber: bigint): bigint {
    return (pendingCheckpointNumber << 128n) | (provenCheckpointNumber & ((1n << 128n) - 1n));
  }

  /** Storage slot for the chain tips (offset 0 within the STF storage struct). */
  static get chainTipsStorageSlot(): bigint {
    return BigInt(RollupContract.stfStorageSlot);
  }

  /**
   * Computes the storage slot for a field within a tempCheckpointLog entry.
   * @param checkpointNumber - The checkpoint number
   * @param field - The field within the CompressedTempCheckpointLog struct
   */
  async getTempCheckpointLogStorageSlot(
    checkpointNumber: CheckpointNumber,
    field: TempCheckpointLogField,
  ): Promise<bigint> {
    const [epochDuration, proofSubmissionEpochs] = await Promise.all([
      this.getEpochDuration(),
      this.getProofSubmissionEpochs(),
    ]);
    return this.computeTempCheckpointLogStorageSlot(checkpointNumber, field, { epochDuration, proofSubmissionEpochs });
  }

  private computeTempCheckpointLogStorageSlot(
    checkpointNumber: CheckpointNumber,
    field: TempCheckpointLogField,
    constants: { epochDuration: number; proofSubmissionEpochs: number },
  ): bigint {
    const fieldOffset = BigInt(field);
    const { epochDuration, proofSubmissionEpochs } = constants;
    const roundaboutSize = BigInt(epochDuration) * (BigInt(proofSubmissionEpochs) + 1n) + 1n;
    const tempCheckpointLogsBase = BigInt(RollupContract.stfStorageSlot) + 2n;
    const circularIndex = BigInt(checkpointNumber) % roundaboutSize;
    const entryBase = BigInt(
      keccak256(
        encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [circularIndex, tempCheckpointLogsBase]),
      ),
    );
    return entryBase + fieldOffset;
  }
}
