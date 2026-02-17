// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {CheckpointLog, CompressedTempCheckpointLog} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
import {EthPerFeeAssetE12, EthValue, FeeAssetValue} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {FeeHeader, L1FeeData} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {CompressedChainTips, ChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {ManaMinFeeComponents} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {Timestamp, Slot, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

struct PublicInputArgs {
  bytes32 previousArchive;
  bytes32 endArchive;
  bytes32 outHash;
  address proverId;
}

struct SubmitEpochRootProofArgs {
  uint256 start; // inclusive
  uint256 end; // inclusive
  PublicInputArgs args;
  bytes32[] fees;
  CommitteeAttestations attestations; // attestations for the last checkpoint in epoch
  bytes blobInputs;
  bytes proof;
}

/**
 * @notice Struct for storing flags for checkpoint header validation
 * @param ignoreDA - True will ignore DA check, otherwise checks
 */
struct CheckpointHeaderValidationFlags {
  bool ignoreDA;
}

struct GenesisState {
  bytes32 vkTreeRoot;
  bytes32 protocolContractsHash;
  bytes32 genesisArchiveRoot;
}

struct RollupConfigInput {
  uint256 aztecSlotDuration;
  uint256 aztecEpochDuration;
  uint256 targetCommitteeSize;
  uint256 lagInEpochsForValidatorSet;
  uint256 lagInEpochsForRandao;
  uint256 aztecProofSubmissionEpochs;
  uint256 slashingQuorum;
  uint256 slashingRoundSize;
  uint256 slashingLifetimeInRounds;
  uint256 slashingExecutionDelayInRounds;
  uint256[3] slashAmounts;
  uint256 slashingOffsetInRounds;
  SlasherFlavor slasherFlavor;
  address slashingVetoer;
  uint256 slashingDisableDuration;
  uint256 manaTarget;
  uint256 exitDelaySeconds;
  uint32 version;
  EthValue provingCostPerMana;
  EthPerFeeAssetE12 initialEthPerFeeAsset;
  RewardConfig rewardConfig;
  RewardBoostConfig rewardBoostConfig;
  StakingQueueConfig stakingQueueConfig;
  uint256 localEjectionThreshold;
  Timestamp earliestRewardsClaimableTimestamp;
  uint256 inboxLag;
}

struct RollupConfig {
  bytes32 vkTreeRoot;
  bytes32 protocolContractsHash;
  uint32 version;
  IERC20 feeAsset;
  IFeeJuicePortal feeAssetPortal;
  IVerifier epochProofVerifier;
  IInbox inbox;
  IOutbox outbox;
}

struct RollupStore {
  CompressedChainTips tips; // put first such that the struct slot structure is easy to follow for cheatcodes
  mapping(uint256 checkpointNumber => bytes32 archive) archives;
  // The following represents a circular buffer. Key is `checkpointNumber % size`.
  mapping(uint256 circularIndex => CompressedTempCheckpointLog temp) tempCheckpointLogs;
  RollupConfig config;
}

interface IRollupCore {
  event CheckpointProposed(
    uint256 indexed checkpointNumber,
    bytes32 indexed archive,
    bytes32[] versionedBlobHashes,
    bytes32 payloadDigest,
    bytes32 attestationsHash
  );
  event L2ProofVerified(uint256 indexed checkpointNumber, address indexed proverId);
  event CheckpointInvalidated(uint256 indexed checkpointNumber);
  event RewardConfigUpdated(RewardConfig rewardConfig);
  event ManaTargetUpdated(uint256 indexed manaTarget);
  event PrunedPending(uint256 provenCheckpointNumber, uint256 pendingCheckpointNumber);
  event RewardsClaimableUpdated(bool isRewardsClaimable);

  function setRewardsClaimable(bool _isRewardsClaimable) external;
  function claimSequencerRewards(address _recipient) external returns (uint256);
  function claimProverRewards(address _recipient, Epoch[] memory _epochs) external returns (uint256);

  function prune() external;
  function updateL1GasFeeOracle() external;

  function setProvingCostPerMana(EthValue _provingCostPerMana) external;

  function propose(
    ProposeArgs calldata _args,
    CommitteeAttestations memory _attestations,
    address[] memory _signers,
    Signature memory _attestationsAndSignersSignature,
    bytes calldata _blobInput
  ) external;

  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external;

  function invalidateBadAttestation(
    uint256 _checkpointNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee,
    uint256 _invalidIndex
  ) external;

  function invalidateInsufficientAttestations(
    uint256 _checkpointNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee
  ) external;

  function setRewardConfig(RewardConfig memory _config) external;
  function updateManaTarget(uint256 _manaTarget) external;

  // solhint-disable-next-line func-name-mixedcase
  function L1_BLOCK_AT_GENESIS() external view returns (uint256);
}

interface IRollup is IRollupCore, IHaveVersion {
  function validateHeaderWithAttestations(
    ProposedHeader calldata _header,
    CommitteeAttestations memory _attestations,
    address[] memory _signers,
    Signature memory _attestationsAndSignersSignature,
    bytes32 _digest,
    bytes32 _blobsHash,
    CheckpointHeaderValidationFlags memory _flags
  ) external;

  function canProposeAtTime(Timestamp _ts, bytes32 _archive, address _who) external returns (Slot, uint256);

  function getTips() external view returns (ChainTips memory);

  function status(uint256 _myHeaderCheckpointNumber)
    external
    view
    returns (
      uint256 provenCheckpointNumber,
      bytes32 provenArchive,
      uint256 pendingCheckpointNumber,
      bytes32 pendingArchive,
      bytes32 archiveOfMyCheckpoint,
      Epoch provenEpochNumber
    );

  function getEpochProofPublicInputs(
    uint256 _start,
    uint256 _end,
    PublicInputArgs calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs
  ) external view returns (bytes32[] memory);

  function validateBlobs(bytes calldata _blobsInputs) external view returns (bytes32[] memory, bytes32, bytes[] memory);

  function getManaMinFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    external
    view
    returns (ManaMinFeeComponents memory);
  function getManaMinFeeAt(Timestamp _timestamp, bool _inFeeAsset) external view returns (uint256);
  function getL1FeesAt(Timestamp _timestamp) external view returns (L1FeeData memory);
  function getEthPerFeeAsset() external view returns (EthPerFeeAssetE12);

  function getEpochForCheckpoint(uint256 _checkpointNumber) external view returns (Epoch);
  function canPruneAtTime(Timestamp _ts) external view returns (bool);

  function archive() external view returns (bytes32);
  function archiveAt(uint256 _checkpointNumber) external view returns (bytes32);
  function getProvenCheckpointNumber() external view returns (uint256);
  function getPendingCheckpointNumber() external view returns (uint256);
  function getCheckpoint(uint256 _checkpointNumber) external view returns (CheckpointLog memory);
  function getFeeHeader(uint256 _checkpointNumber) external view returns (FeeHeader memory);
  function getBlobCommitmentsHash(uint256 _checkpointNumber) external view returns (bytes32);
  function getCurrentBlobCommitmentsHash() external view returns (bytes32);

  function getSharesFor(address _prover) external view returns (uint256);
  function getSequencerRewards(address _sequencer) external view returns (uint256);
  function getCollectiveProverRewardsForEpoch(Epoch _epoch) external view returns (uint256);
  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover) external view returns (uint256);
  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover) external view returns (bool);
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
  function getCheckpointReward() external view returns (uint256);
  function getEarliestRewardsClaimableTimestamp() external view returns (Timestamp);
  function isRewardsClaimable() external view returns (bool);
}
