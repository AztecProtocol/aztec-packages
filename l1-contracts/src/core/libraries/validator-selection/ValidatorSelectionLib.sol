// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BlockHeaderValidationFlags} from "@aztec/core/interfaces/IRollup.sol";
import {StakingStorage} from "@aztec/core/interfaces/IStaking.sol";
import {
  EpochData, ValidatorSelectionStorage
} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {SampleLib} from "@aztec/core/libraries/crypto/SampleLib.sol";
import {SignatureLib, Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {EnumerableSet} from "@oz/utils/structs/EnumerableSet.sol";

library ValidatorSelectionLib {
  using EnumerableSet for EnumerableSet.AddressSet;
  using MessageHashUtils for bytes32;
  using SignatureLib for Signature;
  using TimeLib for Timestamp;
  using TimeLib for Epoch;
  using AddressSnapshotLib for SnapshottedAddressSet;
  using Checkpoints for Checkpoints.Trace224;
  using SafeCast for *;

  bytes32 private constant VALIDATOR_SELECTION_STORAGE_POSITION =
    keccak256("aztec.validator_selection.storage");

  function initialize(uint256 _targetCommitteeSize) internal {
    ValidatorSelectionStorage storage store = getStorage();
    store.targetCommitteeSize = _targetCommitteeSize;

    // Set the sample seed for the first 2 epochs to max
    store.seeds.push(0, type(uint224).max);
    store.seeds.push(1, type(uint224).max);
  }

  /**
   * @notice  Performs a setup of an epoch if needed. The setup will
   *          - Sample the validator set for the epoch
   *          - Set the seed for the epoch after the next
   */
  function setupEpoch(StakingStorage storage _stakingStore, Epoch _epochNumber) internal {
    ValidatorSelectionStorage storage store = getStorage();

    //################ Seeds ################
    // Get the sample seed for this current epoch.
    uint224 sampleSeed = getSampleSeed(_epochNumber);

    // Set the sample seed for the next epoch if required
    // function handles the case where it is already set
    setSampleSeedForNextEpoch(_epochNumber);

    //################ Committee ################
    // If the committee is not set for this epoch, we need to sample it
    EpochData storage epoch = store.epochs[_epochNumber];
    uint256 committeeLength = epoch.committee.length;
    if (committeeLength == 0) {
      epoch.committee = sampleValidators(_stakingStore, _epochNumber, sampleSeed);
    }
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
  function verify(
    StakingStorage storage _stakingStore,
    Slot _slot,
    Epoch _epochNumber,
    Signature[] memory _signatures,
    bytes32 _digest,
    BlockHeaderValidationFlags memory _flags
  ) internal {
    // Same logic as we got in getProposerAt
    // Done do avoid duplicate computing the committee
    address[] memory committee = getCommitteeAt(_stakingStore, _epochNumber);
    address attester = committee.length == 0
      ? address(0)
      : committee[computeProposerIndex(
        _epochNumber, _slot, getSampleSeed(_epochNumber), committee.length
      )];
    address proposer = _stakingStore.info[attester].proposer;

    // @todo Consider getting rid of this option.
    // If the proposer is open, we allow anyone to propose without needing any signatures
    if (proposer == address(0)) {
      return;
    }

    require(
      proposer == msg.sender, Errors.ValidatorSelection__InvalidProposer(proposer, msg.sender)
    );

    if (_flags.ignoreSignatures) {
      return;
    }

    uint256 needed = committee.length * 2 / 3 + 1;
    require(
      _signatures.length >= needed,
      Errors.ValidatorSelection__InsufficientAttestationsProvided(needed, _signatures.length)
    );

    // Validate the attestations
    uint256 validAttestations = 0;

    bytes32 digest = _digest.toEthSignedMessageHash();
    for (uint256 i = 0; i < _signatures.length; i++) {
      // To avoid stack too deep errors
      Signature memory signature = _signatures[i];
      if (signature.isEmpty) {
        continue;
      }

      // The verification will throw if invalid
      signature.verify(committee[i], digest);
      validAttestations++;
    }

    require(
      validAttestations >= needed,
      Errors.ValidatorSelection__InsufficientAttestations(needed, validAttestations)
    );
  }

  function getProposerAt(StakingStorage storage _stakingStore, Slot _slot, Epoch _epochNumber)
    internal
    returns (address)
  {
    // @note this is deliberately "bad" for the simple reason of code reduction.
    //       it does not need to actually return the full committee and then draw from it
    //       it can just return the proposer directly, but then we duplicate the code
    //       which we just don't have room for right now...
    address[] memory committee = getCommitteeAt(_stakingStore, _epochNumber);
    if (committee.length == 0) {
      return address(0);
    }

    address attester = committee[computeProposerIndex(
      _epochNumber, _slot, getSampleSeed(_epochNumber), committee.length
    )];

    return _stakingStore.info[attester].proposer;
  }

  /**
   * @notice  Samples a validator set for a specific epoch
   *
   * @dev     Only used internally, should never be called for anything but the "next" epoch
   *          Allowing us to always use `lastSeed`.
   *
   * @return The validators for the given epoch
   */
  function sampleValidators(StakingStorage storage _stakingStore, Epoch _epoch, uint224 _seed)
    internal
    returns (address[] memory)
  {
    ValidatorSelectionStorage storage store = getStorage();
    // We do -1, as the snapshots practically happen at the end of the block, e.g.,
    // a tx manipulating the set in at $t$ would be visible already at lookup $t$ if after that
    // transactions. But reading at $t-1$ would be the state at the end of $t-1$ which is the state
    // as we "start" time $t$. We then shift that back by an entire L2 epoch to guarantee
    // we are not hit by last-minute changes or L1 reorgs when syncing validators from our clients.
    uint32 ts = Timestamp.unwrap(_epoch.toTimestamp()).toUint32()
      - uint32(TimeLib.getEpochDurationInSeconds()) - 1;
    uint256 validatorSetSize = _stakingStore.attesters.lengthAtTimestamp(ts);

    if (validatorSetSize == 0) {
      return new address[](0);
    }

    uint256 targetCommitteeSize = store.targetCommitteeSize;

    // If we have less validators than the target committee size, we just return the full set
    if (validatorSetSize <= targetCommitteeSize) {
      return _stakingStore.attesters.valuesAtTimestamp(ts);
    }

    uint256[] memory indices =
      SampleLib.computeCommittee(targetCommitteeSize, validatorSetSize, _seed);

    address[] memory committee = new address[](targetCommitteeSize);
    for (uint256 i = 0; i < targetCommitteeSize; i++) {
      committee[i] = _stakingStore.attesters.getAddressFromIndexAtTimestamp(indices[i], ts);
    }
    return committee;
  }

  /**
   * @notice  Get the committee for an epoch
   *
   * @param _epochNumber - The epoch to get the committee for
   *
   * @return The committee for the epoch
   */
  function getCommitteeAt(StakingStorage storage _stakingStore, Epoch _epochNumber)
    internal
    returns (address[] memory)
  {
    ValidatorSelectionStorage storage store = getStorage();
    EpochData storage epoch = store.epochs[_epochNumber];

    // If the committe is already set, just return that, otherwise need to sample
    if (epoch.committee.length > 0) {
      return epoch.committee;
    }
    return sampleValidators(_stakingStore, _epochNumber, getSampleSeed(_epochNumber));
  }

  /**
   * @notice  Sets the sample seed for the epoch after the next
   *
   * @param _epoch - The epoch to set the sample seed for
   */
  function setSampleSeedForNextEpoch(Epoch _epoch) internal {
    setSampleSeedForEpoch(_epoch + Epoch.wrap(2));
  }

  /**
   * @notice  Sets the sample seed for an epoch
   *
   * @param _epoch - The epoch to set the sample seed for
   */
  function setSampleSeedForEpoch(Epoch _epoch) internal {
    ValidatorSelectionStorage storage store = getStorage();
    uint32 epoch = Epoch.unwrap(_epoch).toUint32();

    // Check if the latest checkpoint is for the next epoch
    // It should be impossible that zero epoch snapshots exist, as in the genesis state we push the first sample seed into the store
    (, uint32 mostRecentSeedEpoch,) = store.seeds.latestCheckpoint();

    // If the sample seed for the next epoch is already set, we can skip the computation
    if (mostRecentSeedEpoch == epoch) {
      return;
    }

    // If the most recently stored seed is less than the epoch we are querying, then we need to compute it's seed for later use
    if (mostRecentSeedEpoch < epoch) {
      // Compute the sample seed for the next epoch
      uint224 nextSeed = computeNextSeed(_epoch);
      store.seeds.push(epoch, nextSeed);
    }
  }

  /**
   * @notice  Get the sample seed for an epoch
   *
   * @dev     This should behave as walking past the line, but it does not currently do that.
   *          If there are entire skips, e.g., 1, 2, 5 and we then go back and try executing
   *          for 4 we will get an invalid value because we will read lastSeed which is from 5.
   *
   * @dev     The `_epoch` will never be 0 nor in the future
   *
   * @dev     The return value will be equal to keccak256(n, block.prevrandao) for n being the
   *          penultimate epoch setup.
   *
   * @return The sample seed for the epoch
   */
  function getSampleSeed(Epoch _epoch) internal view returns (uint224) {
    ValidatorSelectionStorage storage store = getStorage();
    uint224 sampleSeed = store.seeds.upperLookup(Epoch.unwrap(_epoch).toUint32());
    if (sampleSeed == 0) {
      sampleSeed = type(uint224).max;
    }
    return sampleSeed;
  }

  function getStorage() internal pure returns (ValidatorSelectionStorage storage storageStruct) {
    bytes32 position = VALIDATOR_SELECTION_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
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
  function computeNextSeed(Epoch _epoch) private view returns (uint224) {
    // Allow for unsafe (lossy) downcast as we do not care if we loose bits
    return uint224(uint256(keccak256(abi.encode(_epoch, block.prevrandao))));
  }

  /**
   * @notice  Computes the index of the committee member that acts as proposer for a given slot
   *
   * @param _epoch - The epoch to compute the proposer index for
   * @param _slot - The slot to compute the proposer index for
   * @param _seed - The seed to use for the computation
   * @param _size - The size of the committee
   *
   * @return The index of the proposer
   */
  function computeProposerIndex(Epoch _epoch, Slot _slot, uint256 _seed, uint256 _size)
    private
    pure
    returns (uint256)
  {
    return uint256(keccak256(abi.encode(_epoch, _slot, _seed))) % _size;
  }
}
