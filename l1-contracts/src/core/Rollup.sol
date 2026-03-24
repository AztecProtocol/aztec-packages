// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IEconomicsCore} from "@aztec/core/interfaces/IEconomicsCore.sol";
import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {
  IRollup,
  IHaveVersion,
  ChainTips,
  PublicInputArgs,
  CheckpointHeaderValidationFlags,
  RollupConfigInput
} from "@aztec/core/interfaces/IRollup.sol";
import {IStaking, AttesterConfig, Exit, AttesterView, Status} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelection, IEmperor} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {TempCheckpointLog, CheckpointLog} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
import {ProposalFeeParameters} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {StakingLib} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {CompressedSlot, CompressedTimestamp, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {ChainTipsLib, CompressedChainTips} from "./libraries/compressed-data/Tips.sol";
import {ValidateHeaderArgs} from "./libraries/rollup/ProposeLib.sol";
import {DepositArgs} from "./libraries/StakingQueue.sol";
import {
  RollupCore,
  GenesisState,
  IFeeJuicePortal,
  IERC20,
  TimeLib,
  Slot,
  Epoch,
  Timestamp,
  CommitteeAttestations,
  RollupOperationsExtLib,
  ValidatorOperationsExtLib,
  STFLib,
  RollupStore,
  IInbox,
  IOutbox
} from "./RollupCore.sol";

/**
 * @title Rollup
 * @author Aztec Labs
 * @notice A wrapper contract around the RollupCore which provides additional view functions
 *         which are not needed by the rollup itself to function, but makes it easy to reason
 *         about the state of the rollup and test it.
 */
contract Rollup is IStaking, IValidatorSelection, IRollup, RollupCore {
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using CompressedTimeMath for CompressedSlot;
  using CompressedTimeMath for CompressedTimestamp;
  using Checkpoints for Checkpoints.Trace160;
  using ChainTipsLib for CompressedChainTips;

  constructor(
    IERC20 _feeAsset,
    IERC20 _stakingAsset,
    GSE _gse,
    IVerifier _epochProofVerifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config
  ) RollupCore(_feeAsset, _stakingAsset, _gse, _epochProofVerifier, _governance, _genesisState, _config) {}

  /**
   * @notice  Validate a header for submission
   *
   * @dev     This is a convenience function that can be used by the sequencer to validate a "partial" header
   *
   * @param _header - The header to validate
   * @param _attestations - The attestations to validate
   * @param _digest - The digest to validate
   * @param _blobsHash - The blobs hash for this checkpoint
   * @param _flags - The flags to validate
   */
  function validateHeaderWithAttestations(
    ProposedHeader calldata _header,
    CommitteeAttestations memory _attestations,
    address[] calldata _signers,
    Signature memory _attestationsAndSignersSignature,
    bytes32 _digest,
    bytes32 _blobsHash,
    CheckpointHeaderValidationFlags memory _flags
  ) external override(IRollup) {
    RollupStore storage rollupStore = STFLib.getStorage();
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    ProposalFeeParameters memory proposalFeeParameters = IEconomicsCore(
        address(
          rollupStore.economicsCheckpoints.upperLookupRecent(uint96(Timestamp.unwrap(currentEpoch.toTimestamp())))
        )
      )
      .getProposalFeeParameters(
        STFLib.getEffectivePendingCheckpointNumber(Timestamp.wrap(block.timestamp)),
        Timestamp.wrap(block.timestamp),
        true
      );
    RollupOperationsExtLib.validateHeaderWithAttestations(
      ValidateHeaderArgs({
        header: _header,
        digest: _digest,
        manaLimit: proposalFeeParameters.manaLimit,
        manaMinFee: proposalFeeParameters.manaMinFee,
        blobsHashesCommitment: _blobsHash,
        flags: _flags
      }),
      _attestations,
      _signers,
      _attestationsAndSignersSignature
    );
  }

  /**
   * @notice  Get the validator set for the current epoch
   * @return The validator set for the current epoch
   */
  function getCurrentEpochCommittee() external override(IValidatorSelection) returns (address[] memory) {
    return getEpochCommittee(getCurrentEpoch());
  }

  /**
   * @notice  Get the committee for a given timestamp
   *
   * @param _ts - The timestamp to get the committee for
   *
   * @return The committee for the given timestamp
   * @custom:reverts Errors.ValidatorSelection__EpochNotStable if the requested epoch is not stable
   */
  function getCommitteeAt(Timestamp _ts) external override(IValidatorSelection) returns (address[] memory) {
    return getEpochCommittee(getEpochAt(_ts));
  }

  /**
   * @notice Get the committee commitment a the given timestamp
   *
   * @param _ts - The timestamp to get the committee for
   *
   * @return The committee commitment for the given timestamp
   * @return The committee size for the given timestamp
   * @custom:reverts Errors.ValidatorSelection__EpochNotStable if the requested epoch is not stable
   */
  function getCommitteeCommitmentAt(Timestamp _ts) external override(IValidatorSelection) returns (bytes32, uint256) {
    return ValidatorOperationsExtLib.getCommitteeCommitmentAt(getEpochAt(_ts));
  }

  /**
   * @notice Get the committee commitment a the given epoch
   *
   * @param _epoch - The epoch to get the committee for
   *
   * @return The committee commitment for the given epoch
   * @return The committee size for the given epoch
   * @custom:reverts Errors.ValidatorSelection__EpochNotStable if the requested epoch is not stable
   */
  function getEpochCommitteeCommitment(Epoch _epoch) external override(IValidatorSelection) returns (bytes32, uint256) {
    return ValidatorOperationsExtLib.getCommitteeCommitmentAt(_epoch);
  }

  /**
   * @notice  Get the proposer for the current slot
   *
   * @dev     Calls `getCurrentProposer(uint256)` with the current timestamp
   *
   * @return The address of the proposer
   */
  function getCurrentProposer() external override(IEmperor) returns (address) {
    return getProposerAt(Timestamp.wrap(block.timestamp));
  }

  /**
   * @notice  Check if msg.sender can propose at a given time
   *
   * @param _ts - The timestamp to check
   * @param _archive - The archive to check (should be the latest archive)
   * @param _who - The address to check
   *
   * @return uint256 - The slot at the given timestamp
   * @return uint256 - The checkpoint number at the given timestamp
   * @custom:reverts Errors.ValidatorSelection__EpochNotStable if the requested epoch is not stable
   */
  function canProposeAtTime(Timestamp _ts, bytes32 _archive, address _who)
    external
    override(IRollup)
    returns (Slot, uint256)
  {
    return ValidatorOperationsExtLib.canProposeAtTime(_ts, _archive, _who);
  }

  function getTargetCommitteeSize() external view override(IValidatorSelection) returns (uint256) {
    return ValidatorOperationsExtLib.getTargetCommitteeSize();
  }

  function getGenesisTime() external view override(IValidatorSelection) returns (Timestamp) {
    return Timestamp.wrap(TimeLib.getStorage().genesisTime);
  }

  function getSlotDuration() external view override(IValidatorSelection) returns (uint256) {
    return TimeLib.getStorage().slotDuration;
  }

  function getEpochDuration() external view override(IValidatorSelection) returns (uint256) {
    return TimeLib.getStorage().epochDuration;
  }

  function getProofSubmissionEpochs() external view override(IRollup) returns (uint256) {
    return TimeLib.getStorage().proofSubmissionEpochs;
  }

  function getSlasher() external view override(IStaking) returns (address) {
    return StakingLib.getStorage().slasher;
  }

  function getLocalEjectionThreshold() external view override(IStaking) returns (uint256) {
    return StakingLib.getStorage().localEjectionThreshold;
  }

  function getStakingAsset() external view override(IStaking) returns (IERC20) {
    return StakingLib.getStorage().stakingAsset;
  }

  function getEjectionThreshold() external view override(IStaking) returns (uint256) {
    return StakingLib.getStorage().gse.EJECTION_THRESHOLD();
  }

  function getActivationThreshold() external view override(IStaking) returns (uint256) {
    return StakingLib.getStorage().gse.ACTIVATION_THRESHOLD();
  }

  function getExitDelay() external view override(IStaking) returns (Timestamp) {
    return StakingLib.getStorage().exitDelay.decompress();
  }

  function getGSE() external view override(IStaking) returns (GSE) {
    return StakingLib.getStorage().gse;
  }

  function getTips() external view override(IRollup) returns (ChainTips memory) {
    return ChainTipsLib.decompress(STFLib.getStorage().tips);
  }

  function status(uint256 _myHeaderCheckpointNumber)
    external
    view
    override(IRollup)
    returns (
      uint256 provenCheckpointNumber,
      bytes32 provenArchive,
      uint256 pendingCheckpointNumber,
      bytes32 pendingArchive,
      bytes32 archiveOfMyCheckpoint,
      Epoch provenEpochNumber
    )
  {
    RollupStore storage rollupStore = STFLib.getStorage();
    ChainTips memory tips = ChainTipsLib.decompress(rollupStore.tips);

    return (
      tips.proven,
      rollupStore.archives[tips.proven],
      tips.pending,
      rollupStore.archives[tips.pending],
      archiveAt(_myHeaderCheckpointNumber),
      getEpochForCheckpoint(tips.proven)
    );
  }

  /**
   * @notice Returns the computed public inputs for the given epoch proof.
   *
   * @dev Useful for debugging and testing. Allows submitter to compare their
   * own public inputs used for generating the proof vs the ones assembled
   * by this contract when verifying it.
   *
   * @param  _start - The start of the epoch (inclusive)
   * @param  _end - The end of the epoch (inclusive)
   * @param  _args - Array of public inputs to the proof (previousArchive, endArchive, endTimestamp, outHash, proverId)
   * @param  _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   */
  function getEpochProofPublicInputs(
    uint256 _start,
    uint256 _end,
    PublicInputArgs calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs
  ) external view override(IRollup) returns (bytes32[] memory) {
    return RollupOperationsExtLib.getEpochProofPublicInputs(_start, _end, _args, _fees, _blobPublicInputs);
  }

  /**
   * @notice  Validate blob transactions against given inputs.
   * @dev     Only exists here for gas estimation.
   */
  function validateBlobs(bytes calldata _blobsInput)
    external
    view
    override(IRollup)
    returns (bytes32[] memory, bytes32, bytes[] memory)
  {
    return RollupOperationsExtLib.validateBlobs(_blobsInput, checkBlob);
  }

  /**
   * @notice  Get the current archive root
   *
   * @return bytes32 - The current archive root
   */
  function archive() external view override(IRollup) returns (bytes32) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return rollupStore.archives[rollupStore.tips.getPending()];
  }

  function getProvenCheckpointNumber() external view override(IRollup) returns (uint256) {
    return STFLib.getStorage().tips.getProven();
  }

  function getPendingCheckpointNumber() external view override(IRollup) returns (uint256) {
    return STFLib.getStorage().tips.getPending();
  }

  function getCheckpoint(uint256 _checkpointNumber) external view override(IRollup) returns (CheckpointLog memory) {
    TempCheckpointLog memory tempCheckpointLog = STFLib.getTempCheckpointLog(_checkpointNumber);
    return CheckpointLog({
      archive: STFLib.getStorage().archives[_checkpointNumber],
      headerHash: tempCheckpointLog.headerHash,
      blobCommitmentsHash: tempCheckpointLog.blobCommitmentsHash,
      outHash: tempCheckpointLog.outHash,
      attestationsHash: tempCheckpointLog.attestationsHash,
      payloadDigest: tempCheckpointLog.payloadDigest,
      slotNumber: tempCheckpointLog.slotNumber
    });
  }

  function getBlobCommitmentsHash(uint256 _checkpointNumber) external view override(IRollup) returns (bytes32) {
    return STFLib.getBlobCommitmentsHash(_checkpointNumber);
  }

  function getCurrentBlobCommitmentsHash() external view override(IRollup) returns (bytes32) {
    return STFLib.getBlobCommitmentsHash(STFLib.getStorage().tips.getPending());
  }

  function getConfig(address _attester) external view override(IStaking) returns (AttesterConfig memory) {
    return ValidatorOperationsExtLib.getConfig(_attester);
  }

  function getExit(address _attester) external view override(IStaking) returns (Exit memory) {
    return ValidatorOperationsExtLib.getExit(_attester);
  }

  function getStatus(address _attester) external view override(IStaking) returns (Status) {
    return ValidatorOperationsExtLib.getStatus(_attester);
  }

  function getAttesterView(address _attester) external view override(IStaking) returns (AttesterView memory) {
    return ValidatorOperationsExtLib.getAttesterView(_attester);
  }

  /**
   * @notice  Get the sample seed for a given timestamp
   *
   * @param _ts - The timestamp to get the sample seed for
   *
   * @return The sample seed for the given timestamp
   * @custom:reverts Errors.ValidatorSelection__EpochNotStable if the requested epoch is not stable
   */
  function getSampleSeedAt(Timestamp _ts) external view override(IValidatorSelection) returns (uint256) {
    return ValidatorOperationsExtLib.getSampleSeedAt(getEpochAt(_ts));
  }

  /**
   * @notice  Get the sampling size for a given timestamp
   *
   * @param _ts - The timestamp to get the sampling size for
   *
   * @return The sampling size for the given timestamp
   * @custom:reverts Errors.ValidatorSelection__EpochNotStable if the requested epoch is not stable
   */
  function getSamplingSizeAt(Timestamp _ts) external view override(IValidatorSelection) returns (uint256) {
    return ValidatorOperationsExtLib.getSamplingSizeAt(getEpochAt(_ts));
  }

  function getLagInEpochsForValidatorSet() external view override(IValidatorSelection) returns (uint256) {
    return ValidatorOperationsExtLib.getLagInEpochsForValidatorSet();
  }

  function getLagInEpochsForRandao() external view override(IValidatorSelection) returns (uint256) {
    return ValidatorOperationsExtLib.getLagInEpochsForRandao();
  }

  /**
   * @notice  Get the escape hatch contract
   * @return The escape hatch contract interface, or zero-address if disabled
   */
  function getEscapeHatch() external view override(IValidatorSelection) returns (IEscapeHatch) {
    return ValidatorOperationsExtLib.getEscapeHatch();
  }

  /**
   * @notice  Get the escape hatch contract that was active at the start of a given epoch
   * @param _epoch The epoch to look up the escape hatch for
   * @return The escape hatch contract interface that was active at the epoch start
   */
  function getEscapeHatchForEpoch(Epoch _epoch) external view override(IValidatorSelection) returns (IEscapeHatch) {
    return ValidatorOperationsExtLib.getEscapeHatchForEpoch(_epoch);
  }

  /**
   * @notice  Get the sample seed for the current epoch
   *
   * @return The sample seed for the current epoch
   */
  function getCurrentSampleSeed() external view override(IValidatorSelection) returns (uint256) {
    return ValidatorOperationsExtLib.getSampleSeedAt(getCurrentEpoch());
  }

  /**
   * @notice  Get the current slot number
   *
   * @return The current slot number
   */
  function getCurrentSlot() external view override(IEmperor) returns (Slot) {
    return Timestamp.wrap(block.timestamp).slotFromTimestamp();
  }

  /**
   * @notice  Get the timestamp for a given slot
   *
   * @param _slotNumber - The slot number to get the timestamp for
   *
   * @return The timestamp for the given slot
   */
  function getTimestampForSlot(Slot _slotNumber) external view override(IValidatorSelection) returns (Timestamp) {
    return _slotNumber.toTimestamp();
  }

  /**
   * @notice  Get the timestamp for a given epoch
   *
   * @param _epoch - The epoch to get the timestamp for
   *
   * @return The timestamp for the start of the given epoch
   */
  function getTimestampForEpoch(Epoch _epoch) external view override(IValidatorSelection) returns (Timestamp) {
    return _epoch.toTimestamp();
  }

  /**
   * @notice  Computes the slot at a specific time
   *
   * @param _ts - The timestamp to compute the slot for
   *
   * @return The computed slot
   */
  function getSlotAt(Timestamp _ts) external view override(IValidatorSelection) returns (Slot) {
    return _ts.slotFromTimestamp();
  }

  /**
   * @notice  Computes the epoch at a specific slot
   *
   * @param _slotNumber - The slot number to compute the epoch for
   *
   * @return The computed epoch
   */
  function getEpochAtSlot(Slot _slotNumber) external view override(IValidatorSelection) returns (Epoch) {
    return _slotNumber.epochFromSlot();
  }

  function getVersion() external view override(IHaveVersion) returns (uint256) {
    return STFLib.getStorage().config.version;
  }

  function getInbox() external view override(IRollup) returns (IInbox) {
    return STFLib.getStorage().config.inbox;
  }

  function getOutbox() external view override(IRollup) returns (IOutbox) {
    return STFLib.getStorage().config.outbox;
  }

  function getFeeAsset() external view override(IRollup) returns (IERC20) {
    return STFLib.getStorage().config.feeAsset;
  }

  function getFeeAssetPortal() external view override(IRollup) returns (IFeeJuicePortal) {
    return STFLib.getStorage().config.feeAssetPortal;
  }

  function getEconomics() external view override(IRollup) returns (IEconomicsCore) {
    return IEconomicsCore(address(STFLib.getStorage().economicsCheckpoints.latest()));
  }

  function getEconomicsForEpoch(Epoch _epoch) external view override(IRollup) returns (IEconomicsCore) {
    return IEconomicsCore(
      address(
        STFLib.getStorage().economicsCheckpoints.upperLookupRecent(uint96(Timestamp.unwrap(_epoch.toTimestamp())))
      )
    );
  }

  function canPruneAtTime(Timestamp _ts) external view override(IRollup) returns (bool) {
    return STFLib.canPruneAtTime(_ts);
  }

  function getAvailableValidatorFlushes() external view override(IStaking) returns (uint256) {
    return ValidatorOperationsExtLib.getAvailableValidatorFlushes();
  }

  function getIsBootstrapped() external view override(IStaking) returns (bool) {
    return StakingLib.getStorage().isBootstrapped;
  }

  function getEntryQueueAt(uint256 _index) external view override(IStaking) returns (DepositArgs memory) {
    return ValidatorOperationsExtLib.getEntryQueueAt(_index);
  }

  /**
   * @notice  Get the validator set for a given epoch
   *
   * @dev     Consider removing this to replace with a `size` and individual getter.
   *
   * @param _epoch The epoch number to get the validator set for
   *
   * @return The validator set for the given epoch
   */
  function getEpochCommittee(Epoch _epoch) public override(IValidatorSelection) returns (address[] memory) {
    return ValidatorOperationsExtLib.getCommitteeAt(_epoch);
  }

  /**
   * @notice  Get the proposer for the slot at a specific timestamp
   *
   * @dev     This function is very useful for offchain usage, as it easily allow a client to
   *          determine who will be the proposer at the NEXT ethereum block.
   *          Should not be trusted when moving beyond the current epoch, since changes to the
   *          validator set might not be reflected when we actually reach that epoch (more changes
   *          might have happened).
   *
   * @dev     The proposer is selected from the validator set of the current epoch.
   *
   * @dev     Should only be access onchain if epoch is setup, otherwise very expensive.
   *
   * @dev     A return value of address(0) means that the proposer is "open" and can be anyone.
   *
   * @dev     If the current epoch is the first epoch, returns address(0)
   *          If the current epoch is setup, we will return the proposer for the current slot
   *          If the current epoch is not setup, we will perform a sample as if it was (gas heavy)
   *
   * @return The address of the proposer
   */
  function getProposerAt(Timestamp _ts) public override(IValidatorSelection) returns (address) {
    return ValidatorOperationsExtLib.getProposerAt(_ts.slotFromTimestamp());
  }

  /**
   * @notice  Get the attester at an index
   *
   * @param _index - The index to get the attester for
   *
   * @return The attester at the index
   */
  function getAttesterAtIndex(uint256 _index) public view override(IStaking) returns (address) {
    return ValidatorOperationsExtLib.getAttesterAtIndex(_index);
  }

  function getEpochForCheckpoint(uint256 _checkpointNumber) public view override(IRollup) returns (Epoch) {
    return STFLib.getEpochForCheckpoint(_checkpointNumber);
  }

  /**
   * @notice  Get the archive root of a specific checkpoint
   *
   * @param _checkpointNumber - The checkpoint number to get the archive root of
   *
   * @return bytes32 - The archive root of the checkpoint
   */
  function archiveAt(uint256 _checkpointNumber) public view override(IRollup) returns (bytes32) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return _checkpointNumber <= rollupStore.tips.getPending() ? rollupStore.archives[_checkpointNumber] : bytes32(0);
  }

  /**
   * @notice  Computes the epoch at a specific time
   *
   * @param _ts - The timestamp to compute the epoch for
   *
   * @return The computed epoch
   */
  function getEpochAt(Timestamp _ts) public view override(IValidatorSelection) returns (Epoch) {
    return _ts.epochFromTimestamp();
  }

  /**
   * @notice  Get the current epoch number
   *
   * @return The current epoch number
   */
  function getCurrentEpoch() public view override(IValidatorSelection) returns (Epoch) {
    return Timestamp.wrap(block.timestamp).epochFromTimestamp();
  }

  function getNextFlushableEpoch() public view override(IStaking) returns (Epoch) {
    return ValidatorOperationsExtLib.getNextFlushableEpoch();
  }

  function getEntryQueueLength() public view override(IStaking) returns (uint256) {
    return ValidatorOperationsExtLib.getEntryQueueLength();
  }
}
