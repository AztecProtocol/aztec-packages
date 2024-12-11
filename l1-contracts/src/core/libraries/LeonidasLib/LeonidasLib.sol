// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {EpochData, LeonidasStorage} from "@aztec/core/interfaces/ILeonidas.sol";
import {StakingStorage} from "@aztec/core/interfaces/IStaking.sol";
import {SampleLib} from "@aztec/core/libraries/crypto/SampleLib.sol";
import {SignatureLib, Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {EnumerableSet} from "@oz/utils/structs/EnumerableSet.sol";

library LeonidasLib {
  using EnumerableSet for EnumerableSet.AddressSet;
  using MessageHashUtils for bytes32;
  using SignatureLib for Signature;

  /**
   * @notice  Samples a validator set for a specific epoch
   *
   * @dev     Only used internally, should never be called for anything but the "next" epoch
   *          Allowing us to always use `lastSeed`.
   *
   * @return The validators for the given epoch
   */
  function sampleValidators(
    StakingStorage storage _stakingStore,
    uint256 _seed,
    uint256 _targetCommitteeSize
  ) external view returns (address[] memory) {
    return _sampleValidators(_stakingStore, _seed, _targetCommitteeSize);
  }

  function getProposerAt(
    LeonidasStorage storage _leonidasStore,
    StakingStorage storage _stakingStore,
    Slot _slot,
    Epoch _epochNumber,
    uint256 _targetCommitteeSize
  ) external view returns (address) {
    return _getProposerAt(_leonidasStore, _stakingStore, _slot, _epochNumber, _targetCommitteeSize);
  }

  function getCommitteeAt(
    LeonidasStorage storage _leonidasStore,
    StakingStorage storage _stakingStore,
    Epoch _epochNumber,
    uint256 _targetCommitteeSize
  ) external view returns (address[] memory) {
    return _getCommitteeAt(_leonidasStore, _stakingStore, _epochNumber, _targetCommitteeSize);
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
  function validateLeonidas(
    LeonidasStorage storage _leonidasStore,
    StakingStorage storage _stakingStore,
    Slot _slot,
    Epoch _epochNumber,
    Signature[] memory _signatures,
    bytes32 _digest,
    DataStructures.ExecutionFlags memory _flags,
    uint256 _targetCommitteeSize
  ) external view {
    // Same logic as we got in getProposerAt
    // Done do avoid duplicate computing the committee
    address[] memory committee =
      _getCommitteeAt(_leonidasStore, _stakingStore, _epochNumber, _targetCommitteeSize);
    address attester = committee.length == 0
      ? address(0)
      : committee[computeProposerIndex(
        _epochNumber, _slot, getSampleSeed(_leonidasStore, _epochNumber), committee.length
      )];
    address proposer = _stakingStore.info[attester].proposer;

    // @todo Consider getting rid of this option.
    // If the proposer is open, we allow anyone to propose without needing any signatures
    if (proposer == address(0)) {
      return;
    }

    // @todo We should allow to provide a signature instead of needing the proposer to broadcast.
    require(proposer == msg.sender, Errors.Leonidas__InvalidProposer(proposer, msg.sender));

    if (_flags.ignoreSignatures) {
      return;
    }

    uint256 needed = committee.length * 2 / 3 + 1;
    require(
      _signatures.length >= needed,
      Errors.Leonidas__InsufficientAttestationsProvided(needed, _signatures.length)
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
      Errors.Leonidas__InsufficientAttestations(needed, validAttestations)
    );
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
   * @dev     The return value will be equal to keccak256(n, block.prevrandao) for n being the last epoch
   *          setup.
   *
   * @return The sample seed for the epoch
   */
  function getSampleSeed(LeonidasStorage storage _leonidasStore, Epoch _epoch)
    internal
    view
    returns (uint256)
  {
    if (Epoch.unwrap(_epoch) == 0) {
      return type(uint256).max;
    }
    uint256 sampleSeed = _leonidasStore.epochs[_epoch].sampleSeed;
    if (sampleSeed != 0) {
      return sampleSeed;
    }

    sampleSeed = _leonidasStore.epochs[_epoch - Epoch.wrap(1)].nextSeed;
    if (sampleSeed != 0) {
      return sampleSeed;
    }

    return _leonidasStore.lastSeed;
  }

  /**
   * @notice  Samples a validator set for a specific epoch
   *
   * @dev     Only used internally, should never be called for anything but the "next" epoch
   *          Allowing us to always use `lastSeed`.
   *
   * @return The validators for the given epoch
   */
  function _sampleValidators(
    StakingStorage storage _stakingStore,
    uint256 _seed,
    uint256 _targetCommitteeSize
  ) private view returns (address[] memory) {
    uint256 validatorSetSize = _stakingStore.attesters.length();
    if (validatorSetSize == 0) {
      return new address[](0);
    }

    // If we have less validators than the target committee size, we just return the full set
    if (validatorSetSize <= _targetCommitteeSize) {
      return _stakingStore.attesters.values();
    }

    uint256[] memory indices =
      SampleLib.computeCommitteeClever(_targetCommitteeSize, validatorSetSize, _seed);

    address[] memory committee = new address[](_targetCommitteeSize);
    for (uint256 i = 0; i < _targetCommitteeSize; i++) {
      committee[i] = _stakingStore.attesters.at(indices[i]);
    }
    return committee;
  }

  function _getProposerAt(
    LeonidasStorage storage _leonidasStore,
    StakingStorage storage _stakingStore,
    Slot _slot,
    Epoch _epochNumber,
    uint256 _targetCommitteeSize
  ) private view returns (address) {
    // @note this is deliberately "bad" for the simple reason of code reduction.
    //       it does not need to actually return the full committee and then draw from it
    //       it can just return the proposer directly, but then we duplicate the code
    //       which we just don't have room for right now...
    address[] memory committee =
      _getCommitteeAt(_leonidasStore, _stakingStore, _epochNumber, _targetCommitteeSize);
    if (committee.length == 0) {
      return address(0);
    }

    address attester = committee[computeProposerIndex(
      _epochNumber, _slot, getSampleSeed(_leonidasStore, _epochNumber), committee.length
    )];

    return _stakingStore.info[attester].proposer;
  }

  function _getCommitteeAt(
    LeonidasStorage storage _leonidasStore,
    StakingStorage storage _stakingStore,
    Epoch _epochNumber,
    uint256 _targetCommitteeSize
  ) private view returns (address[] memory) {
    EpochData storage epoch = _leonidasStore.epochs[_epochNumber];

    if (epoch.sampleSeed != 0) {
      uint256 committeeSize = epoch.committee.length;
      if (committeeSize == 0) {
        return new address[](0);
      }
      return epoch.committee;
    }

    // Allow anyone if there is no validator set
    if (_stakingStore.attesters.length() == 0) {
      return new address[](0);
    }

    // Emulate a sampling of the validators
    uint256 sampleSeed = getSampleSeed(_leonidasStore, _epochNumber);
    return _sampleValidators(_stakingStore, sampleSeed, _targetCommitteeSize);
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
