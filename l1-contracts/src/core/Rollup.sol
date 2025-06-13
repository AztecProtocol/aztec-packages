// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  IRollup,
  IHaveVersion,
  ChainTips,
  PublicInputArgs,
  L1FeeData,
  ManaBaseFeeComponents,
  FeeAssetPerEthE9,
  BlockLog,
  BlockHeaderValidationFlags,
  FeeHeader,
  RollupConfigInput
} from "@aztec/core/interfaces/IRollup.sol";
import {
  IStaking, AttesterConfig, Exit, AttesterView, Status
} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelection, IEmporer} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {
  FeeLib, FeeHeaderLib, FeeAssetValue, PriceLib
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";

import {StakingLib} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {ProposeLib, ValidateHeaderArgs} from "./libraries/rollup/ProposeLib.sol";
import {RewardLib, ActivityScore, RewardConfig} from "./libraries/rollup/RewardLib.sol";
import {
  RollupCore,
  GenesisState,
  IRewardDistributor,
  IFeeJuicePortal,
  IERC20,
  TimeLib,
  Slot,
  Epoch,
  Timestamp,
  Errors,
  CommitteeAttestation,
  ExtRollupLib,
  ExtRollupLib2,
  EthValue,
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
  using PriceLib for EthValue;

  constructor(
    IERC20 _feeAsset,
    IRewardDistributor _rewardDistributor,
    IERC20 _stakingAsset,
    GSE _gse,
    IVerifier _epochProofVerifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config
  )
    RollupCore(
      _feeAsset,
      _rewardDistributor,
      _stakingAsset,
      _gse,
      _epochProofVerifier,
      _governance,
      _genesisState,
      _config
    )
  {}

  /**
   * @notice  Validate a header for submission
   *
   * @dev     This is a convenience function that can be used by the sequencer to validate a "partial" header
   *          without having to deal with viem or anvil for simulating timestamps in the future.
   *
   * @param _header - The header to validate
   * @param _attestations - The attestations to validate
   * @param _digest - The digest to validate
   * @param _currentTime - The current time
   * @param _blobsHash - The blobs hash for this block
   * @param _flags - The flags to validate
   */
  function validateHeader(
    ProposedHeader calldata _header,
    CommitteeAttestation[] memory _attestations,
    bytes32 _digest,
    Timestamp _currentTime,
    bytes32 _blobsHash,
    BlockHeaderValidationFlags memory _flags
  ) external override(IRollup) {
    ExtRollupLib.validateHeader(
      ValidateHeaderArgs({
        header: _header,
        attestations: _attestations,
        digest: _digest,
        currentTime: _currentTime,
        manaBaseFee: getManaBaseFeeAt(_currentTime, true),
        blobsHashesCommitment: _blobsHash,
        flags: _flags
      })
    );
  }

  /**
   * @notice  Get the validator set for the current epoch
   * @return The validator set for the current epoch
   */
  function getCurrentEpochCommittee()
    external
    override(IValidatorSelection)
    returns (address[] memory)
  {
    return getEpochCommittee(getCurrentEpoch());
  }

  /**
   * @notice  Get the committee for a given timestamp
   *
   * @param _ts - The timestamp to get the committee for
   *
   * @return The committee for the given timestamp
   */
  function getCommitteeAt(Timestamp _ts)
    external
    override(IValidatorSelection)
    returns (address[] memory)
  {
    return getEpochCommittee(getEpochAt(_ts));
  }

  /**
   * @notice Get the committee commitment a the given timestamp
   *
   * @param _ts - The timestamp to get the committee for
   *
   * @return The committee commitment for the given timestamp
   * @return The committee size for the given timestamp
   */
  function getCommitteeCommitmentAt(Timestamp _ts)
    external
    override(IValidatorSelection)
    returns (bytes32, uint256)
  {
    return ExtRollupLib2.getCommitteeCommitmentAt(getEpochAt(_ts));
  }

  /**
   * @notice  Get the proposer for the current slot
   *
   * @dev     Calls `getCurrentProposer(uint256)` with the current timestamp
   *
   * @return The address of the proposer
   */
  function getCurrentProposer() external override(IEmporer) returns (address) {
    return getProposerAt(Timestamp.wrap(block.timestamp));
  }

  /**
   * @notice  Check if msg.sender can propose at a given time
   *
   * @param _ts - The timestamp to check
   * @param _archive - The archive to check (should be the latest archive)
   *
   * @return uint256 - The slot at the given timestamp
   * @return uint256 - The block number at the given timestamp
   */
  function canProposeAtTime(Timestamp _ts, bytes32 _archive)
    external
    override(IRollup)
    returns (Slot, uint256)
  {
    Slot slot = _ts.slotFromTimestamp();
    RollupStore storage rollupStore = STFLib.getStorage();

    uint256 pendingBlockNumber = STFLib.getEffectivePendingBlockNumber(_ts);

    Slot lastSlot = rollupStore.blocks[pendingBlockNumber].slotNumber;

    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    // Make sure that the proposer is up to date and on the right chain (ie no reorgs)
    bytes32 tipArchive = rollupStore.blocks[pendingBlockNumber].archive;
    require(tipArchive == _archive, Errors.Rollup__InvalidArchive(tipArchive, _archive));

    address proposer = ExtRollupLib2.getProposerAt(slot);
    require(
      proposer == msg.sender, Errors.ValidatorSelection__InvalidProposer(proposer, msg.sender)
    );

    return (slot, pendingBlockNumber + 1);
  }

  function getTargetCommitteeSize() external view override(IValidatorSelection) returns (uint256) {
    return ExtRollupLib2.getTargetCommitteeSize();
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

  function getSlasher() external view override(IStaking) returns (address) {
    return StakingLib.getStorage().slasher;
  }

  function getStakingAsset() external view override(IStaking) returns (IERC20) {
    return StakingLib.getStorage().stakingAsset;
  }

  function getMinimumStake() external view override(IStaking) returns (uint256) {
    return StakingLib.getStorage().gse.MINIMUM_STAKE();
  }

  function getDepositAmount() external view override(IStaking) returns (uint256) {
    return StakingLib.getStorage().gse.DEPOSIT_AMOUNT();
  }

  function getExitDelay() external view override(IStaking) returns (Timestamp) {
    return StakingLib.getStorage().exitDelay;
  }

  function getGSE() external view override(IStaking) returns (GSE) {
    return StakingLib.getStorage().gse;
  }

  function getManaTarget() external view override(IRollup) returns (uint256) {
    return FeeLib.getStorage().manaTarget;
  }

  function getManaLimit() external view override(IRollup) returns (uint256) {
    return FeeLib.getManaLimit();
  }

  function getTips() external view override(IRollup) returns (ChainTips memory) {
    return STFLib.getStorage().tips;
  }

  function status(uint256 _myHeaderBlockNumber)
    external
    view
    override(IRollup)
    returns (
      uint256 provenBlockNumber,
      bytes32 provenArchive,
      uint256 pendingBlockNumber,
      bytes32 pendingArchive,
      bytes32 archiveOfMyBlock,
      Epoch provenEpochNumber
    )
  {
    RollupStore storage rollupStore = STFLib.getStorage();
    return (
      rollupStore.tips.provenBlockNumber,
      rollupStore.blocks[rollupStore.tips.provenBlockNumber].archive,
      rollupStore.tips.pendingBlockNumber,
      rollupStore.blocks[rollupStore.tips.pendingBlockNumber].archive,
      archiveAt(_myHeaderBlockNumber),
      getEpochForBlock(rollupStore.tips.provenBlockNumber)
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
    return ExtRollupLib.getEpochProofPublicInputs(_start, _end, _args, _fees, _blobPublicInputs);
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
    return ExtRollupLib.validateBlobs(_blobsInput, checkBlob);
  }

  /**
   * @notice  Get the current archive root
   *
   * @return bytes32 - The current archive root
   */
  function archive() external view override(IRollup) returns (bytes32) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return rollupStore.blocks[rollupStore.tips.pendingBlockNumber].archive;
  }

  function getProvenBlockNumber() external view override(IRollup) returns (uint256) {
    return STFLib.getStorage().tips.provenBlockNumber;
  }

  function getPendingBlockNumber() external view override(IRollup) returns (uint256) {
    return STFLib.getStorage().tips.pendingBlockNumber;
  }

  function getBlock(uint256 _blockNumber) external view override(IRollup) returns (BlockLog memory) {
    RollupStore storage rollupStore = STFLib.getStorage();
    require(
      _blockNumber <= rollupStore.tips.pendingBlockNumber,
      Errors.Rollup__InvalidBlockNumber(rollupStore.tips.pendingBlockNumber, _blockNumber)
    );
    return rollupStore.blocks[_blockNumber];
  }

  function getFeeHeader(uint256 _blockNumber)
    external
    view
    override(IRollup)
    returns (FeeHeader memory)
  {
    return FeeHeaderLib.decompress(FeeLib.getStorage().feeHeaders[_blockNumber]);
  }

  function getBlobCommitmentsHash(uint256 _blockNumber)
    external
    view
    override(IRollup)
    returns (bytes32)
  {
    return STFLib.getStorage().blocks[_blockNumber].blobCommitmentsHash;
  }

  function getCurrentBlobCommitmentsHash() external view override(IRollup) returns (bytes32) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return rollupStore.blocks[rollupStore.tips.pendingBlockNumber].blobCommitmentsHash;
  }

  function getConfig(address _attester)
    external
    view
    override(IStaking)
    returns (AttesterConfig memory)
  {
    return StakingLib.getConfig(_attester);
  }

  function getExit(address _attester) external view override(IStaking) returns (Exit memory) {
    return StakingLib.getExit(_attester);
  }

  function getStatus(address _attester) external view override(IStaking) returns (Status) {
    return StakingLib.getStatus(_attester);
  }

  function getAttesterView(address _attester)
    external
    view
    override(IStaking)
    returns (AttesterView memory)
  {
    return StakingLib.getAttesterView(_attester);
  }

  function getActivityScore(address _prover)
    external
    view
    override(IRollup)
    returns (ActivityScore memory)
  {
    return RewardLib.getActivityScore(_prover);
  }

  function getSharesFor(address _prover) external view override(IRollup) returns (uint256) {
    return RewardLib.toShares(_prover);
  }

  /**
   * @notice  Get the sample seed for a given timestamp
   *
   * @param _ts - The timestamp to get the sample seed for
   *
   * @return The sample seed for the given timestamp
   */
  function getSampleSeedAt(Timestamp _ts)
    external
    view
    override(IValidatorSelection)
    returns (uint256)
  {
    return ExtRollupLib2.getSampleSeedAt(getEpochAt(_ts));
  }

  /**
   * @notice  Get the sample seed for the current epoch
   *
   * @return The sample seed for the current epoch
   */
  function getCurrentSampleSeed() external view override(IValidatorSelection) returns (uint256) {
    return ExtRollupLib2.getSampleSeedAt(getCurrentEpoch());
  }

  /**
   * @notice  Get the attester set
   *
   * @dev     Consider removing this to replace with a `size` and individual getter.
   *
   * @return The validator set
   */
  function getAttesters() external view override(IValidatorSelection) returns (address[] memory) {
    return StakingLib.getAttestersAtTime(Timestamp.wrap(block.timestamp));
  }

  /**
   * @notice  Get the current slot number
   *
   * @return The current slot number
   */
  function getCurrentSlot() external view override(IEmporer) returns (Slot) {
    return Timestamp.wrap(block.timestamp).slotFromTimestamp();
  }

  /**
   * @notice  Get the timestamp for a given slot
   *
   * @param _slotNumber - The slot number to get the timestamp for
   *
   * @return The timestamp for the given slot
   */
  function getTimestampForSlot(Slot _slotNumber)
    external
    view
    override(IValidatorSelection)
    returns (Timestamp)
  {
    return _slotNumber.toTimestamp();
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
  function getEpochAtSlot(Slot _slotNumber)
    external
    view
    override(IValidatorSelection)
    returns (Epoch)
  {
    return _slotNumber.epochFromSlot();
  }

  function getProofSubmissionWindow() external view override(IRollup) returns (uint256) {
    return STFLib.getStorage().config.proofSubmissionWindow;
  }

  function getSequencerRewards(address _sequencer)
    external
    view
    override(IRollup)
    returns (uint256)
  {
    return RewardLib.getSequencerRewards(_sequencer);
  }

  function getCollectiveProverRewardsForEpoch(Epoch _epoch)
    external
    view
    override(IRollup)
    returns (uint256)
  {
    return RewardLib.getCollectiveProverRewardsForEpoch(_epoch);
  }

  /**
   * @notice  Get the rewards for a specific prover for a given epoch
   *          BEWARE! If the epoch is not past its deadline, this value is the "current" value
   *          and could change if a provers proves a longer series of blocks.
   *
   * @param _epoch - The epoch to get the rewards for
   * @param _prover - The prover to get the rewards for
   *
   * @return The rewards for the specific prover for the given epoch
   */
  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover)
    external
    view
    override(IRollup)
    returns (uint256)
  {
    return RewardLib.getSpecificProverRewardsForEpoch(_epoch, _prover);
  }

  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover)
    external
    view
    override(IRollup)
    returns (bool)
  {
    return RewardLib.getHasSubmitted(_epoch, _length, _prover);
  }

  function getHasClaimed(address _prover, Epoch _epoch)
    external
    view
    override(IRollup)
    returns (bool)
  {
    return RewardLib.getHasClaimed(_prover, _epoch);
  }

  function getProvingCostPerManaInEth() external view override(IRollup) returns (EthValue) {
    return FeeLib.getStorage().provingCostPerMana;
  }

  function getProvingCostPerManaInFeeAsset()
    external
    view
    override(IRollup)
    returns (FeeAssetValue)
  {
    return FeeLib.getStorage().provingCostPerMana.toFeeAsset(getFeeAssetPerEth());
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

  function getRewardDistributor() external view override(IRollup) returns (IRewardDistributor) {
    return STFLib.getStorage().config.rewardDistributor;
  }

  function getL1FeesAt(Timestamp _timestamp)
    external
    view
    override(IRollup)
    returns (L1FeeData memory)
  {
    return FeeLib.getL1FeesAt(_timestamp);
  }

  function canPruneAtTime(Timestamp _ts) external view override(IRollup) returns (bool) {
    return STFLib.canPruneAtTime(_ts);
  }

  function getRewardConfig() external view override(IRollup) returns (RewardConfig memory) {
    return RewardLib.getStorage().config;
  }

  function getBurnAddress() external pure override(IRollup) returns (address) {
    return RewardLib.BURN_ADDRESS;
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
  function getEpochCommittee(Epoch _epoch)
    public
    override(IValidatorSelection)
    returns (address[] memory)
  {
    return ExtRollupLib2.getCommitteeAt(_epoch);
  }

  /**
   * @notice  Get the proposer for the slot at a specific timestamp
   *
   * @dev     This function is very useful for off-chain usage, as it easily allow a client to
   *          determine who will be the proposer at the NEXT ethereum block.
   *          Should not be trusted when moving beyond the current epoch, since changes to the
   *          validator set might not be reflected when we actually reach that epoch (more changes
   *          might have happened).
   *
   * @dev     The proposer is selected from the validator set of the current epoch.
   *
   * @dev     Should only be access on-chain if epoch is setup, otherwise very expensive.
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
    return ExtRollupLib2.getProposerAt(_ts.slotFromTimestamp());
  }

  /**
   * @notice  Get the attester at an index
   *
   * @param _index - The index to get the attester for
   *
   * @return The attester at the index
   */
  function getAttesterAtIndex(uint256 _index) public view override(IStaking) returns (address) {
    return StakingLib.getAttesterAtIndex(_index);
  }

  /**
   * @notice  Gets the mana base fee
   *
   * @param _inFeeAsset - Whether to return the fee in the fee asset or ETH
   *
   * @return The mana base fee
   */
  function getManaBaseFeeAt(Timestamp _timestamp, bool _inFeeAsset)
    public
    view
    override(IRollup)
    returns (uint256)
  {
    return FeeLib.summedBaseFee(getManaBaseFeeComponentsAt(_timestamp, _inFeeAsset));
  }

  function getManaBaseFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    public
    view
    override(IRollup)
    returns (ManaBaseFeeComponents memory)
  {
    return ProposeLib.getManaBaseFeeComponentsAt(_timestamp, _inFeeAsset);
  }

  /**
   * @notice  Gets the fee asset price as fee_asset / eth with 1e9 precision
   *
   * @return The fee asset price
   */
  function getFeeAssetPerEth() public view override(IRollup) returns (FeeAssetPerEthE9) {
    return FeeLib.getFeeAssetPerEthAtBlock(STFLib.getStorage().tips.pendingBlockNumber);
  }

  function getEpochForBlock(uint256 _blockNumber) public view override(IRollup) returns (Epoch) {
    return STFLib.getEpochForBlock(_blockNumber);
  }

  /**
   * @notice  Get the archive root of a specific block
   *
   * @param _blockNumber - The block number to get the archive root of
   *
   * @return bytes32 - The archive root of the block
   */
  function archiveAt(uint256 _blockNumber) public view override(IRollup) returns (bytes32) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return _blockNumber <= rollupStore.tips.pendingBlockNumber
      ? rollupStore.blocks[_blockNumber].archive
      : bytes32(0);
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
    return StakingLib.getNextFlushableEpoch();
  }
}
