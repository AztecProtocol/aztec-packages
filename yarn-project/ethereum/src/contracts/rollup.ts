import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemSignature } from '@aztec/foundation/eth-signature';
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
  proverId: `0x${string}`;
};

export type ViemHeader = {
  lastArchiveRoot: `0x${string}`;
  blockHeadersHash: `0x${string}`;
  contentCommitment: ViemContentCommitment;
  slotNumber: bigint;
  timestamp: bigint;
  coinbase: `0x${string}`;
  feeRecipient: `0x${string}`;
  gasFees: ViemGasFees;
  totalManaUsed: bigint;
};

export type ViemContentCommitment = {
  blobsHash: `0x${string}`;
  inHash: `0x${string}`;
  outHash: `0x${string}`;
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

export class RollupContract {
  private readonly rollup: GetContractReturnType<typeof RollupAbi, ViemClient>;

  private static cachedStfStorageSlot: Hex | undefined;

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

  getGSE() {
    return this.rollup.read.getGSE();
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
  getL1StartBlock() {
    return this.rollup.read.L1_BLOCK_AT_GENESIS();
  }

  @memoize
  getL1GenesisTime() {
    return this.rollup.read.getGenesisTime();
  }

  @memoize
  getProofSubmissionEpochs() {
    return this.rollup.read.getProofSubmissionEpochs();
  }

  @memoize
  getEpochDuration() {
    return this.rollup.read.getEpochDuration();
  }

  @memoize
  async getSlotDuration(): Promise<number> {
    return Number(await this.rollup.read.getSlotDuration());
  }

  @memoize
  getTargetCommitteeSize() {
    return this.rollup.read.getTargetCommitteeSize();
  }

  @memoize
  getEjectionThreshold() {
    return this.rollup.read.getEjectionThreshold();
  }

  @memoize
  getLocalEjectionThreshold() {
    return this.rollup.read.getLocalEjectionThreshold();
  }

  @memoize
  getLagInEpochsForValidatorSet() {
    return this.rollup.read.getLagInEpochsForValidatorSet();
  }

  @memoize
  getLagInEpochsForRandao() {
    return this.rollup.read.getLagInEpochsForRandao();
  }

  @memoize
  getActivationThreshold() {
    return this.rollup.read.getActivationThreshold();
  }

  @memoize
  getExitDelay() {
    return this.rollup.read.getExitDelay();
  }

  @memoize
  getManaTarget() {
    return this.rollup.read.getManaTarget();
  }

  @memoize
  getProvingCostPerMana() {
    return this.rollup.read.getProvingCostPerManaInEth();
  }

  @memoize
  getProvingCostPerManaInFeeAsset() {
    return this.rollup.read.getProvingCostPerManaInFeeAsset();
  }

  @memoize
  getManaLimit() {
    return this.rollup.read.getManaLimit();
  }

  @memoize
  getVersion() {
    return this.rollup.read.getVersion();
  }

  @memoize
  async getGenesisArchiveTreeRoot(): Promise<`0x${string}`> {
    return await this.rollup.read.archiveAt([0n]);
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
  }> {
    const [l1StartBlock, l1GenesisTime, slotDuration, epochDuration, proofSubmissionEpochs] = await Promise.all([
      this.getL1StartBlock(),
      this.getL1GenesisTime(),
      this.getSlotDuration(),
      this.getEpochDuration(),
      this.getProofSubmissionEpochs(),
    ]);
    return {
      l1StartBlock,
      l1GenesisTime,
      slotDuration,
      epochDuration: Number(epochDuration),
      proofSubmissionEpochs: Number(proofSubmissionEpochs),
    };
  }

  getSlasherAddress() {
    return this.rollup.read.getSlasher();
  }

  /**
   * Returns a SlasherContract instance for interacting with the slasher contract.
   */
  async getSlasherContract(): Promise<SlasherContract | undefined> {
    const slasherAddress = EthAddress.fromString(await this.getSlasherAddress());
    if (slasherAddress.isZero()) {
      return undefined;
    }
    return new SlasherContract(this.client, slasherAddress);
  }

  getOwner() {
    return this.rollup.read.owner();
  }

  getActiveAttesterCount() {
    return this.rollup.read.getActiveAttesterCount();
  }

  public async getSlashingProposerAddress() {
    const slasher = await this.getSlasherContract();
    if (!slasher) {
      return EthAddress.ZERO;
    }
    return await slasher.getProposer();
  }

  getCheckpointReward() {
    return this.rollup.read.getCheckpointReward();
  }

  async getCheckpointNumber(): Promise<CheckpointNumber> {
    return CheckpointNumber.fromBigInt(await this.rollup.read.getPendingCheckpointNumber());
  }

  async getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    return CheckpointNumber.fromBigInt(await this.rollup.read.getProvenCheckpointNumber());
  }

  async getSlotNumber(): Promise<SlotNumber> {
    return SlotNumber.fromBigInt(await this.rollup.read.getCurrentSlot());
  }

  getL1FeesAt(timestamp: bigint) {
    return this.rollup.read.getL1FeesAt([timestamp]);
  }

  getFeeAssetPerEth() {
    return this.rollup.read.getFeeAssetPerEth();
  }

  async getCommitteeAt(timestamp: bigint): Promise<readonly `0x${string}`[] | undefined> {
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

    return result;
  }

  getSampleSeedAt(timestamp: bigint) {
    return this.rollup.read.getSampleSeedAt([timestamp]);
  }

  getCurrentSampleSeed() {
    return this.rollup.read.getCurrentSampleSeed();
  }

  async getCurrentEpoch(): Promise<EpochNumber> {
    return EpochNumber.fromBigInt(await this.rollup.read.getCurrentEpoch());
  }

  async getCurrentEpochCommittee(): Promise<readonly `0x${string}`[] | undefined> {
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

    return result;
  }

  async getCurrentProposer() {
    const { result } = await this.client.simulateContract({
      address: this.address,
      abi: RollupAbi,
      functionName: 'getCurrentProposer',
      args: [],
    });

    return result;
  }

  async getProposerAt(timestamp: bigint) {
    const { result } = await this.client.simulateContract({
      address: this.address,
      abi: RollupAbi,
      functionName: 'getProposerAt',
      args: [timestamp],
    });

    return result;
  }

  getCheckpoint(checkpointNumber: CheckpointNumber) {
    return this.rollup.read.getCheckpoint([BigInt(checkpointNumber)]);
  }

  async getTips(): Promise<{ pending: CheckpointNumber; proven: CheckpointNumber }> {
    const { pending, proven } = await this.rollup.read.getTips();
    return {
      pending: CheckpointNumber.fromBigInt(pending),
      proven: CheckpointNumber.fromBigInt(proven),
    };
  }

  getTimestampForSlot(slot: SlotNumber) {
    return this.rollup.read.getTimestampForSlot([BigInt(slot)]);
  }

  getEntryQueueLength() {
    return this.rollup.read.getEntryQueueLength();
  }

  getAvailableValidatorFlushes() {
    return this.rollup.read.getAvailableValidatorFlushes();
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

  getEpochProofPublicInputs(
    args: readonly [bigint, bigint, EpochProofPublicInputArgs, readonly `0x${string}`[], `0x${string}`],
  ) {
    return this.rollup.read.getEpochProofPublicInputs(args);
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
  public async canProposeAtNextEthBlock(
    archive: Buffer,
    account: `0x${string}` | Account,
    slotDuration: number,
    opts: { forcePendingCheckpointNumber?: CheckpointNumber } = {},
  ): Promise<{ slot: SlotNumber; checkpointNumber: CheckpointNumber; timeOfNextL1Slot: bigint }> {
    const latestBlock = await this.client.getBlock();
    const timeOfNextL1Slot = latestBlock.timestamp + BigInt(slotDuration);
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

  getManaBaseFeeAt(timestamp: bigint, inFeeAsset: boolean) {
    return this.rollup.read.getManaBaseFeeAt([timestamp, inFeeAsset]);
  }

  async getSlotAt(timestamp: bigint): Promise<SlotNumber> {
    return SlotNumber.fromBigInt(await this.rollup.read.getSlotAt([timestamp]));
  }

  async status(checkpointNumber: CheckpointNumber, options?: { blockNumber?: bigint }) {
    await checkBlockTag(options?.blockNumber, this.client);
    return this.rollup.read.status([BigInt(checkpointNumber)], options);
  }

  async canPruneAtTime(timestamp: bigint, options?: { blockNumber?: bigint }) {
    await checkBlockTag(options?.blockNumber, this.client);
    return this.rollup.read.canPruneAtTime([timestamp], options);
  }

  archive() {
    return this.rollup.read.archive();
  }

  archiveAt(checkpointNumber: CheckpointNumber) {
    return this.rollup.read.archiveAt([BigInt(checkpointNumber)]);
  }

  getSequencerRewards(address: Hex | EthAddress) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    return this.rollup.read.getSequencerRewards([address]);
  }

  getSpecificProverRewardsForEpoch(epoch: bigint, prover: Hex | EthAddress) {
    if (prover instanceof EthAddress) {
      prover = prover.toString();
    }
    return this.rollup.read.getSpecificProverRewardsForEpoch([epoch, prover]);
  }

  async getAttesters() {
    const attesterSize = await this.getActiveAttesterCount();
    const gse = new GSEContract(this.client, await this.getGSE());
    const ts = (await this.client.getBlock()).timestamp;

    const indices = Array.from({ length: Number(attesterSize) }, (_, i) => BigInt(i));
    const chunks = chunk(indices, 1000);

    return (await Promise.all(chunks.map(chunk => gse.getAttestersFromIndicesAtTime(this.address, ts, chunk)))).flat();
  }

  getAttesterView(address: Hex | EthAddress) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    return this.rollup.read.getAttesterView([address]);
  }

  getStatus(address: Hex | EthAddress) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    return this.rollup.read.getStatus([address]);
  }

  getBlobCommitmentsHash(checkpointNumber: CheckpointNumber) {
    return this.rollup.read.getBlobCommitmentsHash([BigInt(checkpointNumber)]);
  }

  getCurrentBlobCommitmentsHash() {
    return this.rollup.read.getCurrentBlobCommitmentsHash();
  }

  getStakingAsset() {
    return this.rollup.read.getStakingAsset();
  }

  getRewardConfig() {
    return this.rollup.read.getRewardConfig();
  }

  setupEpoch(l1TxUtils: L1TxUtils) {
    return l1TxUtils.sendAndMonitorTransaction({
      to: this.address,
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
}
