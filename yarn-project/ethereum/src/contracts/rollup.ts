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
import type { DeployL1ContractsReturnType } from '../deploy_l1_contracts.js';
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

export type ViemStateReference = {
  l1ToL2MessageTree: ViemAppendOnlyTreeSnapshot;
  partialStateReference: ViemPartialStateReference;
};

export type ViemPartialStateReference = {
  noteHashTree: ViemAppendOnlyTreeSnapshot;
  nullifierTree: ViemAppendOnlyTreeSnapshot;
  publicDataTree: ViemAppendOnlyTreeSnapshot;
};

export type ViemAppendOnlyTreeSnapshot = {
  root: `0x${string}`;
  nextAvailableLeafIndex: number;
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

  static getFromL1ContractsValues(deployL1ContractsValues: DeployL1ContractsReturnType) {
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
  getSlotDuration() {
    return this.rollup.read.getSlotDuration();
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
  getLagInEpochs() {
    return this.rollup.read.getLagInEpochs();
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
      slotDuration: Number(slotDuration),
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

  getBlockReward() {
    return this.rollup.read.getBlockReward();
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

  getCurrentEpoch() {
    return this.rollup.read.getCurrentEpoch();
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

  getBlock(blockNumber: bigint | number) {
    return this.rollup.read.getBlock([BigInt(blockNumber)]);
  }

  getTips() {
    return this.rollup.read.getTips();
  }

  getTimestampForSlot(slot: bigint) {
    return this.rollup.read.getTimestampForSlot([slot]);
  }

  getEntryQueueLength() {
    return this.rollup.read.getEntryQueueLength();
  }

  getAvailableValidatorFlushes() {
    return this.rollup.read.getAvailableValidatorFlushes();
  }

  getNextFlushableEpoch() {
    return this.rollup.read.getNextFlushableEpoch();
  }

  getCurrentEpochNumber(): Promise<bigint> {
    return this.rollup.read.getCurrentEpoch();
  }

  getEpochNumberForBlock(blockNumber: bigint) {
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

  public async getEpochNumberForSlotNumber(slotNumber: bigint): Promise<bigint> {
    return await this.rollup.read.getEpochAtSlot([slotNumber]);
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
   * @return [slot, blockNumber] - If you can propose, the L2 slot number and L2 block number of the next Ethereum block,
   * @throws otherwise
   */
  public async canProposeAtNextEthBlock(
    archive: Buffer,
    account: `0x${string}` | Account,
    slotDuration: bigint | number,
    opts: { forcePendingBlockNumber?: number } = {},
  ): Promise<{ slot: bigint; blockNumber: bigint; timeOfNextL1Slot: bigint }> {
    if (typeof slotDuration === 'number') {
      slotDuration = BigInt(slotDuration);
    }
    const latestBlock = await this.client.getBlock();
    const timeOfNextL1Slot = latestBlock.timestamp + slotDuration;
    const who = typeof account === 'string' ? account : account.address;

    try {
      const {
        result: [slot, blockNumber],
      } = await this.client.simulateContract({
        address: this.address,
        abi: RollupAbi,
        functionName: 'canProposeAtTime',
        args: [timeOfNextL1Slot, `0x${archive.toString('hex')}`, who],
        account,
        stateOverride: await this.makePendingBlockNumberOverride(opts.forcePendingBlockNumber),
      });

      return { slot, blockNumber, timeOfNextL1Slot };
    } catch (err: unknown) {
      throw formatViemError(err);
    }
  }

  /**
   * Returns a state override that sets the pending block number to the specified value. Useful for simulations.
   * Requires querying the current state of the contract to get the current proven block number, as they are both
   * stored in the same slot. If the argument is undefined, it returns an empty override.
   */
  public async makePendingBlockNumberOverride(forcePendingBlockNumber: number | undefined): Promise<StateOverride> {
    if (forcePendingBlockNumber === undefined) {
      return [];
    }
    const slot = RollupContract.stfStorageSlot;
    const currentValue = await this.client.getStorageAt({ address: this.address, slot });
    const currentProvenBlockNumber = currentValue ? hexToBigInt(currentValue) & ((1n << 128n) - 1n) : 0n;
    const newValue = (BigInt(forcePendingBlockNumber) << 128n) | currentProvenBlockNumber;
    return [
      {
        address: this.address,
        stateDiff: [{ slot, value: `0x${newValue.toString(16).padStart(64, '0')}` }],
      },
    ];
  }

  /** Creates a request to Rollup#invalidateBadAttestation to be simulated or sent */
  public buildInvalidateBadAttestationRequest(
    blockNumber: number,
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
          BigInt(blockNumber),
          attestationsAndSigners,
          committee.map(addr => addr.toString()),
          BigInt(invalidIndex),
        ],
      }),
    };
  }

  /** Creates a request to Rollup#invalidateInsufficientAttestations to be simulated or sent */
  public buildInvalidateInsufficientAttestationsRequest(
    blockNumber: number,
    attestationsAndSigners: ViemCommitteeAttestations,
    committee: EthAddress[],
  ): L1TxRequest {
    return {
      to: this.address,
      data: encodeFunctionData({
        abi: RollupAbi,
        functionName: 'invalidateInsufficientAttestations',
        args: [BigInt(blockNumber), attestationsAndSigners, committee.map(addr => addr.toString())],
      }),
    };
  }

  /** Calls getHasSubmitted directly. Returns whether the given prover has submitted a proof with the given length for the given epoch. */
  public getHasSubmittedProof(epochNumber: number, numberOfBlocksInEpoch: number, prover: Hex | EthAddress) {
    if (prover instanceof EthAddress) {
      prover = prover.toString();
    }
    return this.rollup.read.getHasSubmitted([BigInt(epochNumber), BigInt(numberOfBlocksInEpoch), prover]);
  }

  getManaBaseFeeAt(timestamp: bigint, inFeeAsset: boolean) {
    return this.rollup.read.getManaBaseFeeAt([timestamp, inFeeAsset]);
  }

  getSlotAt(timestamp: bigint) {
    return this.rollup.read.getSlotAt([timestamp]);
  }

  async status(blockNumber: bigint, options?: { blockNumber?: bigint }) {
    await checkBlockTag(options?.blockNumber, this.client);
    return this.rollup.read.status([blockNumber], options);
  }

  async canPruneAtTime(timestamp: bigint, options?: { blockNumber?: bigint }) {
    await checkBlockTag(options?.blockNumber, this.client);
    return this.rollup.read.canPruneAtTime([timestamp], options);
  }

  archive() {
    return this.rollup.read.archive();
  }

  archiveAt(blockNumber: bigint) {
    return this.rollup.read.archiveAt([blockNumber]);
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

  getBlobCommitmentsHash(blockNumber: bigint) {
    return this.rollup.read.getBlobCommitmentsHash([blockNumber]);
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

  public listenToBlockInvalidated(callback: (args: { blockNumber: bigint }) => unknown): WatchContractEventReturnType {
    return this.rollup.watchEvent.BlockInvalidated(
      {},
      {
        onLogs: logs => {
          for (const log of logs) {
            const args = log.args;
            if (args.blockNumber !== undefined) {
              callback({ blockNumber: args.blockNumber });
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
