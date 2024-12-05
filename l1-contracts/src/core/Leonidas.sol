// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ILeonidas, EpochData, LeonidasStorage} from "@aztec/core/interfaces/ILeonidas.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {LeonidasLib} from "@aztec/core/libraries/LeonidasLib/LeonidasLib.sol";
import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeFns
} from "@aztec/core/libraries/TimeMath.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {EnumerableSet} from "@oz/utils/structs/EnumerableSet.sol";

/**
 * @title   Leonidas
 * @author  Anaxandridas II
 * @notice  Leonidas is the spartan king, it is his job to select the warriors progressing the state of the kingdom.
 *          He define the structure needed for committee and leader selection and provides logic for validating that
 *          the block and its "evidence" follows his rules.
 *
 * @dev     Leonidas is depending on Ares to add/remove warriors to/from his army competently.
 *
 * @dev     Leonidas have one thing in mind, he provide a reference of the LOGIC going on for the spartan selection.
 *          He is not concerned about gas costs, he is a king, he just throw gas in the air like no-one cares.
 *          It will be the duty of his successor (Pleistarchus) to optimize the costs with same functionality.
 *
 */
contract Leonidas is Ownable, TimeFns, ILeonidas {
  using EnumerableSet for EnumerableSet.AddressSet;
  using LeonidasLib for LeonidasStorage;

  using SlotLib for Slot;
  using EpochLib for Epoch;

  // The target number of validators in a committee
  // @todo #8021
  uint256 public immutable TARGET_COMMITTEE_SIZE;

  // The time that the contract was deployed
  Timestamp public immutable GENESIS_TIME;

  LeonidasStorage private store;

  constructor(
    address _ares,
    uint256 _slotDuration,
    uint256 _epochDuration,
    uint256 _targetCommitteeSize
  ) Ownable(_ares) TimeFns(_slotDuration, _epochDuration) {
    GENESIS_TIME = Timestamp.wrap(block.timestamp);
    SLOT_DURATION = _slotDuration;
    EPOCH_DURATION = _epochDuration;
    TARGET_COMMITTEE_SIZE = _targetCommitteeSize;
  }

  /**
   * @notice  Adds a validator to the validator set
   *
   * @dev     Only ARES can add validators
   *
   * @dev     Will setup the epoch if needed BEFORE adding the validator.
   *          This means that the validator will effectively be added to the NEXT epoch.
   *
   * @param _validator - The validator to add
   */
  function addValidator(address _validator) external override(ILeonidas) onlyOwner {
    setupEpoch();
    _addValidator(_validator);
  }

  /**
   * @notice  Removes a validator from the validator set
   *
   * @dev     Only ARES can add validators
   *
   * @dev     Will setup the epoch if needed BEFORE removing the validator.
   *          This means that the validator will effectively be removed from the NEXT epoch.
   *
   * @param _validator - The validator to remove
   */
  function removeValidator(address _validator) external override(ILeonidas) onlyOwner {
    setupEpoch();
    store.validatorSet.remove(_validator);
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
    override(ILeonidas)
    returns (address[] memory)
  {
    return store.epochs[_epoch].committee;
  }

  /**
   * @notice  Get the validator set for the current epoch
   * @return The validator set for the current epoch
   */
  function getCurrentEpochCommittee() external view override(ILeonidas) returns (address[] memory) {
    return store.getCommitteeAt(getCurrentEpoch(), TARGET_COMMITTEE_SIZE);
  }

  /**
   * @notice  Get the validator set
   *
   * @dev     Consider removing this to replace with a `size` and individual getter.
   *
   * @return The validator set
   */
  function getValidators() external view override(ILeonidas) returns (address[] memory) {
    return store.validatorSet.values();
  }

  /**
   * @notice  Performs a setup of an epoch if needed. The setup will
   *          - Sample the validator set for the epoch
   *          - Set the seed for the epoch
   *          - Update the last seed
   *
   * @dev     Since this is a reference optimising for simplicity, we store the actual validator set in the epoch structure.
   *          This is very heavy on gas, so start crying because the gas here will melt the poles
   *          https://i.giphy.com/U1aN4HTfJ2SmgB2BBK.webp
   */
  function setupEpoch() public override(ILeonidas) {
    Epoch epochNumber = getCurrentEpoch();
    EpochData storage epoch = store.epochs[epochNumber];

    if (epoch.sampleSeed == 0) {
      epoch.sampleSeed = store.getSampleSeed(epochNumber);
      epoch.nextSeed = store.lastSeed = _computeNextSeed(epochNumber);

      epoch.committee = store.sampleValidators(epoch.sampleSeed, TARGET_COMMITTEE_SIZE);
    }
  }

  /**
   * @notice  Get the number of validators in the validator set
   *
   * @return The number of validators in the validator set
   */
  function getValidatorCount() public view override(ILeonidas) returns (uint256) {
    return store.validatorSet.length();
  }

  /**
   * @notice  Get the number of validators in the validator set
   *
   * @return The number of validators in the validator set
   */
  function getValidatorAt(uint256 _index) public view override(ILeonidas) returns (address) {
    return store.validatorSet.at(_index);
  }

  /**
   * @notice  Checks if an address is in the validator set
   *
   * @param _validator - The address to check
   *
   * @return True if the address is in the validator set, false otherwise
   */
  function isValidator(address _validator) public view override(ILeonidas) returns (bool) {
    return store.validatorSet.contains(_validator);
  }

  /**
   * @notice  Get the current epoch number
   *
   * @return The current epoch number
   */
  function getCurrentEpoch() public view override(ILeonidas) returns (Epoch) {
    return getEpochAt(Timestamp.wrap(block.timestamp));
  }

  /**
   * @notice  Get the current slot number
   *
   * @return The current slot number
   */
  function getCurrentSlot() public view override(ILeonidas) returns (Slot) {
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
    override(ILeonidas)
    returns (Timestamp)
  {
    return GENESIS_TIME + toTimestamp(_slotNumber);
  }

  /**
   * @notice  Get the proposer for the current slot
   *
   * @dev     Calls `getCurrentProposer(uint256)` with the current timestamp
   *
   * @return The address of the proposer
   */
  function getCurrentProposer() public view override(ILeonidas) returns (address) {
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
  function getProposerAt(Timestamp _ts) public view override(ILeonidas) returns (address) {
    Slot slot = getSlotAt(_ts);
    Epoch epochNumber = getEpochAtSlot(slot);
    return store.getProposerAt(slot, epochNumber, TARGET_COMMITTEE_SIZE);
  }

  /**
   * @notice  Computes the epoch at a specific time
   *
   * @param _ts - The timestamp to compute the epoch for
   *
   * @return The computed epoch
   */
  function getEpochAt(Timestamp _ts) public view override(ILeonidas) returns (Epoch) {
    return _ts < GENESIS_TIME ? Epoch.wrap(0) : epochFromTimestamp(_ts - GENESIS_TIME);
  }

  /**
   * @notice  Computes the slot at a specific time
   *
   * @param _ts - The timestamp to compute the slot for
   *
   * @return The computed slot
   */
  function getSlotAt(Timestamp _ts) public view override(ILeonidas) returns (Slot) {
    return _ts < GENESIS_TIME ? Slot.wrap(0) : slotFromTimestamp(_ts - GENESIS_TIME);
  }

  /**
   * @notice  Computes the epoch at a specific slot
   *
   * @param _slotNumber - The slot number to compute the epoch for
   *
   * @return The computed epoch
   */
  function getEpochAtSlot(Slot _slotNumber) public view override(ILeonidas) returns (Epoch) {
    return Epoch.wrap(_slotNumber.unwrap() / EPOCH_DURATION);
  }

  /**
   * @notice  Adds a validator to the set WITHOUT setting up the epoch
   * @param _validator - The validator to add
   */
  function _addValidator(address _validator) internal {
    store.validatorSet.add(_validator);
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
  function _validateLeonidas(
    Slot _slot,
    Signature[] memory _signatures,
    bytes32 _digest,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    Epoch epochNumber = getEpochAtSlot(_slot);
    store.validateLeonidas(_slot, epochNumber, _signatures, _digest, _flags, TARGET_COMMITTEE_SIZE);
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
