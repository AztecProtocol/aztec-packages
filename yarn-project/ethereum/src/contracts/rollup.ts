import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemSignature } from '@aztec/foundation/eth-signature';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { RollupStorage } from '@aztec/l1-artifacts/RollupStorage';
import { SlasherAbi } from '@aztec/l1-artifacts/SlasherAbi';

import { type Account, type GetContractReturnType, type Hex, encodeFunctionData, getAddress, getContract } from 'viem';

import { getPublicClient } from '../client.js';
import type { DeployL1ContractsReturnType } from '../deploy_l1_contracts.js';
import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import type { L1ReaderConfig } from '../l1_reader.js';
import type { L1TxUtils } from '../l1_tx_utils.js';
import type { ViemClient } from '../types.js';
import { formatViemError } from '../utils.js';
import { SlashingProposerContract } from './slashing_proposer.js';
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

export class RollupContract {
  private readonly rollup: GetContractReturnType<typeof RollupAbi, ViemClient>;

  static get checkBlobStorageSlot(): bigint {
    const asString = RollupStorage.find(storage => storage.label === 'checkBlob')?.slot;
    if (asString === undefined) {
      throw new Error('checkBlobStorageSlot not found');
    }
    return BigInt(asString);
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
  getMinimumStake() {
    return this.rollup.read.getMinimumStake();
  }

  @memoize
  getDepositAmount() {
    return this.rollup.read.getDepositAmount();
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
    const block = await this.rollup.read.getBlock([0n]);
    return block.archive;
  }

  getSlasher() {
    return this.rollup.read.getSlasher();
  }

  public async getSlashingProposerAddress() {
    const slasherAddress = await this.getSlasher();
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
        if (e instanceof Error && e.message.includes('ValidatorSelection__InsufficientCommitteeSize')) {
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
        if (e instanceof Error && e.message.includes('ValidatorSelection__InsufficientCommitteeSize')) {
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
        functionName: 'validateHeader',
        args,
        account,
      });
    } catch (error: unknown) {
      throw formatViemError(error);
    }
  }

  /**
   * Packs an array of committee attestations into the format expected by the Solidity contract
   *
   * @param attestations - Array of committee attestations with addresses and signatures
   * @returns Packed attestations with bitmap and tightly packed signature/address data
   */
  static packAttestations(attestations: ViemCommitteeAttestation[]): ViemCommitteeAttestations {
    const length = attestations.length;

    // Calculate bitmap size (1 bit per attestation, rounded up to nearest byte)
    const bitmapSize = Math.ceil(length / 8);
    const signatureIndices = new Uint8Array(bitmapSize);

    // Calculate total data size needed
    let totalDataSize = 0;
    for (let i = 0; i < length; i++) {
      const signature = attestations[i].signature;
      // Check if signature is empty (v = 0)
      const isEmpty = signature.v === 0;

      if (!isEmpty) {
        totalDataSize += 65; // v (1) + r (32) + s (32)
      } else {
        totalDataSize += 20; // address only
      }
    }

    const signaturesOrAddresses = new Uint8Array(totalDataSize);
    let dataIndex = 0;

    // Pack the data
    for (let i = 0; i < length; i++) {
      const attestation = attestations[i];
      const signature = attestation.signature;

      // Check if signature is empty
      const isEmpty = signature.v === 0;

      if (!isEmpty) {
        // Set bit in bitmap (bit 7-0 in each byte, left to right)
        const byteIndex = Math.floor(i / 8);
        const bitIndex = 7 - (i % 8);
        signatureIndices[byteIndex] |= 1 << bitIndex;

        // Pack signature: v + r + s
        signaturesOrAddresses[dataIndex] = signature.v;
        dataIndex++;

        // Pack r (32 bytes)
        const rBytes = Buffer.from(signature.r.slice(2), 'hex');
        signaturesOrAddresses.set(rBytes, dataIndex);
        dataIndex += 32;

        // Pack s (32 bytes)
        const sBytes = Buffer.from(signature.s.slice(2), 'hex');
        signaturesOrAddresses.set(sBytes, dataIndex);
        dataIndex += 32;
      } else {
        // Pack address only (20 bytes)
        const addrBytes = Buffer.from(attestation.addr.slice(2), 'hex');
        signaturesOrAddresses.set(addrBytes, dataIndex);
        dataIndex += 20;
      }
    }

    return {
      signatureIndices: `0x${Buffer.from(signatureIndices).toString('hex')}`,
      signaturesOrAddresses: `0x${Buffer.from(signaturesOrAddresses).toString('hex')}`,
    };
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
  ): Promise<{ slot: bigint; blockNumber: bigint; timeOfNextL1Slot: bigint }> {
    if (typeof slotDuration === 'number') {
      slotDuration = BigInt(slotDuration);
    }
    const latestBlock = await this.client.getBlock();
    const timeOfNextL1Slot = latestBlock.timestamp + slotDuration;

    try {
      const {
        result: [slot, blockNumber],
      } = await this.client.simulateContract({
        address: this.address,
        abi: RollupAbi,
        functionName: 'canProposeAtTime',
        args: [timeOfNextL1Slot, `0x${archive.toString('hex')}`],
        account,
      });

      return { slot, blockNumber, timeOfNextL1Slot };
    } catch (err: unknown) {
      throw formatViemError(err);
    }
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

  getAttesters() {
    return this.rollup.read.getAttesters();
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
}
