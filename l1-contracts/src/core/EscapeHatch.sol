// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {IEscapeHatch, IEscapeHatchCore, Hatch, Status, CandidateInfo} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {AddressSnapshotLib, SnapshottedAddressSet} from "@aztec/governance/libraries/AddressSnapshotLib.sol";
import {Timestamp, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {BitMaps} from "@oz/utils/structs/BitMaps.sol";

/**
 * @title EscapeHatch
 * @author Aztec Labs
 *
 * @notice The escape hatch provides censorship resistance by allowing a designated proposer
 *         to bypass the committee and propose blocks during periodic "escape hatch" windows.
 *
 * @dev The escape hatch opens for ACTIVE_DURATION epochs every FREQUENCY epochs. A candidate is
 *      randomly selected from a bonded candidate set using snapshotted data to prevent bias.
 *
 *      Key security properties:
 *      - Candidates must post a significant bond (BOND_SIZE)
 *      - Candidates are punished if they fail to propose or prove (FAILED_HATCH_PUNISHMENT)
 *      - All exits incur a tax (WITHDRAWAL_TAX)
 *      - Candidate set is snapshotted before RANDAO to prevent manipulation
 *      - Candidate does NOT receive access to governance
 */
contract EscapeHatch is IEscapeHatch {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using SafeERC20 for IERC20;
  using BitMaps for BitMaps.BitMap;
  using SafeCast for uint256;
  using SafeCast for uint128;

  // ============ Constants ============

  /// @notice Number of epochs to look back from the START of the hatch for stable candidate set
  uint256 public constant LAG_IN_EPOCHS_FOR_SET_SIZE = 2;

  /// @notice Number of epochs to look back from the START of the hatch for stable RANDAO
  uint256 public constant LAG_IN_EPOCHS_FOR_RANDAO = 1;

  // ============ Immutables ============

  // The rollup contract that the escape hatch belongs to
  IInstance internal immutable ROLLUP;

  // The lag defines how far in advance we pick the
  uint256 internal immutable LAG_IN_HATCHES;

  // The token used for candidate bonds
  IERC20 internal immutable BOND_TOKEN;

  // The required bond size for candidates
  uint96 internal immutable BOND_SIZE;

  // The tax applied when a candidate exits
  uint96 internal immutable WITHDRAWAL_TAX;

  // The punishment applied when a candidate fails to prove their proof submission
  uint96 internal immutable FAILED_HATCH_PUNISHMENT;

  // The frequency of escape hatches in epochs
  uint256 internal immutable FREQUENCY;

  // The duration of an escape hatch in epochs
  uint256 internal immutable ACTIVE_DURATION;

  // The additional exit delay after proposing in seconds
  uint256 internal immutable PROPOSING_EXIT_DELAY;

  // ============ Storage ============

  BitMaps.BitMap internal $isHatchPrepared;
  BitMaps.BitMap internal $isHatchValidated;
  SnapshottedAddressSet internal $activeCandidates;
  mapping(address candidate => CandidateInfo data) internal $candidateDatas;
  mapping(Hatch hatch => address proposer) internal $designatedProposer;

  constructor(
    address _rollup,
    address _bondToken,
    uint96 _bondSize,
    uint96 _withdrawalTax,
    uint96 _failedHatchPunishment,
    uint256 _frequency,
    uint256 _activeDuration,
    uint256 _lagInHatches,
    uint256 _proposingExitDelay
  ) {
    // Validate configuration
    // LAG_IN_EPOCHS_FOR_SET_SIZE must be greater than LAG_IN_EPOCHS_FOR_RANDAO
    // to prevent bias from set manipulation
    require(LAG_IN_EPOCHS_FOR_SET_SIZE > LAG_IN_EPOCHS_FOR_RANDAO, Errors.EscapeHatch__InvalidConfiguration());

    require(_lagInHatches >= 1, Errors.EscapeHatch__InvalidConfiguration());

    // ACTIVE_DURATION must be at least proofSubmissionEpochs + 1 to ensure
    // the proposer cannot be "rugged" by malicious committee.
    uint256 proofSubmissionEpochs = IInstance(_rollup).getProofSubmissionEpochs();
    require(_activeDuration >= proofSubmissionEpochs + 1, Errors.EscapeHatch__InvalidConfiguration());

    // FREQUENCY must be > LAG_IN_EPOCHS_FOR_SET_SIZE to ensure valid selection window.
    // Selection must happen in window [hatchTime(H), setSnapshotTime(H+1)).
    // With too large a lag `setSnapshotTime(H+1) < hatchTime(H)`
    require(_frequency > LAG_IN_EPOCHS_FOR_SET_SIZE, Errors.EscapeHatch__InvalidConfiguration());

    require(_frequency > _activeDuration, Errors.EscapeHatch__InvalidConfiguration());

    // BOND_SIZE must be non-zero to ensure "something at stake"
    require(_bondSize > 0, Errors.EscapeHatch__InvalidConfiguration());

    // FAILED_HATCH_PUNISHMENT must be <= BOND_SIZE to avoid underflow
    require(_failedHatchPunishment <= _bondSize, Errors.EscapeHatch__InvalidConfiguration());

    // WITHDRAWAL_TAX must be <= BOND_SIZE to ensure valid refund calculation
    require(_withdrawalTax <= _bondSize, Errors.EscapeHatch__InvalidConfiguration());

    require(_proposingExitDelay <= 30 days, Errors.EscapeHatch__InvalidConfiguration());

    ROLLUP = IInstance(_rollup);
    BOND_TOKEN = IERC20(_bondToken);
    BOND_SIZE = _bondSize;
    WITHDRAWAL_TAX = _withdrawalTax;
    FAILED_HATCH_PUNISHMENT = _failedHatchPunishment;
    FREQUENCY = _frequency;
    ACTIVE_DURATION = _activeDuration;
    LAG_IN_HATCHES = _lagInHatches;
    PROPOSING_EXIT_DELAY = _proposingExitDelay;
  }

  /**
   * @notice Join the escape hatch candidate set by depositing the required bond
   *
   * @dev Transfers BOND_SIZE tokens from the caller
   *
   * @custom:reverts EscapeHatch__HatchTooEarly if called during early period when exit would revert
   * @custom:reverts EscapeHatch__AlreadyInCandidateSet if caller is already in the candidate set
   * @custom:reverts EscapeHatch__InvalidStatus if caller has a non-NONE status
   */
  function joinCandidateSet() external override(IEscapeHatchCore) {
    // Ensure exit path is viable (reverts with EscapeHatch__HatchTooEarly during early period)
    getSetTimestamp(getCurrentHatch() + Hatch.wrap(LAG_IN_HATCHES));

    address candidate = msg.sender;

    require(!$activeCandidates.contains(candidate), Errors.EscapeHatch__AlreadyInCandidateSet(candidate));

    CandidateInfo storage data = $candidateDatas[candidate];
    require(data.status == Status.NONE, Errors.EscapeHatch__InvalidStatus(Status.NONE, data.status));

    $activeCandidates.add(candidate);

    data.status = Status.ACTIVE;
    data.amount = BOND_SIZE;

    BOND_TOKEN.safeTransferFrom(candidate, address(this), BOND_SIZE);

    emit CandidateJoined(candidate);
  }

  /**
   * @notice Initiate exit from the candidate set
   *
   * @dev The exit may be immediate or delayed depending on timing relative to next hatch.
   *
   *      Calls selectCandidates() first, which may select the caller as the designated
   *      proposer for an upcoming hatch. If the caller is selected, their status transitions
   *      to PROPOSING and they are removed from $activeCandidates, causing the subsequent
   *      checks to revert. This is intentional - a designated proposer cannot exit and must
   *      instead follow the PROPOSING -> validateProofSubmission -> EXITING -> leaveCandidateSet
   *      flow.
   *
   * @custom:reverts EscapeHatch__NotInCandidateSet if caller is not in the candidate set
   *                 (including when caller was just selected as proposer by selectCandidates)
   * @custom:reverts EscapeHatch__InvalidStatus if caller's status is not ACTIVE
   */
  function initiateExit() external override(IEscapeHatchCore) {
    // Prepare the current hatch. If this selects the caller as designated proposer, their
    // status becomes PROPOSING and they are removed from $activeCandidates. The requires
    // below will then revert, preventing a designated proposer from exiting.
    selectCandidates();

    address candidate = msg.sender;
    require($activeCandidates.contains(candidate), Errors.EscapeHatch__NotInCandidateSet(candidate));

    CandidateInfo storage data = $candidateDatas[candidate];
    require(data.status == Status.ACTIVE, Errors.EscapeHatch__InvalidStatus(Status.ACTIVE, data.status));

    $activeCandidates.remove(candidate);
    data.status = Status.EXITING;

    // Calculate exit time based on whether we're before or after the next freeze
    // If before the freeze we are free to leave, otherwise we will be in the snapshot
    // and will need to wait until we know we have not been chosen, or have the selection
    // update the exitableAt time.
    Hatch nextTargetHatch = getCurrentHatch() + Hatch.wrap(1 + LAG_IN_HATCHES);
    uint32 nextFreezeTs = getSetTimestamp(nextTargetHatch);

    if (block.timestamp < nextFreezeTs) {
      data.exitableAt = block.timestamp.toUint32();
    } else {
      data.exitableAt = getSetTimestamp(nextTargetHatch + Hatch.wrap(1));
    }

    emit CandidateExitInitiated(candidate, data.exitableAt);
  }

  /**
   * @notice Complete exit from the candidate set and reclaim bond minus tax
   *
   * @dev Only callable after exitableAt timestamp has passed
   *
   * @custom:reverts EscapeHatch__InvalidStatus if caller's status is not EXITING
   * @custom:reverts EscapeHatch__NotExitableYet if exitableAt has not been reached
   */
  function leaveCandidateSet() external override(IEscapeHatchCore) {
    address candidate = msg.sender;
    CandidateInfo storage data = $candidateDatas[candidate];

    require(data.status == Status.EXITING, Errors.EscapeHatch__InvalidStatus(Status.EXITING, data.status));

    require(block.timestamp >= data.exitableAt, Errors.EscapeHatch__NotExitableYet(data.exitableAt, block.timestamp));

    uint256 refund = uint256(data.amount);
    if (refund > WITHDRAWAL_TAX) {
      refund -= WITHDRAWAL_TAX;
    } else {
      refund = 0;
    }

    delete $candidateDatas[candidate];

    if (refund > 0) {
      BOND_TOKEN.safeTransfer(candidate, refund);
    }

    emit CandidateExited(candidate, refund);
  }

  /**
   * @notice Update the last submitted archive for a proposer during escape hatch
   *
   * @param _proposer The escape hatch proposer
   * @param _checkpointNumber The checkpoint number being proposed, safely downcasted to 32 bits
   * @param _archive The archive root of the proposed checkpoint
   *
   * @custom:reverts EscapeHatch__OnlyRollup if caller is not the Rollup contract
   */
  function updateSubmittedArchive(address _proposer, uint128 _checkpointNumber, bytes32 _archive)
    external
    override(IEscapeHatchCore)
  {
    require(msg.sender == address(ROLLUP), Errors.EscapeHatch__OnlyRollup(msg.sender, address(ROLLUP)));

    CandidateInfo storage data = $candidateDatas[_proposer];
    data.lastCheckpointNumber = _checkpointNumber.toUint32();
    data.lastSubmittedArchive = _archive;

    emit ArchiveUpdated(_proposer, _checkpointNumber, _archive);
  }

  /**
   * @notice Validate that the designated proposer fulfilled their duty
   *
   * @dev Checks that blocks were proposed and proven. Applies punishment if not.
   *      This is the ONLY way to transition from PROPOSING to EXITING.
   *
   * @param _hatch The hatch to validate
   *
   * @custom:reverts EscapeHatch__AlreadyValidated if the hatch has already been validated
   * @custom:reverts EscapeHatch__NoDesignatedProposer if no proposer was designated for the hatch
   * @custom:reverts EscapeHatch__InvalidStatus if proposer's status is not PROPOSING
   * @custom:reverts EscapeHatch__NotExitableYet if called before exitableAt timestamp
   */
  function validateProofSubmission(Hatch _hatch) external override(IEscapeHatchCore) {
    require(!$isHatchValidated.get(Hatch.unwrap(_hatch)), Errors.EscapeHatch__AlreadyValidated(_hatch));

    address proposer = $designatedProposer[_hatch];
    require(proposer != address(0), Errors.EscapeHatch__NoDesignatedProposer(_hatch));

    CandidateInfo storage data = $candidateDatas[proposer];
    require(data.status == Status.PROPOSING, Errors.EscapeHatch__InvalidStatus(Status.PROPOSING, data.status));

    require(block.timestamp >= data.exitableAt, Errors.EscapeHatch__NotExitableYet(data.exitableAt, block.timestamp));

    // Check if this contract was the active escape hatch for the entire active period.
    // If not, the proposer may have been unable to fulfill duties due to governance change.
    Epoch firstActiveEpoch = _getFirstEpoch(_hatch);
    bool wasActiveEntirePeriod = true;
    for (uint256 i = 0; i < ACTIVE_DURATION; i++) {
      Epoch epoch = firstActiveEpoch + Epoch.wrap(i);
      if (address(ROLLUP.getEscapeHatchForEpoch(epoch)) != address(this)) {
        wasActiveEntirePeriod = false;
        break;
      }
    }

    bool success = true;
    uint256 punishment = 0;

    if (!wasActiveEntirePeriod && data.lastCheckpointNumber == 0) {
      // Escape hatch was deactivated during the active window and proposer did nothing.
      // This is acceptable - they couldn't (or chose not to) propose during disruption.
      // Skip punishment, transition to EXITING.
    } else {
      // Normal validation: either was active the entire time, or proposer proposed something
      // (if they proposed, they're on the hook regardless of escape hatch changes,
      // since proofs go to the rollup directly and are unaffected by escape hatch changes).

      // 1. Something must have been proposed
      if (data.lastCheckpointNumber == 0) {
        success = false;
      }

      // 2. Proofs must have been submitted at least up to this checkpoint
      if (success && ROLLUP.getProvenCheckpointNumber() < data.lastCheckpointNumber) {
        success = false;
      }

      // 3. The checkpoint archive must still be in the chain (not pruned)
      if (success && ROLLUP.archiveAt(data.lastCheckpointNumber) != data.lastSubmittedArchive) {
        success = false;
      }

      if (!success) {
        punishment = FAILED_HATCH_PUNISHMENT;
        data.amount -= FAILED_HATCH_PUNISHMENT;
      }
    }

    data.status = Status.EXITING;
    data.lastCheckpointNumber = 0;
    data.lastSubmittedArchive = bytes32(0);

    $isHatchValidated.set(Hatch.unwrap(_hatch));

    emit ProofValidated(_hatch, proposer, success, punishment);
  }

  /**
   * @notice Check if an epoch is within an open escape hatch period
   *
   * @param _epoch The epoch to check
   *
   * @return isOpen True if the epoch is within the escape hatch active duration
   * @return proposer The designated proposer for this hatch (address(0) if none or not open)
   */
  function isHatchOpen(Epoch _epoch) external view override(IEscapeHatch) returns (bool isOpen, address proposer) {
    uint256 epochInHatch = Epoch.unwrap(_epoch) % FREQUENCY;
    if (epochInHatch >= ACTIVE_DURATION) {
      return (false, address(0));
    }

    Hatch hatch = _getHatch(_epoch);
    proposer = $designatedProposer[hatch];

    return (proposer != address(0), proposer);
  }

  /**
   * @notice Convert an epoch to its corresponding hatch number
   *
   * @param _epoch The epoch
   *
   * @return The hatch number
   */
  function getHatch(Epoch _epoch) external view override(IEscapeHatch) returns (Hatch) {
    return _getHatch(_epoch);
  }

  /**
   * @notice Get the first epoch of a hatch
   *
   * @param _hatch The hatch number
   *
   * @return The first epoch of the hatch
   */
  function getFirstEpoch(Hatch _hatch) external view override(IEscapeHatch) returns (Epoch) {
    return _getFirstEpoch(_hatch);
  }

  /**
   * @notice Get the designated proposer for a hatch
   *
   * @param _hatch The hatch number
   *
   * @return The designated proposer address (address(0) if none)
   */
  function getDesignatedProposer(Hatch _hatch) external view override(IEscapeHatch) returns (address) {
    return $designatedProposer[_hatch];
  }

  /**
   * @notice Check if a hatch has been prepared
   *
   * @param _hatch The hatch number
   *
   * @return True if the hatch has been prepared
   */
  function isHatchPrepared(Hatch _hatch) external view override(IEscapeHatch) returns (bool) {
    return $isHatchPrepared.get(Hatch.unwrap(_hatch));
  }

  /**
   * @notice Check if a hatch has been validated
   *
   * @param _hatch The hatch number
   *
   * @return True if the hatch has been validated
   */
  function isHatchValidated(Hatch _hatch) external view override(IEscapeHatch) returns (bool) {
    return $isHatchValidated.get(Hatch.unwrap(_hatch));
  }

  /**
   * @notice Get information about a candidate
   *
   * @param _candidate The candidate address
   *
   * @return The candidate's information
   */
  function getCandidateInfo(address _candidate) external view override(IEscapeHatch) returns (CandidateInfo memory) {
    return $candidateDatas[_candidate];
  }

  /**
   * @notice Get the current number of active candidates
   *
   * @return The number of candidates in the active set
   */
  function getCandidateCount() external view override(IEscapeHatch) returns (uint256) {
    return $activeCandidates.length();
  }

  /**
   * @notice Get the number of candidates in the snapshot for a target hatch
   *
   * @param _hatch The target hatch (the one being prepared/proposed for)
   *
   * @return The number of candidates in the snapshot for this hatch
   */
  function getCandidateCountForHatch(Hatch _hatch) external view override(IEscapeHatch) returns (uint256) {
    uint32 freezeTs = getSetTimestamp(_hatch);
    require(freezeTs < block.timestamp, Errors.EscapeHatch__SetUnstable(_hatch));
    return $activeCandidates.lengthAtTimestamp(freezeTs);
  }

  /**
   * @notice Get the candidate address at a given index in the current active set
   *
   * @param _index The index in the candidate set
   *
   * @return The candidate address at the given index
   */
  function getCandidateAtIndex(uint256 _index) external view override(IEscapeHatch) returns (address) {
    return $activeCandidates.at(_index);
  }

  /**
   * @notice Get the candidate address at a given index in the snapshot for a target hatch
   *
   * @param _index The index in the snapshot
   * @param _hatch The target hatch (the one being prepared/proposed for)
   *
   * @return The candidate address at the given index in the snapshot
   */
  function getCandidateAtIndexForHatch(uint256 _index, Hatch _hatch)
    external
    view
    override(IEscapeHatch)
    returns (address)
  {
    uint32 freezeTs = getSetTimestamp(_hatch);
    require(freezeTs < block.timestamp, Errors.EscapeHatch__SetUnstable(_hatch));
    return $activeCandidates.getAddressFromIndexAtTimestamp(_index, freezeTs);
  }

  /**
   * @notice Check if an address is in the candidate set
   *
   * @param _candidate The address to check
   *
   * @return True if the address is in the active candidate set
   */
  function isCandidate(address _candidate) external view override(IEscapeHatch) returns (bool) {
    return $activeCandidates.contains(_candidate);
  }

  /**
   * @notice Get the rollup contract address
   *
   * @return The rollup contract address
   */
  function getRollup() external view override(IEscapeHatch) returns (address) {
    return address(ROLLUP);
  }

  /**
   * @notice Get the bond token address
   *
   * @return The ERC20 token used for candidate bonds
   */
  function getBondToken() external view override(IEscapeHatch) returns (address) {
    return address(BOND_TOKEN);
  }

  /**
   * @notice Get the required bond size for candidates
   *
   * @return The amount of tokens required to join the candidate set
   */
  function getBondSize() external view override(IEscapeHatch) returns (uint96) {
    return BOND_SIZE;
  }

  /**
   * @notice Get the withdrawal tax applied when exiting
   *
   * @return The amount deducted from bond on exit
   */
  function getWithdrawalTax() external view override(IEscapeHatch) returns (uint96) {
    return WITHDRAWAL_TAX;
  }

  /**
   * @notice Get the punishment for failing to fulfill proposer duties
   *
   * @return The amount deducted from bond on failed hatch
   */
  function getFailedHatchPunishment() external view override(IEscapeHatch) returns (uint96) {
    return FAILED_HATCH_PUNISHMENT;
  }

  /**
   * @notice Get the frequency of escape hatches in epochs
   *
   * @return The number of epochs between escape hatch windows
   */
  function getFrequency() external view override(IEscapeHatch) returns (uint256) {
    return FREQUENCY;
  }

  /**
   * @notice Get the active duration of each escape hatch in epochs
   *
   * @return The number of epochs an escape hatch remains open
   */
  function getActiveDuration() external view override(IEscapeHatch) returns (uint256) {
    return ACTIVE_DURATION;
  }

  /**
   * @notice Get the lag in hatches for candidate selection
   *
   * @return The number of hatches ahead candidates are selected for
   */
  function getLagInHatches() external view override(IEscapeHatch) returns (uint256) {
    return LAG_IN_HATCHES;
  }

  /**
   * @notice Get the additional exit delay after proposing
   *
   * @return The additional seconds a proposer must wait after hatch ends before exiting
   */
  function getProposingExitDelay() external view override(IEscapeHatch) returns (uint256) {
    return PROPOSING_EXIT_DELAY;
  }

  /**
   * @notice Prepare the designated proposer for an upcoming escape hatch
   *
   * @dev Called permissionlessly to set up the next hatch. Uses snapshotted
   *      candidate set and RANDAO for unbiased selection.
   *
   * @custom:reverts EscapeHatch__SetUnstable if called before the freeze timestamp (defense in depth)
   */
  function selectCandidates() public override(IEscapeHatchCore) {
    // Don't select new candidates if this contract is no longer the active escape hatch.
    // We check the latest value rather than the epoch-stable one since we sample for the future,
    // so if the current differs, the future will as well.
    // Early return (not revert) is important because initiateExit() calls selectCandidates() internally.
    if (address(ROLLUP.getEscapeHatch()) != address(this)) {
      return;
    }

    Hatch currentHatch = getCurrentHatch();
    Hatch targetHatch = currentHatch + Hatch.wrap(LAG_IN_HATCHES);

    if ($isHatchPrepared.get(Hatch.unwrap(targetHatch))) {
      return;
    }

    $isHatchPrepared.set(Hatch.unwrap(targetHatch));

    // Get the freeze timestamp for this targetHatch (when candidate set was snapshotted)
    uint32 freezeTs = getSetTimestamp(targetHatch);
    // Defense in depth: ensure we're past the freeze timestamp
    require(freezeTs < block.timestamp, Errors.EscapeHatch__SetUnstable(targetHatch));

    uint256 setSize = $activeCandidates.lengthAtTimestamp(freezeTs);
    if (setSize == 0) {
      return;
    }

    // Prevent selection after the freeze timestamp for the NEXT potential sampling.
    // If we select after this timestamp, the selected candidate would still be in
    // the next snapshot, allowing potential re-selection with reduced bond.
    // We return early (no-op) rather than revert to allow initiateExit to proceed
    // even when we're past the selection window.
    uint32 nextFreezeTs = getSetTimestamp(targetHatch + Hatch.wrap(1));
    if (block.timestamp >= nextFreezeTs) {
      return;
    }

    // Get the seed timestamp and sample RANDAO
    uint32 seedTs = getSeedTimestamp(targetHatch);
    uint256 seed = ROLLUP.getSampleSeedAt(Timestamp.wrap(seedTs));
    uint256 index = uint256(keccak256(abi.encode(targetHatch, seed))) % setSize;
    address proposer = $activeCandidates.getAddressFromIndexAtTimestamp(index, freezeTs);

    $designatedProposer[targetHatch] = proposer;

    CandidateInfo storage data = $candidateDatas[proposer];

    // At snapshot time, the candidate must have been ACTIVE, but could have been changed to EXITING,
    // if the candidate called `initiateExit` after the freeze. In that case, skip removal as already
    // done. Any other status indicates a broken invariant and remove() will revert.
    if (data.status != Status.EXITING) {
      $activeCandidates.remove(proposer);
    }

    data.status = Status.PROPOSING;

    // exitableAt = end of hatch opening + proof submission window + proposing exit delay
    Epoch exitableEpoch =
    _getFirstEpoch(targetHatch) + Epoch.wrap(ACTIVE_DURATION) + Epoch.wrap(ROLLUP.getProofSubmissionEpochs());
    data.exitableAt = (Timestamp.unwrap(ROLLUP.getTimestampForEpoch(exitableEpoch)) + PROPOSING_EXIT_DELAY).toUint32();

    emit CandidateSelected(targetHatch, proposer);
  }

  /**
   * @notice Get the current hatch based on the current epoch
   *
   * @return The current hatch number
   */
  function getCurrentHatch() public view override(IEscapeHatch) returns (Hatch) {
    return _getHatch(ROLLUP.getCurrentEpoch());
  }

  /**
   * @notice Get the freeze timestamp for a target hatch's candidate snapshot
   *
   * @dev The snapshot taken at this timestamp determines who was eligible to be
   *      selected as proposer for this hatch.
   *
   * @param _hatch The target hatch (the one being prepared/proposed for)
   *
   * @return The timestamp at which the candidate set was frozen for this hatch
   */
  function getSetTimestamp(Hatch _hatch) public view override(IEscapeHatch) returns (uint32) {
    require(Hatch.unwrap(_hatch) >= LAG_IN_HATCHES, Errors.EscapeHatch__HatchTooEarly(_hatch));

    Epoch firstEpoch = _getFirstEpoch(_hatch - Hatch.wrap(LAG_IN_HATCHES));
    require(Epoch.unwrap(firstEpoch) >= LAG_IN_EPOCHS_FOR_SET_SIZE, Errors.EscapeHatch__HatchTooEarly(_hatch));

    Epoch freezeEpoch = firstEpoch - Epoch.wrap(LAG_IN_EPOCHS_FOR_SET_SIZE);
    return Timestamp.unwrap(ROLLUP.getTimestampForEpoch(freezeEpoch)).toUint32();
  }

  /**
   * @notice Get the seed timestamp for a target hatch's RANDAO sampling
   *
   * @dev This is after the freeze timestamp to prevent manipulation of the
   *      candidate set based on known RANDAO values.
   *
   * @param _hatch The target hatch (the one being prepared/proposed for)
   *
   * @return The timestamp at which the RANDAO seed is sampled for this hatch
   */
  function getSeedTimestamp(Hatch _hatch) public view override(IEscapeHatch) returns (uint32) {
    require(Hatch.unwrap(_hatch) >= LAG_IN_HATCHES, Errors.EscapeHatch__HatchTooEarly(_hatch));

    Hatch samplingHatch = _hatch - Hatch.wrap(LAG_IN_HATCHES);
    Epoch firstEpoch = _getFirstEpoch(samplingHatch);
    require(Epoch.unwrap(firstEpoch) >= LAG_IN_EPOCHS_FOR_RANDAO, Errors.EscapeHatch__HatchTooEarly(_hatch));

    Epoch seedEpoch = firstEpoch - Epoch.wrap(LAG_IN_EPOCHS_FOR_RANDAO);
    return Timestamp.unwrap(ROLLUP.getTimestampForEpoch(seedEpoch)).toUint32();
  }

  // ============ Internal Functions ============
  function _getHatch(Epoch _epoch) internal view returns (Hatch) {
    return Hatch.wrap(Epoch.unwrap(_epoch) / FREQUENCY);
  }

  function _getFirstEpoch(Hatch _hatch) internal view returns (Epoch) {
    return Epoch.wrap(Hatch.unwrap(_hatch) * FREQUENCY);
  }
}
