// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore} from "@aztec/core/interfaces/IRollup.sol";
import {ValidatorSelectionStorage} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {SampleLib} from "@aztec/core/libraries/crypto/SampleLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {AttestationLib, CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {StakingLib} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {SlotDerivation} from "@oz/utils/SlotDerivation.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {EnumerableSet} from "@oz/utils/structs/EnumerableSet.sol";
import {TransientSlot} from "@oz/utils/TransientSlot.sol";

/**
 * @title ValidatorSelectionLib
 * @author Aztec Labs
 * @notice Core library responsible for validator selection, committee management, and proposer verification in the
 * Aztec rollup.
 *
 * @dev This library implements the validator selection system:
 *      - Epoch-based committee sampling
 *      - Slot-based proposer selection within committee members
 *      - Signature verification for block proposals and attestations
 *      - Committee commitment validation and caching mechanisms
 *      - Randomness seed management for unpredictable but deterministic selection
 *
 *      Key Components:
 *
 *      1. Committee Selection:
 *         - At the start of each epoch, a committee is sampled from the active validator set
 *         - Committee size is configurable at deployment (targetCommitteeSize), and must be met
 *         - Selection uses cryptographic randomness (prevrandao + epoch)
 *         - Committee remains stable throughout the entire epoch for consistency
 *         - Committee commitment is stored onchain and validated against reconstructed committees
 *
 *      2. Proposer Selection:
 *         - For each slot within an epoch, one committee member is selected as the proposer (this may change)
 *         - Selection is deterministic based on epoch, slot, and the epoch's sample seed
 *         - Proposers have exclusive rights to propose blocks during their assigned slot
 *         - Proposer verification ensures only the correct validator can submit blocks
 *
 *      3. Attestation System:
 *         - Committee members attest to blocks by providing signatures
 *         - Attestations serve dual purpose: data availability and state validation
 *         - Blocks require >2/3 committee signatures to be considered valid
 *         - Signatures are verified against expected committee members using ECDSA recovery
 *         - Mixed signature/address format allows optimization (addresses included only for non-signing members,
 *           addresses for signing members can be recovered from the signatures and hence are not needed for DA
 *           purposes)
 *         - Signature verification is delayed until proof submission to save gas
 *
 *      4. Seed Management:
 *         - Sample seeds determine committee and proposer selection for each epoch
 *         - Seeds use prevrandao from L1 blocks combined with epoch number for unpredictability
 *         - Prevrandao are set 2 epochs in advance to prevent last-minute manipulation and provide L1-reorg resistance
 *         - First two epochs use randao values (type(uint224).max) for bootstrap (this results in the committee
 *           being predictable in the first 2 epochs which is considered acceptable when bootstrapping the network)
 *
 *      5. Caching and Optimization:
 *         - Transient storage caches proposer computations within the same transaction
 *           - This is used when signaling for a governance or slashing payload after a block proposal
 *         - Committee commitments are stored to avoid recomputation during verification
 *         - Validator indices are sampled once and reused for address resolution
 *
 *      Integration with Rollup System:
 *      - Called from RollupCore.setupEpoch() to initialize epoch committees
 *      - Used in ProposeLib.propose() for proposer verification during block submission
 *      - Integrates with StakingLib to resolve validator addresses from staking indices
 *      - Works with InvalidateLib for committee verification during invalidation
 *
 *      Security Model:
 *      - Randomness comes from L1 prevrandao
 *      - Committee selection happens before epoch start, preventing manipulation
 *      - Signature verification ensures only legitimate committee members can attest
 *      - Committee commitments prevent committee substitution attacks
 *      - Two-epoch delay in seed setting prevents last-minute influence and provides L1-reorg resistance
 *
 *      Time-based Architecture:
 *      - Epochs define committee boundaries (committee stable within epoch)
 *      - Slots define proposer assignments (one proposer per slot)
 *      - Sampling uses a lagging time for the epoch to ensure validator set stability
 *      - Validator set snapshots taken at deterministic timestamps for consistency
 */
library ValidatorSelectionLib {
  using EnumerableSet for EnumerableSet.AddressSet;
  using MessageHashUtils for bytes32;
  using SignatureLib for Signature;
  using TimeLib for Timestamp;
  using TimeLib for Epoch;
  using TimeLib for Slot;
  using Checkpoints for Checkpoints.Trace224;
  using SafeCast for *;
  using TransientSlot for *;
  using SlotDerivation for string;
  using SlotDerivation for bytes32;
  using AttestationLib for CommitteeAttestations;

  /**
   * @dev Stack struct used in verifyAttestations to avoid stack too deep errors
   *      Used when reconstructing the committee commitment from the attestations
   * @param proposerIndex Index of the proposer within the committee
   * @param index Working index for iteration (unused in current implementation)
   * @param needed Number of signatures required (2/3 + 1 of committee size)
   * @param signaturesRecovered Number of valid signatures found
   * @param reconstructedCommittee Array of committee member addresses reconstructed from attestations
   */
  struct VerifyStack {
    uint256 proposerIndex;
    uint256 index;
    uint256 needed;
    uint256 signaturesRecovered;
    address[] reconstructedCommittee;
  }

  bytes32 private constant VALIDATOR_SELECTION_STORAGE_POSITION = keccak256("aztec.validator_selection.storage");
  // Namespace for cached proposer computations
  string private constant PROPOSER_NAMESPACE = "aztec.validator_selection.transient.proposer";

  /**
   * @notice Initializes the validator selection system with target committee size
   * @dev Sets up the initial configuration and bootstrap seeds for the first two epochs.
   *      The first two epochs use maximum seed values for startup.
   * @param _targetCommitteeSize The desired number of validators in each epoch's committee
   */
  function initialize(uint256 _targetCommitteeSize, uint256 _lagInEpochs) internal {
    ValidatorSelectionStorage storage store = getStorage();
    store.targetCommitteeSize = _targetCommitteeSize.toUint32();
    store.lagInEpochs = _lagInEpochs.toUint32();

    checkpointRandao(Epoch.wrap(0));
  }

  /**
   * @notice Performs epoch setup by sampling the committee and setting future seeds
   * @dev This function handles the epoch transition by:
   *      1. Retrieving the sample seed for the current epoch
   *      2. Setting the sample seed for the next epoch (if not already set)
   *      3. Sampling and storing the committee for the current epoch (if not already done)
   *
   *      This setup ensures that each epoch has a stable committee and that future epochs
   *      have their randomness seeds prepared in advance.
   * @param _epochNumber The epoch number to set up
   */
  function setupEpoch(Epoch _epochNumber) internal {
    ValidatorSelectionStorage storage store = getStorage();

    bytes32 committeeCommitment = store.committeeCommitments[_epochNumber];
    if (committeeCommitment != bytes32(0)) {
      // We already have the commitment stored for the epoch meaning the epoch has already been setup.
      return;
    }

    //################ Seeds ################
    // Get the sample seed for this current epoch.
    uint256 sampleSeed = getSampleSeed(_epochNumber);

    // Checkpoint randao for future sampling if required
    // function handles the case where it is already set
    checkpointRandao(_epochNumber);

    //################ Committee ################
    // If the committee is not set for this epoch, we need to sample it
    address[] memory committee = sampleValidators(_epochNumber, sampleSeed);
    store.committeeCommitments[_epochNumber] = computeCommitteeCommitment(committee);
  }

  /**
   * @notice Verifies that the block proposal has been signed by the correct proposer
   * @dev Validates proposer eligibility and signature for block proposals by:
   *      1. Attempting to load cached proposer from transient storage
   *      2. If not cached, reconstructing committee from attestations and verifying against stored commitment
   *      3. Computing proposer index using epoch, slot, and sample seed
   *      4. Verifying the proposer has provided a valid signature in the attestations
   *
   *      The attestation is checked by reconstructing the committee commitment from the attestations and signers,
   *      and then ensuring it matches the stored commitment for the epoch.
   *
   *      Uses transient storage caching to avoid recomputation within the same transaction. (This caching mechanism is
   *      commonly used when a proposer signals in governance and submits a proposal within the same transaction - then
   *      `getProposerAt` function is called).
   * @param _slot The slot of the block being proposed
   * @param _epochNumber The epoch number of the block
   * @param _attestations The committee attestations for the block proposal
   * @param _signers The addresses of the committee members that signed the attestations. Provided in order to not have
   * to recover them from their attestations' signatures (and hence save gas). The addresses of the non-signing
   * committee members are directly included in the attestations.
   * @param _digest The digest of the block being proposed
   * @param _updateCache Flag to identify that the proposer should be written to transient cache.
   * @custom:reverts Errors.ValidatorSelection__InvalidCommitteeCommitment if reconstructed committee doesn't match
   * stored commitment
   * @custom:reverts Errors.ValidatorSelection__MissingProposerSignature if proposer hasn't signed their attestation
   * @custom:reverts SignatureLib verification errors if proposer signature is invalid
   */
  function verifyProposer(
    Slot _slot,
    Epoch _epochNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _signers,
    bytes32 _digest,
    Signature memory _attestationsAndSignersSignature,
    bool _updateCache
  ) internal {
    uint256 proposerIndex;
    address proposer;

    {
      // Load the committee commitment for the epoch
      (bytes32 committeeCommitment, uint256 committeeSize) = getCommitteeCommitmentAt(_epochNumber);

      // If the rollup is *deployed* with a target committee size of 0, we skip the validation.
      // Note: This generally only happens in test setups; In production, the target committee is non-zero,
      // and one can see in `sampleValidators` that we will revert if the target committee size is not met.
      if (committeeSize == 0) {
        return;
      }

      // Reconstruct the committee from the attestations and signers
      address[] memory committee = _attestations.reconstructCommitteeFromSigners(_signers, committeeSize);

      // Check reconstructed committee commitment matches the expected one for the epoch
      bytes32 reconstructedCommitment = computeCommitteeCommitment(committee);
      if (reconstructedCommitment != committeeCommitment) {
        revert Errors.ValidatorSelection__InvalidCommitteeCommitment(reconstructedCommitment, committeeCommitment);
      }

      // Get the proposer from the committee based on the epoch, slot, and sample seed
      uint256 sampleSeed = getSampleSeed(_epochNumber);
      proposerIndex = computeProposerIndex(_epochNumber, _slot, sampleSeed, committeeSize);
      proposer = committee[proposerIndex];
    }

    // We check that the proposer agrees with the proposal by checking that he attested to it. If we fail to get
    // the proposer's attestation signature or if we fail to verify it, we revert.
    bool hasProposerSignature = _attestations.isSignature(proposerIndex);
    if (!hasProposerSignature) {
      revert Errors.ValidatorSelection__MissingProposerSignature(proposer, proposerIndex);
    }

    // Check if the signature is correct
    bytes32 digest = _digest.toEthSignedMessageHash();
    Signature memory signature = _attestations.getSignature(proposerIndex);
    SignatureLib.verify(signature, proposer, digest);

    // Check that the proposer have signed the `_attestations|_signers` data such that invalid `_attestations|_signers`
    // data can be attributed to the `proposer` specifically.
    bytes32 attestationsAndSignersDigest =
      _attestations.getAttestationsAndSignersDigest(_signers).toEthSignedMessageHash();
    SignatureLib.verify(_attestationsAndSignersSignature, proposer, attestationsAndSignersDigest);

    if (_updateCache) {
      setCachedProposer(_slot, proposer, proposerIndex);
    }
  }

  /**
   * @notice Verifies committee attestations meet the required threshold and signature validity
   * @dev Performs attestation validation by:
   *      1. Retrieving stored committee commitment and target committee size
   *      2. Computing proposer index for signature verification optimization
   *      3. Extracting and verifying signatures from packed attestation data
   *      4. Reconstructing committee addresses from signatures and provided addresses
   *      5. Validating reconstructed committee matches stored commitment
   *      6. Ensuring at least 2/3 + 1 committee members provided signatures
   *
   *      Each committee attestation is either their:
   *      - Signature (65 bytes: v, r, s) for attestation
   *      - Address (20 bytes) for non-signing members
   *
   *      Note that providing the addresses of non-signing members allows for reconstructing the committee commitment
   *      directly from calldata.
   *
   *      Skips validation entirely if target committee size is 0 (test configurations).
   * @param _slot The slot of the block
   * @param _epochNumber The epoch of the block
   * @param _attestations The packed signatures and addresses of committee members
   * @param _digest The digest of the block that attestations are signed over
   * @custom:reverts Errors.ValidatorSelection__InsufficientAttestations if less than 2/3 + 1 signatures provided
   * @custom:reverts Errors.ValidatorSelection__InvalidCommitteeCommitment if reconstructed committee doesn't match
   * stored commitment
   */
  function verifyAttestations(
    Slot _slot,
    Epoch _epochNumber,
    CommitteeAttestations memory _attestations,
    bytes32 _digest
  ) internal {
    (bytes32 committeeCommitment, uint256 targetCommitteeSize) = getCommitteeCommitmentAt(_epochNumber);

    // If the rollup is *deployed* with a target committee size of 0, we skip the validation.
    // Note: This generally only happens in test setups; In production, the target committee is non-zero,
    // and one can see in `sampleValidators` that we will revert if the target committee size is not met.
    if (targetCommitteeSize == 0) {
      return;
    }

    VerifyStack memory stack = VerifyStack({
      proposerIndex: computeProposerIndex(_epochNumber, _slot, getSampleSeed(_epochNumber), targetCommitteeSize),
      needed: (targetCommitteeSize << 1) / 3 + 1, // targetCommitteeSize * 2 / 3 + 1, but cheaper
      index: 0,
      signaturesRecovered: 0,
      reconstructedCommittee: new address[](targetCommitteeSize)
    });

    bytes32 digest = _digest.toEthSignedMessageHash();

    bytes memory signaturesOrAddresses = _attestations.signaturesOrAddresses;
    uint256 dataPtr;
    assembly {
      dataPtr := add(signaturesOrAddresses, 0x20) // Skip length, cache pointer
    }

    unchecked {
      for (uint256 i = 0; i < targetCommitteeSize; ++i) {
        bool isSignature = _attestations.isSignature(i);

        if (isSignature) {
          uint8 v;
          bytes32 r;
          bytes32 s;

          assembly {
            v := byte(0, mload(dataPtr))
            dataPtr := add(dataPtr, 1)
            r := mload(dataPtr)
            dataPtr := add(dataPtr, 32)
            s := mload(dataPtr)
            dataPtr := add(dataPtr, 32)
          }

          ++stack.signaturesRecovered;
          stack.reconstructedCommittee[i] = ECDSA.recover(digest, v, r, s);
        } else {
          address addr;
          assembly {
            addr := shr(96, mload(dataPtr))
            dataPtr := add(dataPtr, 20)
          }
          stack.reconstructedCommittee[i] = addr;
        }
      }
    }

    require(
      stack.signaturesRecovered >= stack.needed,
      Errors.ValidatorSelection__InsufficientAttestations(stack.needed, stack.signaturesRecovered)
    );

    // Check the committee commitment
    bytes32 reconstructedCommitment = computeCommitteeCommitment(stack.reconstructedCommittee);
    if (reconstructedCommitment != committeeCommitment) {
      revert Errors.ValidatorSelection__InvalidCommitteeCommitment(reconstructedCommitment, committeeCommitment);
    }
  }

  /**
   * @notice Caches proposer information in transient storage for the current transaction
   * @dev Uses EIP-1153 transient storage to cache proposer data, avoiding recomputation within the same transaction.
   *      Packs proposer address (160 bits) and index (96 bits) into a single 32-byte slot for efficiency.
   * @param _slot The slot to cache the proposer for
   * @param _proposer The proposer's address
   * @param _proposerIndex The proposer's index within the committee
   * @custom:reverts Errors.ValidatorSelection__ProposerIndexTooLarge if proposer index exceeds uint96 max
   */
  function setCachedProposer(Slot _slot, address _proposer, uint256 _proposerIndex) internal {
    require(_proposerIndex <= type(uint96).max, Errors.ValidatorSelection__ProposerIndexTooLarge(_proposerIndex));
    bytes32 packed = bytes32(uint256(uint160(_proposer))) | (bytes32(_proposerIndex) << 160);
    PROPOSER_NAMESPACE.erc7201Slot().deriveMapping(Slot.unwrap(_slot)).asBytes32().tstore(packed);
  }

  /**
   * @notice Gets the proposer for a specific slot, using cache or computing if necessary
   * @dev First checks transient storage cache, then computes proposer if not cached.
   *      Computation involves sampling validator indices and selecting based on slot.
   * @param _slot The slot to get the proposer for
   * @return proposer The address of the proposer for the slot
   * @return proposerIndex The index of the proposer within the committee, zero address and index if committee size is
   * 0 (ie test configuration).
   */
  function getProposerAt(Slot _slot) internal returns (address, uint256) {
    (address cachedProposer, uint256 cachedProposerIndex) = getCachedProposer(_slot);
    if (cachedProposer != address(0)) {
      return (cachedProposer, cachedProposerIndex);
    }

    Epoch epochNumber = _slot.epochFromSlot();

    uint256 sampleSeed = getSampleSeed(epochNumber);
    (uint32 ts, uint256[] memory indices) = sampleValidatorsIndices(epochNumber, sampleSeed);
    uint256 committeeSize = indices.length;
    if (committeeSize == 0) {
      return (address(0), 0);
    }
    uint256 proposerIndex = computeProposerIndex(epochNumber, _slot, sampleSeed, committeeSize);
    return (StakingLib.getAttesterFromIndexAtTime(indices[proposerIndex], Timestamp.wrap(ts)), proposerIndex);
  }

  /**
   * @notice Samples validator addresses for a specific epoch using cryptographic randomness
   * @dev Samples validator indices first, then resolves to addresses at the appropriate timestamp.
   *      Only used internally for epoch setup - should never be called for past or distant future epochs.
   * @param _epoch The epoch to sample validators for
   * @param _seed The cryptographic seed for sampling randomness
   * @return The array of validator addresses selected for the committee
   */
  function sampleValidators(Epoch _epoch, uint256 _seed) internal returns (address[] memory) {
    (uint32 ts, uint256[] memory indices) = sampleValidatorsIndices(_epoch, _seed);
    return StakingLib.getAttestersFromIndicesAtTime(Timestamp.wrap(ts), indices);
  }

  /**
   * @notice Gets the committee addresses for a specific epoch
   * @dev Retrieves the sample seed for the epoch and uses it to sample the validator committee.
   *      This function will trigger committee sampling if not already done for the epoch.
   * @param _epochNumber The epoch to get the committee for
   * @return The array of committee member addresses for the epoch
   */
  function getCommitteeAt(Epoch _epochNumber) internal returns (address[] memory) {
    uint256 seed = getSampleSeed(_epochNumber);
    return sampleValidators(_epochNumber, seed);
  }

  /**
   * @notice Gets the committee commitment and size for an epoch
   * @dev Retrieves the stored committee commitment, or computes it if not yet stored.
   *      The commitment is a keccak256 hash of the committee member addresses array.
   * @param _epochNumber The epoch to get the committee commitment for
   * @return committeeCommitment The keccak256 hash of the committee member addresses
   * @return committeeSize The target committee size (same for all epochs)
   */
  function getCommitteeCommitmentAt(Epoch _epochNumber)
    internal
    returns (bytes32 committeeCommitment, uint256 committeeSize)
  {
    ValidatorSelectionStorage storage store = getStorage();

    committeeCommitment = store.committeeCommitments[_epochNumber];
    if (committeeCommitment == 0) {
      // This is an edge case that can happen if `setupEpoch` has not been called (see documentation of
      // `RollupCore.setupEpoch` for details), so we compute the commitment again to guarantee that we get a real value.
      committeeCommitment = computeCommitteeCommitment(sampleValidators(_epochNumber, getSampleSeed(_epochNumber)));
    }

    return (committeeCommitment, store.targetCommitteeSize);
  }

  /**
   * @notice Checkpoints randao value for future usage
   * @dev Checks if already stored before storing the randao value.
   * @param _epoch The current epoch
   */
  function checkpointRandao(Epoch _epoch) internal {
    ValidatorSelectionStorage storage store = getStorage();

    // Check if the latest checkpoint is for the next epoch
    // It should be impossible that zero epoch snapshots exist, as in the genesis state we push the first values
    // into the store
    (, uint32 mostRecentTs,) = store.randaos.latestCheckpoint();
    uint32 ts = Timestamp.unwrap(_epoch.toTimestamp()).toUint32();

    // If the most recently stored epoch is less than the epoch we are querying, then we need to store randao for
    // later use. We truncate to save storage costs.
    if (mostRecentTs < ts) {
      store.randaos.push(ts, uint224(block.prevrandao));
    }
  }

  /**
   * @notice Validates if a specific validator can propose a block at a given time and chain state
   * @dev Performs comprehensive validation including:
   *      - Slot timing (must be after the last block's slot)
   *      - Archive consistency (must build on current chain tip)
   *      - Proposer authorization (must be the designated proposer for the slot)
   * @param _ts The timestamp of the proposed block
   * @param _archive The archive root the block claims to build on
   * @param _who The address attempting to propose the block
   * @return slot The slot number derived from the timestamp
   * @return blockNumber The next block number that will be assigned
   * @custom:reverts Errors.Rollup__SlotAlreadyInChain if trying to propose for a past slot
   * @custom:reverts Errors.Rollup__InvalidArchive if archive doesn't match current chain tip
   * @custom:reverts Errors.ValidatorSelection__InvalidProposer if _who is not the designated proposer
   */
  function canProposeAtTime(Timestamp _ts, bytes32 _archive, address _who) internal returns (Slot, uint256) {
    Slot slot = _ts.slotFromTimestamp();
    RollupStore storage rollupStore = STFLib.getStorage();

    // Pending chain tip
    uint256 pendingBlockNumber = STFLib.getEffectivePendingBlockNumber(_ts);

    Slot lastSlot = STFLib.getSlotNumber(pendingBlockNumber);

    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    // Make sure that the proposer is up to date and on the right chain (ie no reorgs)
    bytes32 tipArchive = rollupStore.archives[pendingBlockNumber];
    require(tipArchive == _archive, Errors.Rollup__InvalidArchive(tipArchive, _archive));

    (address proposer,) = getProposerAt(slot);
    require(proposer == _who, Errors.ValidatorSelection__InvalidProposer(proposer, _who));

    return (slot, pendingBlockNumber + 1);
  }

  /**
   * @notice Retrieves cached proposer information from transient storage
   * @dev Reads packed proposer data (address + index) from EIP-1153 transient storage.
   *      Returns zero values if no proposer is cached for the slot.
   * @param _slot The slot to check for cached proposer
   * @return proposer The cached proposer address (address(0) if not cached)
   * @return proposerIndex The cached proposer index (0 if not cached)
   */
  function getCachedProposer(Slot _slot) internal view returns (address proposer, uint256 proposerIndex) {
    bytes32 packed = PROPOSER_NAMESPACE.erc7201Slot().deriveMapping(Slot.unwrap(_slot)).asBytes32().tload();
    // Extract address from lower 160 bits
    proposer = address(uint160(uint256(packed)));
    // Extract uint96 from upper 96 bits
    proposerIndex = uint256(packed >> 160);
  }

  /**
   * @notice Converts an epoch number to the timestamp used for validator set sampling
   * @dev Calculates the sampling timestamp by:
   *      1. Taking the epoch start timestamp
   *      2. Subtracting `lagInEpochs` full epoch duration to ensure stability
   *
   *      This ensures validator set sampling uses stable historical data that won't be
   *      affected by last-minute changes or L1 reorgs during synchronization.
   * @param _epoch The epoch to calculate sampling time for
   * @return The Unix timestamp (uint32) to use for validator set sampling
   */
  function epochToSampleTime(Epoch _epoch) internal view returns (uint32) {
    uint32 sub = getStorage().lagInEpochs * TimeLib.getEpochDurationInSeconds().toUint32();
    return Timestamp.unwrap(_epoch.toTimestamp()).toUint32() - sub;
  }

  /**
   * @notice Gets the cryptographic sample seed for an epoch
   * @dev Retrieves the randao from the checkpointed randaos mapping using upperLookup.
   *      Then computes the sample seed using keccak256(epoch, randao)
   * @param _epoch The epoch to get the sample seed for
   * @return The sample seed used for validator selection randomness
   */
  function getSampleSeed(Epoch _epoch) internal view returns (uint256) {
    ValidatorSelectionStorage storage store = getStorage();
    uint32 ts = epochToSampleTime(_epoch);
    return uint256(keccak256(abi.encode(_epoch, store.randaos.upperLookup(ts))));
  }

  function getSamplingSize(Epoch _epoch) internal view returns (uint256) {
    uint32 ts = epochToSampleTime(_epoch);
    return StakingLib.getAttesterCountAtTime(Timestamp.wrap(ts));
  }

  function getLagInEpochs() internal view returns (uint256) {
    return getStorage().lagInEpochs;
  }

  /**
   * @notice Gets the validator selection storage struct using EIP-7201 namespaced storage
   * @dev Uses assembly to access storage at the predetermined slot to avoid collisions.
   * @return storageStruct The validator selection storage struct
   */
  function getStorage() internal pure returns (ValidatorSelectionStorage storage storageStruct) {
    bytes32 position = VALIDATOR_SELECTION_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }

  /**
   * @notice Computes the committee index of the proposer for a specific slot
   * @dev Uses keccak256 hash of epoch, slot, and seed to deterministically select a committee member.
   *      The result is modulo committee size to ensure valid index.
   *      The result being modulo biased is not a problem here as the validators in the committee were chosen randomly
   *      and are not ordered.
   * @param _epoch The epoch containing the slot
   * @param _slot The specific slot to compute proposer for
   * @param _seed The epoch's sample seed for randomness
   * @param _size The size of the committee
   * @return The index (0 to _size-1) of the committee member who should propose for this slot
   */
  function computeProposerIndex(Epoch _epoch, Slot _slot, uint256 _seed, uint256 _size) internal pure returns (uint256) {
    return uint256(keccak256(abi.encode(_epoch, _slot, _seed))) % _size;
  }

  /**
   * @notice Samples validator indices for a specific epoch using cryptographic randomness
   * @dev Determines sample timestamp, gets validator set size, and uses SampleLib to select committee indices.
   *      Validates that enough validators are available to meet target committee size.
   * @param _epoch The epoch to sample validators for
   * @param _seed The cryptographic seed for sampling randomness
   * @return sampleTime The timestamp used for validator set sampling
   * @return indices Array of validator indices selected for the committee
   * @custom:reverts Errors.ValidatorSelection__InsufficientValidatorSetSize if not enough validators available
   */
  function sampleValidatorsIndices(Epoch _epoch, uint256 _seed) private returns (uint32, uint256[] memory) {
    ValidatorSelectionStorage storage store = getStorage();
    uint32 ts = epochToSampleTime(_epoch);
    uint256 validatorSetSize = StakingLib.getAttesterCountAtTime(Timestamp.wrap(ts));
    uint256 targetCommitteeSize = store.targetCommitteeSize;

    require(
      validatorSetSize >= targetCommitteeSize,
      Errors.ValidatorSelection__InsufficientValidatorSetSize(validatorSetSize, targetCommitteeSize)
    );

    if (targetCommitteeSize == 0) {
      return (ts, new uint256[](0));
    }

    return (ts, SampleLib.computeCommittee(targetCommitteeSize, validatorSetSize, _seed));
  }

  /**
   * @notice Computes the keccak256 commitment hash for a committee member array
   * @dev Creates a cryptographic commitment to the committee composition that can be verified later.
   *      Used to prevent committee substitution attacks during attestation verification.
   * @param _committee The array of committee member addresses
   * @return The keccak256 hash of the ABI-encoded committee array
   */
  function computeCommitteeCommitment(address[] memory _committee) private pure returns (bytes32) {
    return keccak256(abi.encode(_committee));
  }
}
