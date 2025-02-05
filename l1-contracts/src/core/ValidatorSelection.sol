// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IStaking, ValidatorInfo, Exit, OperatorInfo} from "@aztec/core/interfaces/IStaking.sol";
import {
  IValidatorSelection,
  EpochData,
  ValidatorSelectionStorage
} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingLib} from "@aztec/core/libraries/staking/StakingLib.sol";
import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";
import {ValidatorSelectionLib} from
  "@aztec/core/libraries/ValidatorSelectionLib/ValidatorSelectionLib.sol";
import {Slasher} from "@aztec/core/staking/Slasher.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {EnumerableSet} from "@oz/utils/structs/EnumerableSet.sol";

/**
 * @title   Validator Selection
 *
 * @dev     Validator Selection has one thing in mind, he provide a reference of the LOGIC going on for the spartan selection.
 *          It is a reference implementation, it is not optimized for gas.
 *
 */
contract ValidatorSelection is IValidatorSelection, IStaking {
  using EnumerableSet for EnumerableSet.AddressSet;

  using SlotLib for Slot;
  using EpochLib for Epoch;
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  // The target number of validators in a committee
  // @todo #8021
  uint256 public immutable TARGET_COMMITTEE_SIZE;

  ValidatorSelectionStorage private validatorSelectionStore;

  constructor(
    IERC20 _stakingAsset,
    uint256 _minimumStake,
    uint256 _slashingQuorum,
    uint256 _roundSize,
    uint256 _slotDuration,
    uint256 _epochDuration,
    uint256 _targetCommitteeSize
  ) {
    TARGET_COMMITTEE_SIZE = _targetCommitteeSize;

    TimeLib.initialize(block.timestamp, _slotDuration, _epochDuration);

    Timestamp exitDelay = Timestamp.wrap(60 * 60 * 24);
    Slasher slasher = new Slasher(_slashingQuorum, _roundSize);
    StakingLib.initialize(_stakingAsset, _minimumStake, exitDelay, address(slasher));
  }

  function deposit(address _attester, address _proposer, address _withdrawer, uint256 _amount)
    external
    override(IStaking)
  {
    setupEpoch();
    require(
      _attester != address(0) && _proposer != address(0),
      Errors.ValidatorSelection__InvalidDeposit(_attester, _proposer)
    );
    StakingLib.deposit(_attester, _proposer, _withdrawer, _amount);
  }

  function initiateWithdraw(address _attester, address _recipient)
    external
    override(IStaking)
    returns (bool)
  {
    // @note The attester might be chosen for the epoch, so the delay must be long enough
    //       to allow for that.
    setupEpoch();
    return StakingLib.initiateWithdraw(_attester, _recipient);
  }

  function finaliseWithdraw(address _attester) external override(IStaking) {
    StakingLib.finaliseWithdraw(_attester);
  }

  function slash(address _attester, uint256 _amount) external override(IStaking) {
    StakingLib.slash(_attester, _amount);
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
    return StakingLib.getStorage().minimumStake;
  }

  function getExitDelay() external view override(IStaking) returns (Timestamp) {
    return StakingLib.getStorage().exitDelay;
  }

  function getActiveAttesterCount() external view override(IStaking) returns (uint256) {
    return StakingLib.getStorage().attesters.length();
  }

  function getProposerForAttester(address _attester)
    external
    view
    override(IStaking)
    returns (address)
  {
    return StakingLib.getStorage().info[_attester].proposer;
  }

  function getAttesterAtIndex(uint256 _index) external view override(IStaking) returns (address) {
    return StakingLib.getStorage().attesters.at(_index);
  }

  function getProposerAtIndex(uint256 _index) external view override(IStaking) returns (address) {
    return StakingLib.getStorage().info[StakingLib.getStorage().attesters.at(_index)].proposer;
  }

  function getInfo(address _attester)
    external
    view
    override(IStaking)
    returns (ValidatorInfo memory)
  {
    return StakingLib.getStorage().info[_attester];
  }

  function getExit(address _attester) external view override(IStaking) returns (Exit memory) {
    return StakingLib.getStorage().exits[_attester];
  }

  function getOperatorAtIndex(uint256 _index)
    external
    view
    override(IStaking)
    returns (OperatorInfo memory)
  {
    address attester = StakingLib.getStorage().attesters.at(_index);
    return
      OperatorInfo({proposer: StakingLib.getStorage().info[attester].proposer, attester: attester});
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
    external
    view
    override(IValidatorSelection)
    returns (address[] memory)
  {
    return validatorSelectionStore.epochs[_epoch].committee;
  }

  /**
   * @notice  Get the validator set for the current epoch
   * @return The validator set for the current epoch
   */
  function getCurrentEpochCommittee()
    external
    view
    override(IValidatorSelection)
    returns (address[] memory)
  {
    return ValidatorSelectionLib.getCommitteeAt(
      validatorSelectionStore, StakingLib.getStorage(), getCurrentEpoch(), TARGET_COMMITTEE_SIZE
    );
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
    view
    override(IValidatorSelection)
    returns (address[] memory)
  {
    return ValidatorSelectionLib.getCommitteeAt(
      validatorSelectionStore, StakingLib.getStorage(), getEpochAt(_ts), TARGET_COMMITTEE_SIZE
    );
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
    return ValidatorSelectionLib.getSampleSeed(validatorSelectionStore, getEpochAt(_ts));
  }

  /**
   * @notice  Get the sample seed for the current epoch
   *
   * @return The sample seed for the current epoch
   */
  function getCurrentSampleSeed() external view override(IValidatorSelection) returns (uint256) {
    return ValidatorSelectionLib.getSampleSeed(validatorSelectionStore, getCurrentEpoch());
  }

  /**
   * @notice  Performs a setup of an epoch if needed. The setup will
   *          - Sample the validator set for the epoch
   *          - Set the seed for the epoch
   *          - Update the last seed
   *
   * @dev     Since this is a reference optimising for simplicity, we ValidatorSelectionStore the actual validator set in the epoch structure.
   *          This is very heavy on gas, so start crying because the gas here will melt the poles
   *          https://i.giphy.com/U1aN4HTfJ2SmgB2BBK.webp
   */
  function setupEpoch() public override(IValidatorSelection) {
    Epoch epochNumber = getCurrentEpoch();
    EpochData storage epoch = validatorSelectionStore.epochs[epochNumber];

    if (epoch.sampleSeed == 0) {
      epoch.sampleSeed = ValidatorSelectionLib.getSampleSeed(validatorSelectionStore, epochNumber);
      epoch.nextSeed = validatorSelectionStore.lastSeed = _computeNextSeed(epochNumber);
      epoch.committee = ValidatorSelectionLib.sampleValidators(
        StakingLib.getStorage(), epoch.sampleSeed, TARGET_COMMITTEE_SIZE
      );
    }
  }

  /**
   * @notice  Get the attester set
   *
   * @dev     Consider removing this to replace with a `size` and individual getter.
   *
   * @return The validator set
   */
  function getAttesters() public view override(IValidatorSelection) returns (address[] memory) {
    return StakingLib.getStorage().attesters.values();
  }

  /**
   * @notice  Get the current epoch number
   *
   * @return The current epoch number
   */
  function getCurrentEpoch() public view override(IValidatorSelection) returns (Epoch) {
    return getEpochAt(Timestamp.wrap(block.timestamp));
  }

  /**
   * @notice  Get the current slot number
   *
   * @return The current slot number
   */
  function getCurrentSlot() public view override(IValidatorSelection) returns (Slot) {
    return getSlotAt(Timestamp.wrap(block.timestamp));
  }

  /**
   * @notice  Get the timestamp for a given slot
   *
   * @param _slotNumber - The slot number to get the timestamp for
   *
   * @return The timestamp for the given slot
   */
  function getTimestampForSlot(Slot _slotNumber)
    public
    view
    override(IValidatorSelection)
    returns (Timestamp)
  {
    return _slotNumber.toTimestamp();
  }

  /**
   * @notice  Get the proposer for the current slot
   *
   * @dev     Calls `getCurrentProposer(uint256)` with the current timestamp
   *
   * @return The address of the proposer
   */
  function getCurrentProposer() public view override(IValidatorSelection) returns (address) {
    return getProposerAt(Timestamp.wrap(block.timestamp));
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
  function getProposerAt(Timestamp _ts) public view override(IValidatorSelection) returns (address) {
    Slot slot = getSlotAt(_ts);
    Epoch epochNumber = getEpochAtSlot(slot);
    return ValidatorSelectionLib.getProposerAt(
      validatorSelectionStore, StakingLib.getStorage(), slot, epochNumber, TARGET_COMMITTEE_SIZE
    );
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
   * @notice  Computes the slot at a specific time
   *
   * @param _ts - The timestamp to compute the slot for
   *
   * @return The computed slot
   */
  function getSlotAt(Timestamp _ts) public view override(IValidatorSelection) returns (Slot) {
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
    public
    view
    override(IValidatorSelection)
    returns (Epoch)
  {
    return _slotNumber.epochFromSlot();
  }

  // Can be used to add validators without setting up the epoch, useful for the initial set.
  function _cheat__Deposit(
    address _attester,
    address _proposer,
    address _withdrawer,
    uint256 _amount
  ) internal {
    require(
      _attester != address(0) && _proposer != address(0),
      Errors.ValidatorSelection__InvalidDeposit(_attester, _proposer)
    );

    StakingLib.deposit(_attester, _proposer, _withdrawer, _amount);
  }

  /**
   * @notice  Propose a pending block from the point-of-view of sequencer selection. Will:
   *          - Setup the epoch if needed (if epoch committee is empty skips the rest)
   *          - Validate that the proposer is the proposer of the slot
   *          - Validate that the signatures for attestations are indeed from the validatorset
   *          - Validate that the number of valid attestations is sufficient
   *
   * @dev     Cases where errors are thrown:
   *          - If the epoch is not setup
   *          - If the proposer is not the real proposer AND the proposer is not open
   *          - If the number of valid attestations is insufficient
   *
   * @param _slot - The slot of the block
   * @param _signatures - The signatures of the committee members
   * @param _digest - The digest of the block
   */
  function _validateValidatorSelection(
    Slot _slot,
    Signature[] memory _signatures,
    bytes32 _digest,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    Epoch epochNumber = getEpochAtSlot(_slot);
    ValidatorSelectionLib.validateValidatorSelection(
      validatorSelectionStore,
      StakingLib.getStorage(),
      _slot,
      epochNumber,
      _signatures,
      _digest,
      _flags,
      TARGET_COMMITTEE_SIZE
    );
  }

  /**
   * @notice  Computes the nextSeed for an epoch
   *
   * @dev     We include the `_epoch` instead of using the randao directly to avoid issues with foundry testing
   *          where randao == 0.
   *
   * @param _epoch - The epoch to compute the seed for
   *
   * @return The computed seed
   */
  function _computeNextSeed(Epoch _epoch) private view returns (uint256) {
    return uint256(keccak256(abi.encode(_epoch, block.prevrandao)));
  }
}
