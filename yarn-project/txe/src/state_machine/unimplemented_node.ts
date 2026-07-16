import type { ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import type {
  BlockNumber,
  CheckpointNumber,
  CheckpointProposalHash,
  EpochNumber,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type {
  BlockData,
  BlockHash,
  BlockParameter,
  CheckpointsQuery,
  DataInBlock,
  L2BlockTag,
  L2Tips,
} from '@aztec/stdlib/block';
import type { CheckpointData } from '@aztec/stdlib/checkpoint';
import type {
  ContractClassPublic,
  ContractInstanceWithAddress,
  NodeInfo,
  ProtocolContractAddresses,
} from '@aztec/stdlib/contract';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';
import type {
  AztecNode,
  BlockIncludeOptions,
  BlockResponse,
  BlocksIncludeOptions,
  CheckpointIncludeOptions,
  CheckpointParameter,
  CheckpointResponse,
  CheckpointTag,
  GetTxByHashOptions,
  PeerInfo,
  ProposalsForSlot,
} from '@aztec/stdlib/interfaces/client';
import type { AllowedElement, WorldStateSyncStatus } from '@aztec/stdlib/interfaces/server';
import type { LogResult, PrivateLogsQuery, PublicLogsQuery } from '@aztec/stdlib/logs';
import type { L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import type { CheckpointAttestation } from '@aztec/stdlib/p2p';
import type { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type {
  GetTxReceiptOptions,
  IndexedTxEffect,
  PublicSimulationOutput,
  SimulationOverrides,
  Tx,
  TxHash,
  TxReceipt,
  TxValidationResult,
} from '@aztec/stdlib/tx';
import type { SingleValidatorStats, ValidatorsStats } from '@aztec/stdlib/validators';

/**
 * {@link AztecNode} implementation in which every method throws. TXENode extends it, overriding the read-side
 * queries the TXE actually serves, so any surface the TXE doesn't cover fails loudly instead of silently
 * misbehaving. Method order mirrors the interface declaration.
 */
export class UnimplementedAztecNode implements AztecNode {
  public getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    throw new Error('TXE node does not implement "getWorldStateSyncStatus"');
  }

  public findLeavesIndexes(
    _referenceBlock: BlockParameter,
    _treeId: MerkleTreeId,
    _leafValues: Fr[],
  ): Promise<(DataInBlock<bigint> | undefined)[]> {
    throw new Error('TXE node does not implement "findLeavesIndexes"');
  }

  public getNullifierMembershipWitness(
    _referenceBlock: BlockParameter,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    throw new Error('TXE node does not implement "getNullifierMembershipWitness"');
  }

  public getLowNullifierMembershipWitness(
    _referenceBlock: BlockParameter,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    throw new Error('TXE node does not implement "getLowNullifierMembershipWitness"');
  }

  public getPublicDataWitness(_referenceBlock: BlockParameter, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    throw new Error('TXE node does not implement "getPublicDataWitness"');
  }

  public getBlockHashMembershipWitness(
    _referenceBlock: BlockParameter,
    _blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    throw new Error('TXE node does not implement "getBlockHashMembershipWitness"');
  }

  public getNoteHashMembershipWitness(
    _referenceBlock: BlockParameter,
    _noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    throw new Error('TXE node does not implement "getNoteHashMembershipWitness"');
  }

  public getL1ToL2MessageMembershipWitness(
    _referenceBlock: BlockParameter,
    _l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    throw new Error('TXE node does not implement "getL1ToL2MessageMembershipWitness"');
  }

  public getL1ToL2MessageCheckpoint(_l1ToL2Message: Fr): Promise<CheckpointNumber | undefined> {
    throw new Error('TXE node does not implement "getL1ToL2MessageCheckpoint"');
  }

  public getL2ToL1Messages(_epoch: EpochNumber): Promise<Fr[][][][]> {
    throw new Error('TXE node does not implement "getL2ToL1Messages"');
  }

  public getL2ToL1MembershipWitness(
    _txHash: TxHash,
    _message: Fr,
    _messageIndexInTx?: number,
  ): Promise<L2ToL1MembershipWitness | undefined> {
    throw new Error('TXE node does not implement "getL2ToL1MembershipWitness"');
  }

  public getBlockNumber(_tip?: L2BlockTag): Promise<BlockNumber> {
    throw new Error('TXE node does not implement "getBlockNumber"');
  }

  public getCheckpointNumber(_tip?: CheckpointTag): Promise<CheckpointNumber> {
    throw new Error('TXE node does not implement "getCheckpointNumber"');
  }

  public getChainTips(): Promise<L2Tips> {
    throw new Error('TXE node does not implement "getChainTips"');
  }

  public getL1Constants(): Promise<L1RollupConstants> {
    throw new Error('TXE node does not implement "getL1Constants"');
  }

  public getSyncedL2SlotNumber(): Promise<SlotNumber | undefined> {
    throw new Error('TXE node does not implement "getSyncedL2SlotNumber"');
  }

  public getSyncedL2EpochNumber(): Promise<EpochNumber | undefined> {
    throw new Error('TXE node does not implement "getSyncedL2EpochNumber"');
  }

  public getSyncedL1Timestamp(): Promise<bigint | undefined> {
    throw new Error('TXE node does not implement "getSyncedL1Timestamp"');
  }

  public getCheckpointsData(_query: CheckpointsQuery): Promise<CheckpointData[]> {
    throw new Error('TXE node does not implement "getCheckpointsData"');
  }

  public getBlock<Opts extends BlockIncludeOptions = {}>(
    _param: BlockParameter,
    _options?: Opts,
  ): Promise<BlockResponse<Opts> | undefined> {
    throw new Error('TXE node does not implement "getBlock"');
  }

  public getBlockData(_param: BlockParameter): Promise<BlockData | undefined> {
    throw new Error('TXE node does not implement "getBlockData"');
  }

  public getBlocks<Opts extends BlocksIncludeOptions = {}>(
    _from: BlockNumber,
    _limit: number,
    _options?: Opts,
  ): Promise<BlockResponse<Opts>[]> {
    throw new Error('TXE node does not implement "getBlocks"');
  }

  public getCheckpoint<Opts extends CheckpointIncludeOptions = {}>(
    _param: CheckpointParameter,
    _options?: Opts,
  ): Promise<CheckpointResponse<Opts> | undefined> {
    throw new Error('TXE node does not implement "getCheckpoint"');
  }

  public getCheckpoints<Opts extends CheckpointIncludeOptions = {}>(
    _from: CheckpointNumber,
    _limit: number,
    _options?: Opts,
  ): Promise<CheckpointResponse<Opts>[]> {
    throw new Error('TXE node does not implement "getCheckpoints"');
  }

  public isReady(): Promise<boolean> {
    throw new Error('TXE node does not implement "isReady"');
  }

  public getNodeInfo(): Promise<NodeInfo> {
    throw new Error('TXE node does not implement "getNodeInfo"');
  }

  public getCurrentMinFees(): Promise<GasFees> {
    throw new Error('TXE node does not implement "getCurrentMinFees"');
  }

  public getPredictedMinFees(_manaUsage?: ManaUsageEstimate): Promise<GasFees[]> {
    throw new Error('TXE node does not implement "getPredictedMinFees"');
  }

  public getMaxPriorityFees(): Promise<GasFees> {
    throw new Error('TXE node does not implement "getMaxPriorityFees"');
  }

  public getNodeVersion(): Promise<string> {
    throw new Error('TXE node does not implement "getNodeVersion"');
  }

  public getVersion(): Promise<number> {
    throw new Error('TXE node does not implement "getVersion"');
  }

  public getChainId(): Promise<number> {
    throw new Error('TXE node does not implement "getChainId"');
  }

  // Typed via the interface rather than the L1ContractAddresses type itself, which is only exported by
  // @aztec/ethereum: the TXE has no L1 and doesn't depend on that package.
  public getL1ContractAddresses(): ReturnType<AztecNode['getL1ContractAddresses']> {
    throw new Error('TXE node does not implement "getL1ContractAddresses"');
  }

  public getProtocolContractAddresses(): Promise<ProtocolContractAddresses> {
    throw new Error('TXE node does not implement "getProtocolContractAddresses"');
  }

  public getPrivateLogsByTags(_query: PrivateLogsQuery): Promise<LogResult[][]> {
    throw new Error('TXE node does not implement "getPrivateLogsByTags"');
  }

  public getPublicLogsByTags(_query: PublicLogsQuery): Promise<LogResult[][]> {
    throw new Error('TXE node does not implement "getPublicLogsByTags"');
  }

  public sendTx(_tx: Tx): Promise<void> {
    throw new Error('TXE node does not implement "sendTx"');
  }

  public getTxReceipt<TGetTxReceiptOptions extends GetTxReceiptOptions = {}>(
    _txHash: TxHash,
    _options?: TGetTxReceiptOptions,
  ): Promise<TxReceipt<TGetTxReceiptOptions>> {
    throw new Error('TXE node does not implement "getTxReceipt"');
  }

  public getTxEffect(_txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    throw new Error('TXE node does not implement "getTxEffect"');
  }

  public getPendingTxs(_limit?: number, _after?: TxHash, _options?: GetTxByHashOptions): Promise<Tx[]> {
    throw new Error('TXE node does not implement "getPendingTxs"');
  }

  public getPendingTxCount(): Promise<number> {
    throw new Error('TXE node does not implement "getPendingTxCount"');
  }

  public getTxByHash(_txHash: TxHash, _options?: GetTxByHashOptions): Promise<Tx | undefined> {
    throw new Error('TXE node does not implement "getTxByHash"');
  }

  public getTxsByHash(_txHashes: TxHash[], _options?: GetTxByHashOptions): Promise<Tx[]> {
    throw new Error('TXE node does not implement "getTxsByHash"');
  }

  public getPublicStorageAt(_referenceBlock: BlockParameter, _contract: AztecAddress, _slot: Fr): Promise<Fr> {
    throw new Error('TXE node does not implement "getPublicStorageAt"');
  }

  public getValidatorsStats(): Promise<ValidatorsStats> {
    throw new Error('TXE node does not implement "getValidatorsStats"');
  }

  public getValidatorStats(
    _validatorAddress: EthAddress,
    _fromSlot?: SlotNumber,
    _toSlot?: SlotNumber,
  ): Promise<SingleValidatorStats | undefined> {
    throw new Error('TXE node does not implement "getValidatorStats"');
  }

  public simulatePublicCalls(
    _tx: Tx,
    _skipFeeEnforcement?: boolean,
    _overrides?: SimulationOverrides,
  ): Promise<PublicSimulationOutput> {
    throw new Error('TXE node does not implement "simulatePublicCalls"');
  }

  public isValidTx(
    _tx: Tx,
    _options?: { isSimulation?: boolean; skipFeeEnforcement?: boolean },
  ): Promise<TxValidationResult> {
    throw new Error('TXE node does not implement "isValidTx"');
  }

  public getContractClass(_id: Fr): Promise<ContractClassPublic | undefined> {
    throw new Error('TXE node does not implement "getContractClass"');
  }

  public getContract(
    _address: AztecAddress,
    _referenceBlock?: BlockParameter,
  ): Promise<ContractInstanceWithAddress | undefined> {
    throw new Error('TXE node does not implement "getContract"');
  }

  public getEncodedEnr(): Promise<string | undefined> {
    throw new Error('TXE node does not implement "getEncodedEnr"');
  }

  public getAllowedPublicSetup(): Promise<AllowedElement[]> {
    throw new Error('TXE node does not implement "getAllowedPublicSetup"');
  }

  public getPeers(_includePending?: boolean): Promise<PeerInfo[]> {
    throw new Error('TXE node does not implement "getPeers"');
  }

  public getCheckpointAttestationsForSlot(
    _slot: SlotNumber,
    _proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]> {
    throw new Error('TXE node does not implement "getCheckpointAttestationsForSlot"');
  }

  public getProposalsForSlot(_slot: SlotNumber): Promise<ProposalsForSlot> {
    throw new Error('TXE node does not implement "getProposalsForSlot"');
  }
}
