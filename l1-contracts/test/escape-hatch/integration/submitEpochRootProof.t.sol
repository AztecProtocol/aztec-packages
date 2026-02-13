// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "./EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {CommitteeAttestations, CommitteeAttestation} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";

/**
 * @title submitEpochRootProofTest
 * @notice BTT tests for submitEpochRootProof function integration with escape hatch
 *
 * @dev Tests that proof submission verifies attestations normally when escape hatch is not active,
 *      and skips attestation verification when escape hatch is active for the checkpoint's epoch.
 */
contract submitEpochRootProofTest is EscapeHatchIntegrationBase {
  // ============ Tests ============

  function test_GivenEscapeHatchIsNotConfigured() external setup(4, 4) progressEpochsToInclusion {
    // it should verify attestations normally

    full = load("mixed_checkpoint_1");

    assertEq(address(rollup.getEscapeHatch()), address(0), "Escape hatch should not be configured");

    // Propose a valid checkpoint with proper attestations
    (, CommitteeAttestation[] memory attestations) = _proposeWithCommittee();
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");

    // Submit proof WITH the valid attestations - should succeed because normal attestation
    // verification works when escape hatch is not configured
    _submitProofWithAttestations(attestations);

    assertGe(rollup.getProvenCheckpointNumber(), 1, "Proof should be accepted with valid attestations");
  }

  modifier givenEscapeHatchIsConfigured() {
    _deployEscapeHatch();
    _;
  }

  function test_WhenEscapeHatchIsNotOpenForTheProofEpoch()
    external
    setup(4, 4)
    progressEpochsToInclusion
    givenEscapeHatchIsConfigured
  {
    // it should verify attestations normally

    full = load("mixed_checkpoint_1");

    // Current epoch is NOT an escape hatch epoch
    Epoch currentEpoch = rollup.getCurrentEpoch();
    (bool isOpen,) = escapeHatch.isHatchOpen(currentEpoch);
    assertFalse(isOpen, "Escape hatch should not be open");

    // Propose a valid checkpoint with proper attestations
    (, CommitteeAttestation[] memory attestations) = _proposeWithCommittee();
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");

    // Submit proof WITH the valid attestations - should succeed because normal attestation
    // verification works when escape hatch is not open for this epoch
    _submitProofWithAttestations(attestations);

    assertGe(rollup.getProvenCheckpointNumber(), 1, "Proof should be accepted with valid attestations");
  }

  function test_WhenEscapeHatchIsOpenForTheProofEpoch()
    external
    setup(4, 4)
    progressEpochsToInclusion
    givenEscapeHatchIsConfigured
  {
    // it should skip attestation verification

    full = load("empty_checkpoint_1");

    // Setup escape hatch and warp to the escape hatch window
    _joinCandidateSet(CANDIDATE1);
    targetHatch = _selectCandidateForHatch();
    _warpToHatch(targetHatch);

    Epoch currentEpoch = rollup.getCurrentEpoch();
    (bool isOpen,) = escapeHatch.isHatchOpen(currentEpoch);
    assertTrue(isOpen, "Escape hatch should be open");

    // Propose as escape hatch proposer (no committee attestations needed)
    _proposeWithHatch(CANDIDATE1);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");

    // Submit proof with EMPTY attestations - should SUCCEED because attestations are SKIPPED
    // for escape hatch epochs
    _proveCheckpoints("empty_checkpoint_", 1, 1, address(this));

    assertGe(rollup.getProvenCheckpointNumber(), 1, "Proof should be accepted without attestation verification");
  }

  // ============ Helper Functions ============

  /**
   * @notice Submit proof with the attestations from proposal
   * @dev Used to test that normal attestation verification succeeds
   */
  function _submitProofWithAttestations(CommitteeAttestation[] memory _attestations) internal {
    bytes32 previousArchive = rollup.archiveAt(0);
    bytes32 endArchive = rollup.archiveAt(1);
    bytes32 outHash = rollup.getCheckpoint(1).outHash;

    PublicInputArgs memory args = PublicInputArgs({
      previousArchive: previousArchive, endArchive: endArchive, outHash: outHash, proverId: address(this)
    });

    bytes32[] memory fees = new bytes32[](Constants.MAX_CHECKPOINTS_PER_EPOCH * 2);
    fees[0] = bytes32(uint256(uint160(bytes20(("sequencer")))));
    fees[1] = bytes32(0);

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: 1,
        end: 1,
        args: args,
        fees: fees,
        attestations: AttestationLibHelper.packAttestations(_attestations),
        blobInputs: full.checkpoint.batchedBlobInputs,
        proof: ""
      })
    );
  }
}
