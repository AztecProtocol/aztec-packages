// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../EscapeHatchIntegrationBase.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {CheckpointLog, SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {
  CommitteeAttestations,
  CommitteeAttestation,
  Signature,
  AttestationLib
} from "@aztec/core/libraries/rollup/AttestationLib.sol";

/**
 * @title OutHashValidationSkippedTest
 * @notice Regression test for outHash validation being skipped during escape hatch epochs
 *
 * @dev This test verifies that the outHash is validated even when the escape hatch is open.
 *      Previously, the early return in verifyLastCheckpointAttestationsAndOutHash() when
 *      escape hatch was open would skip the outHash validation, allowing a malicious prover
 *      to submit an arbitrary outHash that would be inserted into the outbox.
 *
 *      Bug location: EpochProofLib.sol::verifyLastCheckpointAttestationsAndOutHash()
 *      The early `return` when escape hatch is open skipped the outHash check at the end.
 */
contract OutHashValidationSkippedTest is EscapeHatchIntegrationBase {
  function test_RevertWhen_EscapeHatchIsOpenAndOutHashMismatch() external setup(4, 4) progressEpochsToInclusion {
    // Deploy and configure escape hatch
    _deployEscapeHatch();

    full = load("empty_checkpoint_1");

    // Setup escape hatch and warp to the escape hatch window
    _joinCandidateSet(CANDIDATE1);
    targetHatch = _selectCandidateForHatch();
    _warpToHatch(targetHatch);

    // Verify escape hatch is open
    Epoch currentEpoch = rollup.getCurrentEpoch();
    (bool isOpen,) = escapeHatch.isHatchOpen(currentEpoch);
    assertTrue(isOpen, "Escape hatch should be open");

    // Propose as escape hatch proposer
    _proposeWithHatch(CANDIDATE1);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");

    // Get the correct outHash from the checkpoint
    CheckpointLog memory endCheckpoint = rollup.getCheckpoint(1);
    bytes32 correctOutHash = endCheckpoint.outHash;

    // Use a wrong outHash
    bytes32 wrongOutHash = bytes32(uint256(0xdeadbeef));

    assertNotEq(correctOutHash, wrongOutHash, "Correct outHash should not be equal to wrong outHash");

    PublicInputArgs memory args = PublicInputArgs({
      previousArchive: rollup.archiveAt(0),
      endArchive: rollup.archiveAt(1),
      outHash: wrongOutHash,
      proverId: address(this)
    });

    bytes32[] memory fees = new bytes32[](Constants.MAX_CHECKPOINTS_PER_EPOCH * 2);
    uint256 size = 1;
    for (uint256 i = 0; i < size; i++) {
      fees[i * 2] = bytes32(uint256(uint160(bytes20(("sequencer")))));
      fees[i * 2 + 1] = bytes32(0);
    }

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidOutHash.selector, correctOutHash, wrongOutHash));
    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: 1,
        end: 1,
        args: args,
        fees: fees,
        attestations: CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
        blobInputs: full.checkpoint.batchedBlobInputs,
        proof: ""
      })
    );
  }
}
