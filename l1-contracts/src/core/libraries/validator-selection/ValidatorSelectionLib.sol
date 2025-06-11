// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BlockHeaderValidationFlags} from "@aztec/core/interfaces/IRollup.sol";
import {ValidatorSelectionStorage} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {SampleLib} from "@aztec/core/libraries/crypto/SampleLib.sol";
import {
  SignatureLib,
  Signature,
  CommitteeAttestation
} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {StakingLib} from "@aztec/core/libraries/staking/StakingLib.sol";
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
  using TimeLib for Slot;
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
  function setupEpoch(Epoch _epochNumber) internal {
    ValidatorSelectionStorage storage store = getStorage();

    //################ Seeds ################
    // Get the sample seed for this current epoch.
    uint224 sampleSeed = getSampleSeed(_epochNumber);

    // Set the sample seed for the next epoch if required
    // function handles the case where it is already set
    setSampleSeedForNextEpoch(_epochNumber);

    //################ Committee ################
    // If the committee is not set for this epoch, we need to sample it
    bytes32 committeeCommitment = store.committeeCommitments[_epochNumber];
    if (committeeCommitment == bytes32(0)) {
      address[] memory committee = sampleValidators(_epochNumber, sampleSeed);
      store.committeeCommitments[_epochNumber] = computeCommitteeCommitment(committee);
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
   * @param _attestations - The signatures (or empty; just address is provided) of the committee members
   * @param _digest - The digest of the block
   */
  function verify(
    Slot _slot,
    Epoch _epochNumber,
    CommitteeAttestation[] memory _attestations,
    bytes32 _digest,
    BlockHeaderValidationFlags memory _flags
  ) internal {
    (bytes32 committeeCommitment, uint256 committeeSize) = getCommitteeCommitmentAt(_epochNumber);

    // @todo Consider getting rid of this option.
    // If the proposer is open, we allow anyone to propose without needing any signatures
    if (committeeSize == 0) {
      return;
    }

    if (_flags.ignoreSignatures) {
      return;
    }

    require(
      _attestations.length == committeeSize,
      Errors.ValidatorSelection__InvalidAttestationsLength(committeeSize, _attestations.length)
    );

    // We determine who the proposer from indexing into the provided attestations array, we then recover their proposer
    // address from storage
    uint256 proposerIndex =
      computeProposerIndex(_epochNumber, _slot, getSampleSeed(_epochNumber), committeeSize);

    // The user controls this value, however, if a false value is provided, the recalculated committee commitment will
    // be incorrect, and we will revert.

    // Validate the attestations
    uint256 needed = committeeSize * 2 / 3 + 1;
    uint256 validAttestations = 0;

    address[] memory reconstructedCommittee = new address[](committeeSize);
    bool proposerVerified = false;

    bytes32 digest = _digest.toEthSignedMessageHash();
    for (uint256 i = 0; i < _attestations.length; i++) {
      // To avoid stack too deep errors
      CommitteeAttestation memory attestation = _attestations[i];
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/14283): as part of bitmap / storage optimisation, this check will change to whatever the bitmap includes
      if (attestation.signature.v != 0) {
        address recovered = ecrecover(
          digest, attestation.signature.v, attestation.signature.r, attestation.signature.s
        );
        reconstructedCommittee[i] = recovered;
        validAttestations++;
        if (i == proposerIndex) {
          proposerVerified = true;
        }
      } else {
        reconstructedCommittee[i] = attestation.addr;
      }
    }

    address proposer = reconstructedCommittee[proposerIndex];

    require(
      proposerVerified || proposer == msg.sender,
      Errors.ValidatorSelection__InvalidProposer(proposer, msg.sender)
    );

    require(
      validAttestations >= needed,
      Errors.ValidatorSelection__InsufficientAttestations(needed, validAttestations)
    );

    // Check the committee commitment
    bytes32 reconstructedCommitment = computeCommitteeCommitment(reconstructedCommittee);
    if (reconstructedCommitment != committeeCommitment) {
      revert Errors.ValidatorSelection__InvalidCommitteeCommitment(
        reconstructedCommitment, committeeCommitment
      );
    }
  }

  function getProposerAt(Slot _slot) internal returns (address) {
    // @note this is deliberately "bad" for the simple reason of code reduction.
    //       it does not need to actually return the full committee and then draw from it
    //       it can just return the proposer directly, but then we duplicate the code
    //       which we just don't have room for right now...
    Epoch epochNumber = _slot.epochFromSlot();

    uint224 sampleSeed = getSampleSeed(epochNumber);
    address[] memory committee = sampleValidators(epochNumber, sampleSeed);
    if (committee.length == 0) {
      return address(0);
    }

    return committee[computeProposerIndex(epochNumber, _slot, sampleSeed, committee.length)];
  }

  /**
   * @notice  Samples a validator set for a specific epoch
   *
   * @dev     Only used internally, should never be called for anything but the "next" epoch
   *          Allowing us to always use `lastSeed`.
   *
   * @return The validators for the given epoch
   */
  function sampleValidators(Epoch _epoch, uint224 _seed) internal returns (address[] memory) {
    ValidatorSelectionStorage storage store = getStorage();
    uint32 ts = epochToSampleTime(_epoch);
    uint256 validatorSetSize = StakingLib.getAttesterCountAtTime(Timestamp.wrap(ts));
    uint256 targetCommitteeSize = store.targetCommitteeSize;

    bool smallerCommittee = validatorSetSize <= targetCommitteeSize;

    // If we have less validators than the target committee size, we just return the full set
    if (smallerCommittee) {
      return StakingLib.getAttestersAtTime(Timestamp.wrap(ts));
    } else {
      // Sample the larger committee
      uint256[] memory indices =
        SampleLib.computeCommittee(targetCommitteeSize, validatorSetSize, _seed);

      return StakingLib.getAttestersFromIndicesAtTime(Timestamp.wrap(ts), indices);
    }
  }

  /**
   * @notice  Get the committee for an epoch
   *
   * @param _epochNumber - The epoch to get the committee for
   *
   * @return - The committee for the epoch
   */
  function getCommitteeAt(Epoch _epochNumber) internal returns (address[] memory) {
    uint224 seed = getSampleSeed(_epochNumber);
    return sampleValidators(_epochNumber, seed);
  }

  /**
   * @notice Get the committee commitment for an epoch
   * @param _epochNumber -
   * @return committeeCommitment - The commitment to the current committee
   * @return committeeSize - The size of the current committee
   *
   * @dev - intended as a view function, do not update state
   */
  function getCommitteeCommitmentAt(Epoch _epochNumber)
    internal
    returns (bytes32 committeeCommitment, uint256 committeeSize)
  {
    ValidatorSelectionStorage storage store = getStorage();

    committeeCommitment = store.committeeCommitments[_epochNumber];
    if (committeeCommitment == 0) {
      // If no committee has been stored, then we need to setup the epoch
      committeeCommitment =
        computeCommitteeCommitment(sampleValidators(_epochNumber, getSampleSeed(_epochNumber)));
    }

    // We do not want to recalculate this each time
    uint32 ts = epochToSampleTime(_epochNumber);
    committeeSize = StakingLib.getAttesterCountAtTime(Timestamp.wrap(ts));
    if (committeeSize > store.targetCommitteeSize) {
      committeeSize = store.targetCommitteeSize;
    }

    return (committeeCommitment, committeeSize);
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

  function epochToSampleTime(Epoch _epoch) internal view returns (uint32) {
    // We do -1, as the snapshots practically happen at the end of the block, e.g.,
    // a tx manipulating the set in at $t$ would be visible already at lookup $t$ if after that
    // transactions. But reading at $t-1$ would be the state at the end of $t-1$ which is the state
    // as we "start" time $t$. We then shift that back by an entire L2 epoch to guarantee
    // we are not hit by last-minute changes or L1 reorgs when syncing validators from our clients.

    return Timestamp.unwrap(_epoch.toTimestamp()).toUint32()
      - uint32(TimeLib.getEpochDurationInSeconds()) - 1;
  }

  /**
   * @notice  Get the sample seed for an epoch
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
    return store.seeds.upperLookup(Epoch.unwrap(_epoch).toUint32());
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
   * @notice  Computes the committee commitment for a given committee
   *
   * @param _committee - The committee to compute the commitment for
   *
   * @return The computed commitment
   */
  function computeCommitteeCommitment(address[] memory _committee) private pure returns (bytes32) {
    return keccak256(abi.encode(_committee));
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
