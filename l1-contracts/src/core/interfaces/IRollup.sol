// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {BlockLog, CompressedBlockLog} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {
  FeeHeader, L1FeeData, ManaBaseFeeComponents
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {FeeAssetPerEthE9, EthValue, FeeAssetValue} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/StakingQueue.sol";
import {RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {CommitteeAttestations} from "@aztec/shared/libraries/SignatureLib.sol";
import {Timestamp, Slot, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

struct PublicInputArgs {
  bytes32 previousArchive;
  bytes32 endArchive;
  address proverId;
}

struct SubmitEpochRootProofArgs {
  uint256 start; // inclusive
  uint256 end; // inclusive
  PublicInputArgs args;
  bytes32[] fees;
  bytes blobInputs;
  bytes proof;
}

struct ChainTips {
  uint256 pendingBlockNumber;
  uint256 provenBlockNumber;
}

/**
 * @notice Struct for storing flags for block header validation
 * @param ignoreDA - True will ignore DA check, otherwise checks
 * @param ignoreSignature - True will ignore the signatures, otherwise checks
 */
struct BlockHeaderValidationFlags {
  bool ignoreDA;
  bool ignoreSignatures;
}

struct GenesisState {
  bytes32 vkTreeRoot;
  bytes32 protocolContractTreeRoot;
  bytes32 genesisArchiveRoot;
}

struct RollupConfigInput {
  uint256 aztecSlotDuration;
  uint256 aztecEpochDuration;
  uint256 targetCommitteeSize;
  uint256 aztecProofSubmissionEpochs;
  uint256 slashingQuorum;
  uint256 slashingRoundSize;
  uint256 manaTarget;
  uint256 exitDelaySeconds;
  EthValue provingCostPerMana;
  RewardConfig rewardConfig;
  RewardBoostConfig rewardBoostConfig;
  StakingQueueConfig stakingQueueConfig;
}

struct RollupConfig {
  uint256 aztecProofSubmissionEpochs;
  IERC20 feeAsset;
  IFeeJuicePortal feeAssetPortal;
  IRewardDistributor rewardDistributor;
  bytes32 vkTreeRoot;
  bytes32 protocolContractTreeRoot;
  IVerifier epochProofVerifier;
  IInbox inbox;
  IOutbox outbox;
  uint256 version;
}

struct RollupStore {
  ChainTips tips; // put first such that the struct slot structure is easy to follow for cheatcodes
  mapping(uint256 blockNumber => CompressedBlockLog log) blocks;
  RollupConfig config;
}

interface IRollupCore {
  event L2BlockProposed(
    uint256 indexed blockNumber, bytes32 indexed archive, bytes32[] versionedBlobHashes
  );
  event L2ProofVerified(uint256 indexed blockNumber, address indexed proverId);
  event RewardConfigUpdated(RewardConfig rewardConfig);
  event ManaTargetUpdated(uint256 indexed manaTarget);
  event PrunedPending(uint256 provenBlockNumber, uint256 pendingBlockNumber);
  event RewardsClaimableUpdated(bool isRewardsClaimable);

  function setRewardsClaimable(bool _isRewardsClaimable) external;
  function claimSequencerRewards(address _recipient) external returns (uint256);
  function claimProverRewards(address _recipient, Epoch[] memory _epochs)
    external
    returns (uint256);

  function prune() external;
  function updateL1GasFeeOracle() external;

  function setProvingCostPerMana(EthValue _provingCostPerMana) external;

  function propose(
    ProposeArgs calldata _args,
    CommitteeAttestations memory _attestations,
    bytes calldata _blobInput
  ) external;

  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external;

  function setRewardConfig(RewardConfig memory _config) external;
  function updateManaTarget(uint256 _manaTarget) external;

  // solhint-disable-next-line func-name-mixedcase
  function L1_BLOCK_AT_GENESIS() external view returns (uint256);
}

interface IRollup is IRollupCore, IHaveVersion {
  function validateHeader(
    ProposedHeader calldata _header,
    CommitteeAttestations memory _attestations,
    bytes32 _digest,
    bytes32 _blobsHash,
    BlockHeaderValidationFlags memory _flags
  ) external;

  function canProposeAtTime(Timestamp _ts, bytes32 _archive) external returns (Slot, uint256);

  function getTips() external view returns (ChainTips memory);

  function status(uint256 _myHeaderBlockNumber)
    external
    view
    returns (
      uint256 provenBlockNumber,
      bytes32 provenArchive,
      uint256 pendingBlockNumber,
      bytes32 pendingArchive,
      bytes32 archiveOfMyBlock,
      Epoch provenEpochNumber
    );

  function getEpochProofPublicInputs(
    uint256 _start,
    uint256 _end,
    PublicInputArgs calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs
  ) external view returns (bytes32[] memory);

  function validateBlobs(bytes calldata _blobsInputs)
    external
    view
    returns (bytes32[] memory, bytes32, bytes[] memory);

  function getManaBaseFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    external
    view
    returns (ManaBaseFeeComponents memory);
  function getManaBaseFeeAt(Timestamp _timestamp, bool _inFeeAsset) external view returns (uint256);
  function getL1FeesAt(Timestamp _timestamp) external view returns (L1FeeData memory);
  function getFeeAssetPerEth() external view returns (FeeAssetPerEthE9);

  function getEpochForBlock(uint256 _blockNumber) external view returns (Epoch);
  function canPruneAtTime(Timestamp _ts) external view returns (bool);

  function archive() external view returns (bytes32);
  function archiveAt(uint256 _blockNumber) external view returns (bytes32);
  function getProvenBlockNumber() external view returns (uint256);
  function getPendingBlockNumber() external view returns (uint256);
  function getBlock(uint256 _blockNumber) external view returns (BlockLog memory);
  function getFeeHeader(uint256 _blockNumber) external view returns (FeeHeader memory);
  function getBlobCommitmentsHash(uint256 _blockNumber) external view returns (bytes32);
  function getCurrentBlobCommitmentsHash() external view returns (bytes32);

  function getSharesFor(address _prover) external view returns (uint256);
  function getSequencerRewards(address _sequencer) external view returns (uint256);
  function getCollectiveProverRewardsForEpoch(Epoch _epoch) external view returns (uint256);
  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover)
    external
    view
    returns (uint256);
  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover)
    external
    view
    returns (bool);
  function getHasClaimed(address _prover, Epoch _epoch) external view returns (bool);

  function getProofSubmissionEpochs() external view returns (uint256);
  function getManaTarget() external view returns (uint256);
  function getManaLimit() external view returns (uint256);
  function getProvingCostPerManaInEth() external view returns (EthValue);

  function getProvingCostPerManaInFeeAsset() external view returns (FeeAssetValue);

  function getFeeAsset() external view returns (IERC20);
  function getFeeAssetPortal() external view returns (IFeeJuicePortal);
  function getRewardDistributor() external view returns (IRewardDistributor);
  function getBurnAddress() external view returns (address);

  function getInbox() external view returns (IInbox);
  function getOutbox() external view returns (IOutbox);

  function getRewardConfig() external view returns (RewardConfig memory);
}
