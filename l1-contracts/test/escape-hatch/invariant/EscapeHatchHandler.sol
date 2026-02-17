// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {IEscapeHatch, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";

/**
 * @title EscapeHatchHandler
 * @notice Handler contract for EscapeHatch invariant testing
 *
 * @dev Wraps EscapeHatch functions with proper preconditions to ensure
 *      meaningful state transitions during fuzzing. Tracks ghost variables
 *      for cross-call invariant verification.
 */
contract EscapeHatchHandler is Test {
  EscapeHatch public escapeHatch;
  TestERC20 public bondToken;
  address public rollup;

  // ============ Actor Management ============

  address[] public actors;
  mapping(address => bool) public isActor;
  address public currentActor;

  // ============ Ghost Variables ============

  /// @notice Tracks all addresses that have ever joined
  address[] public allCandidates;
  mapping(address => bool) public hasJoined;

  /// @notice Tracks all hatches that have been prepared with a proposer
  Hatch[] public preparedHatches;
  mapping(Hatch => bool) public isTrackedHatch;

  /// @notice Tracks successful validations per hatch (PROPOSING -> EXITING transition)
  mapping(Hatch => uint256) public successfulValidations;

  /// @notice Call counters for debugging
  uint256 public joinCalls;
  uint256 public initiateExitCalls;
  uint256 public leaveCalls;
  uint256 public selectCalls;
  uint256 public validateCalls;
  uint256 public successfulValidateCalls;
  uint256 public warpCalls;

  // ============ Constructor ============

  constructor(EscapeHatch _escapeHatch, TestERC20 _bondToken, address _rollup) {
    escapeHatch = _escapeHatch;
    bondToken = _bondToken;
    rollup = _rollup;

    // Create a pool of actors
    for (uint256 i = 0; i < 10; i++) {
      address actor = makeAddr(string(abi.encodePacked("actor", i)));
      actors.push(actor);
      isActor[actor] = true;
    }
  }

  // ============ Modifiers ============

  modifier useActor(uint256 _seed) {
    currentActor = actors[bound(_seed, 0, actors.length - 1)];
    vm.startPrank(currentActor);
    _;
    vm.stopPrank();
  }

  // ============ Handler Functions ============

  /**
   * @notice Handler for joinCandidateSet
   * @dev Mints tokens and approves before joining
   */
  function joinCandidateSet(uint256 _actorSeed) external useActor(_actorSeed) {
    joinCalls++;

    // Skip if already joined or has non-NONE status
    CandidateInfo memory info = escapeHatch.getCandidateInfo(currentActor);
    if (info.status != Status.NONE) {
      return;
    }
    if (escapeHatch.isCandidate(currentActor)) {
      return;
    }

    // Mint and approve
    uint96 bondSize = escapeHatch.getBondSize();
    vm.stopPrank();
    vm.prank(bondToken.owner());
    bondToken.mint(currentActor, bondSize);
    vm.startPrank(currentActor);
    bondToken.approve(address(escapeHatch), bondSize);

    // Join
    escapeHatch.joinCandidateSet();

    // Track ghost state
    if (!hasJoined[currentActor]) {
      hasJoined[currentActor] = true;
      allCandidates.push(currentActor);
    }
  }

  /**
   * @notice Handler for initiateExit
   * @dev Only calls if actor is in candidate set with ACTIVE status
   */
  function initiateExit(uint256 _actorSeed) external useActor(_actorSeed) {
    initiateExitCalls++;
    try escapeHatch.initiateExit() {} catch {}
  }

  /**
   * @notice Handler for leaveCandidateSet
   * @dev Only calls if actor is EXITING and past exitableAt
   */
  function leaveCandidateSet(uint256 _actorSeed) external useActor(_actorSeed) {
    leaveCalls++;
    try escapeHatch.leaveCandidateSet() {} catch {}
  }

  /**
   * @notice Handler for selectCandidates
   * @dev Permissionless - can be called anytime. Tracks prepared hatches.
   */
  function selectCandidates() external {
    selectCalls++;

    // Calculate the target hatch that will be prepared
    Hatch currentHatch = escapeHatch.getCurrentHatch();
    Hatch targetHatch = currentHatch + Hatch.wrap(escapeHatch.getLagInHatches());

    try escapeHatch.selectCandidates() {
      // Track the hatch if it has a proposer and we haven't tracked it yet
      if (!isTrackedHatch[targetHatch]) {
        address proposer = escapeHatch.getDesignatedProposer(targetHatch);
        if (proposer != address(0)) {
          preparedHatches.push(targetHatch);
          isTrackedHatch[targetHatch] = true;
        }
      }
    } catch {}
  }

  /**
   * @notice Handler for validateProofSubmission
   * @dev 50/50 selection: random from all prepared hatches OR recent hatch search
   *      Tracks successful validations (PROPOSING -> EXITING transitions)
   */
  function validateProofSubmission(uint256 _seed) external {
    validateCalls++;

    Hatch hatchToValidate;
    bool foundHatch = false;

    // 50/50: use seed to decide between random historical vs recent search
    if (_seed % 2 == 0 && preparedHatches.length > 0) {
      // Random from ALL prepared hatches (can hit old hatches)
      uint256 index = bound(_seed / 2, 0, preparedHatches.length - 1);
      hatchToValidate = preparedHatches[index];
      foundHatch = true;
    } else {
      // Existing approach: search recent hatches
      Epoch currentEpoch = IValidatorSelection(rollup).getCurrentEpoch();
      Hatch currentHatch = escapeHatch.getHatch(currentEpoch);

      for (uint256 i = 0; i < 10; i++) {
        if (Hatch.unwrap(currentHatch) < i) {
          break;
        }

        Hatch hatch = currentHatch - Hatch.wrap(i);
        address proposer = escapeHatch.getDesignatedProposer(hatch);

        if (proposer == address(0)) {
          continue;
        }

        CandidateInfo memory info = escapeHatch.getCandidateInfo(proposer);
        if (info.status != Status.PROPOSING) {
          continue;
        }

        if (block.timestamp < info.exitableAt) {
          continue;
        }

        hatchToValidate = hatch;
        foundHatch = true;
        break;
      }
    }

    if (!foundHatch) {
      return;
    }

    // Get proposer and check preconditions
    address proposer = escapeHatch.getDesignatedProposer(hatchToValidate);
    if (proposer == address(0)) {
      return;
    }

    CandidateInfo memory infoBefore = escapeHatch.getCandidateInfo(proposer);

    // Attempt validation
    try escapeHatch.validateProofSubmission(hatchToValidate) {
      // Check if this was a successful validation (status transitioned)
      CandidateInfo memory infoAfter = escapeHatch.getCandidateInfo(proposer);
      if (infoBefore.status == Status.PROPOSING && infoAfter.status == Status.EXITING) {
        successfulValidations[hatchToValidate]++;
        successfulValidateCalls++;
      }
    } catch {}
  }

  /**
   * @notice Handler for time advancement
   * @dev Warps forward by a bounded number of epochs
   */
  function warpForward(uint256 _epochsSeed) external {
    warpCalls++;

    uint256 frequency = escapeHatch.getFrequency();
    // Warp between 1 and 2*frequency epochs
    uint256 epochsToWarp = bound(_epochsSeed, 1, frequency * 2);

    // Get epoch duration from rollup
    uint256 slotDuration = IValidatorSelection(rollup).getSlotDuration();
    uint256 epochDuration = IValidatorSelection(rollup).getEpochDuration();
    uint256 timeToWarp = epochsToWarp * epochDuration * slotDuration;

    vm.warp(block.timestamp + timeToWarp);
  }

  // ============ View Functions ============

  function getActorCount() external view returns (uint256) {
    return actors.length;
  }

  function getAllCandidatesCount() external view returns (uint256) {
    return allCandidates.length;
  }

  function getActor(uint256 _index) external view returns (address) {
    return actors[_index];
  }

  function getAllCandidate(uint256 _index) external view returns (address) {
    return allCandidates[_index];
  }

  function getPreparedHatchesCount() external view returns (uint256) {
    return preparedHatches.length;
  }

  function getPreparedHatch(uint256 _index) external view returns (Hatch) {
    return preparedHatches[_index];
  }

  function getSuccessfulValidations(Hatch _hatch) external view returns (uint256) {
    return successfulValidations[_hatch];
  }
}
