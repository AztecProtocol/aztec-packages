// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../integration/EscapeHatchIntegrationBase.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {IEscapeHatchCore, IEscapeHatch, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {ProposeArgs, OracleInput, ProposeLib, ProposePayload} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {ProposedHeader, ProposedHeaderLib, GasFees} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {
  CommitteeAttestations,
  CommitteeAttestation,
  Signature,
  AttestationLib
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";

/**
 * @title EscapeHatchReplacementTest
 * @notice E2E tests for escape hatch governance replacement scenarios.
 *
 * @dev These tests assert the DESIRED behavior when governance replaces the escape hatch.
 *      They currently FAIL (before #20363) because the escape hatch lookup is not epoch-stable:
 *
 *      - ProposeLib queries the CURRENT escape hatch for the proposal path decision,
 *        so a mid-epoch replacement retroactively blocks an already-selected proposer.
 *
 *      - EscapeHatch.selectCandidates has no deactivation guard, so candidates are
 *        selected on a contract the rollup no longer uses.
 *
 *      - EscapeHatch.validateProofSubmission punishes candidates who had no way to
 *        propose because the rollup stopped recognizing the old escape hatch.
 *
 *      - EpochProofLib skips attestation verification for retroactively classified
 *        escape hatch epochs, allowing proofs with bad attestations through.
 *
 *      - InvalidateLib blocks invalidation for retroactively classified escape hatch
 *        epochs, protecting checkpoints with bad attestations from removal.
 *
 *      After epoch-stable snapshotting is implemented, these tests should PASS.
 */
contract EscapeHatchReplacementTest is EscapeHatchIntegrationBase {
  using stdStorage for StdStorage;

  // ============================================================================
  // Helpers for retroactive escape hatch deployment
  // ============================================================================

  struct BadAttestationData {
    CommitteeAttestations packedAttestations;
    CommitteeAttestation[] attestations;
    address[] committee;
    uint256 invalidSignatureIndex;
    Epoch proposalEpoch;
  }

  /**
   * @notice Propose a checkpoint during a normal epoch with one bad attestation signature
   * @dev Adapted from invalidate.t.sol - creates a valid proposal except one committee
   *      member's signature is replaced with a signature from an unrelated key.
   */
  function _proposeWithBadAttestation() internal returns (BadAttestationData memory data) {
    ProposedHeader memory header = full.checkpoint.header;

    vm.warp(max(block.timestamp, Timestamp.unwrap(full.checkpoint.header.timestamp)));

    rollup.setupEpoch();
    data.proposalEpoch = rollup.getCurrentEpoch();

    address proposer = rollup.getCurrentProposer();
    data.committee = rollup.getEpochCommittee(data.proposalEpoch);

    {
      uint128 manaMinFee = SafeCast.toUint128(rollup.getManaMinFeeAt(Timestamp.wrap(block.timestamp), true));
      header.gasFees.feePerL2Gas = manaMinFee;
    }

    ProposeArgs memory proposeArgs =
      ProposeArgs({header: header, archive: full.checkpoint.archive, oracleInput: OracleInput(0)});

    skipBlobCheck(address(rollup));

    ProposePayload memory proposePayload = ProposePayload({
      archive: proposeArgs.archive, oracleInput: proposeArgs.oracleInput, headerHash: ProposedHeaderLib.hash(header)
    });

    // Create attestations - all valid except one
    uint256 committeeSize = data.committee.length;
    data.attestations = new CommitteeAttestation[](committeeSize);
    address[] memory signers = new address[](committeeSize);
    bytes32 digest = ProposeLib.digest(proposePayload, address(rollup));

    for (uint256 i = 0; i < committeeSize; i++) {
      data.attestations[i] = _createAttestation(data.committee[i], digest);
      signers[i] = data.committee[i];
    }

    // Make one attestation invalid (not the proposer's)
    for (uint256 i = 0; i < committeeSize; i++) {
      if (data.committee[i] != proposer) {
        uint256 invalidKey = uint256(keccak256(abi.encode("invalid", block.timestamp)));
        address invalidSigner = vm.addr(invalidKey);
        attesterPrivateKeys[invalidSigner] = invalidKey;
        data.attestations[i] = _createAttestation(invalidSigner, digest);
        data.invalidSignatureIndex = i;
        break;
      }
    }

    data.packedAttestations = AttestationLibHelper.packAttestations(data.attestations);

    // Proposer signs over attestations and signers
    Signature memory attestationsAndSignersSignature =
    _createAttestation(
      proposer, AttestationLib.getAttestationsAndSignersDigest(data.packedAttestations, signers, address(rollup))
    ).signature;

    vm.prank(proposer);
    rollup.propose(
      proposeArgs, data.packedAttestations, signers, attestationsAndSignersSignature, full.checkpoint.blobCommitments
    );

    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");
  }

  /**
   * @notice Deploy an escape hatch that retroactively classifies a given epoch as an escape hatch epoch
   * @dev Deploys a new EscapeHatch with frequency/activeDuration chosen so the target epoch
   *      falls in the active window, then uses stdstore to set a designated proposer.
   */
  function _deployRetroactiveEscapeHatch(Epoch _epoch) internal {
    uint256 epochNum = Epoch.unwrap(_epoch);

    // Choose parameters so epoch % frequency < activeDuration
    // With frequency = epochNum + 2, activeDuration = epochNum + 1:
    //   epochNum % (epochNum + 2) = epochNum < epochNum + 1 ✓
    uint256 proofSubmissionEpochs = rollup.getProofSubmissionEpochs();
    uint256 newActiveDuration = epochNum + 1;
    if (newActiveDuration < proofSubmissionEpochs + 1) {
      newActiveDuration = proofSubmissionEpochs + 1;
    }
    uint256 newFrequency = newActiveDuration + 1;
    // Ensure frequency > LAG_IN_EPOCHS_FOR_SET_SIZE (2)
    if (newFrequency <= 2) {
      newFrequency = 3;
      newActiveDuration = 2;
    }

    EscapeHatch retroactiveEscapeHatch = new EscapeHatch(
      address(rollup),
      address(testERC20),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      newFrequency,
      newActiveDuration,
      DEFAULT_LAG_IN_HATCHES,
      DEFAULT_PROPOSING_EXIT_DELAY
    );
    vm.label(address(retroactiveEscapeHatch), "RetroactiveEscapeHatch");

    // Set designated proposer so isHatchOpen returns true
    uint256 hatchNumber = epochNum / newFrequency;
    stdstore.target(address(retroactiveEscapeHatch)).sig("getDesignatedProposer(uint256)").with_key(hatchNumber)
      .checked_write(address(0xBEEF));

    // Update rollup to use the new escape hatch
    address rollupOwner = Ownable(address(rollup)).owner();
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(retroactiveEscapeHatch));

    // Verify the epoch is now classified as escape hatch
    (bool isOpen,) = retroactiveEscapeHatch.isHatchOpen(_epoch);
    assertTrue(isOpen, "Epoch should be retroactively classified as escape hatch");
  }

  /**
   * @notice Variant of _proposeWithHatch that expects the rollup.propose() call to revert.
   */
  function _proposeWithHatchExpectRevert(address _proposer) internal {
    (ProposeArgs memory args, bytes memory blobs) = _buildProposeArgs(_proposer);
    skipBlobCheck(address(rollup));

    vm.expectRevert();
    vm.prank(_proposer);
    rollup.propose(
      args,
      CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
      new address[](0),
      Signature({v: 0, r: 0, s: 0}),
      blobs
    );
  }

  /**
   * @notice Proposer should still be able to propose after mid-epoch replacement
   *
   *         A proposer selected for an escape hatch epoch should still be able to propose
   *         even if governance replaces the escape hatch mid-epoch.
   *
   * @dev DESIRED: Proposal succeeds because epoch-stable snapshotting preserves the
   *      escape hatch that was active when the epoch started.
   */
  function test_proposerCanStillProposeAfterMidEpochReplacement() public setup(48, 48) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Setup: candidate joins, is selected, warp to hatch window
    _joinCandidateSet(CANDIDATE1);
    targetHatch = _selectCandidateForHatch();
    assertEq(escapeHatch.getDesignatedProposer(targetHatch), CANDIDATE1, "CANDIDATE1 should be proposer");

    _warpToHatch(targetHatch);

    // Governance replaces escape hatch mid-epoch
    address rollupOwner = Ownable(address(rollup)).owner();
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(0));

    // DESIRED: Proposal should still succeed (epoch-stable snapshot preserves escape hatch)
    // CURRENT: This REVERTS because ProposeLib uses the current escape hatch (address(0))
    _proposeWithHatch(CANDIDATE1);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Proposal should succeed with epoch-stable escape hatch");
  }

  /**
   * @notice Already-selected candidate should NOT be punished after deactivation
   *
   *         A candidate selected before escape hatch deactivation should not be
   *         punished for failing to propose - they had no way to fulfill their duty.
   *
   * @dev DESIRED: validateProofSubmission recognizes the escape hatch was deactivated
   *      and does NOT apply punishment. Bond stays at DEFAULT_BOND_SIZE.
   */
  function test_alreadySelectedCandidateNotPunishedAfterDeactivation() public setup(48, 48) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Step 1: Candidate joins and is selected for a hatch
    _joinCandidateSet(CANDIDATE1);
    targetHatch = _selectCandidateForHatch();

    assertEq(escapeHatch.getDesignatedProposer(targetHatch), CANDIDATE1, "Should be designated proposer");
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.PROPOSING), "Should be in PROPOSING state");
    assertEq(info.amount, DEFAULT_BOND_SIZE, "Should have full bond");

    // Step 2: Governance removes escape hatch BEFORE the hatch window
    address rollupOwner = Ownable(address(rollup)).owner();
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(0));

    // Step 3: The hatch window arrives - demonstrate the candidate CANNOT propose.
    //         The rollup no longer recognizes any escape hatch, so ProposeLib falls
    //         through to the committee attestation path, which fails for escape hatch
    //         proposals (they carry no committee attestations).
    _warpToHatch(targetHatch);
    assertEq(address(rollup.getEscapeHatch()), address(0), "Rollup should have no escape hatch");

    _proposeWithHatchExpectRevert(CANDIDATE1);

    // Step 4: The candidate is stuck in PROPOSING on the dead escape hatch contract.
    //         They can't propose (step 3) and can't exit until exitable at.
    //         This is true in both current and fixed implementations since the
    //         governance update moved us to a future epoch from the update.
    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.PROPOSING), "Still stuck in PROPOSING on dead contract");

    // Step 5: Warp to exitable at and validate proof submission
    _warpToExitableAt(CANDIDATE1);
    escapeHatch.validateProofSubmission(targetHatch);

    // DESIRED: Candidate should NOT be punished - they had no way to propose
    // CURRENT: info.amount == DEFAULT_BOND_SIZE - DEFAULT_FAILED_HATCH_PUNISHMENT
    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertTrue(info.status == Status.EXITING, "Should be EXITING after validation");
    assertEq(info.amount, DEFAULT_BOND_SIZE, "Candidate should NOT be punished when escape hatch was deactivated");
  }

  /**
   * @notice selectCandidates should be no-op on deactivated escape hatch
   *
   *         selectCandidates() should not select new candidates on a deactivated
   *         escape hatch contract. Candidates selected on a dead contract can never
   *         propose and inevitably get punished.
   *
   * @dev DESIRED: selectCandidates() is a no-op when the contract is no longer the
   *      active escape hatch. Candidate remains in ACTIVE state.
   */
  function test_selectCandidatesNoOpOnDeactivatedEscapeHatch() public setup(48, 48) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Step 1: Candidate joins escape hatch
    _joinCandidateSet(CANDIDATE1);

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.ACTIVE), "Should be ACTIVE after joining");

    // Step 2: Governance deactivates the escape hatch BEFORE selection
    address rollupOwner = Ownable(address(rollup)).owner();
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(0));

    assertEq(address(rollup.getEscapeHatch()), address(0), "Rollup should have no escape hatch");

    // Step 3: Call selectCandidates on the deactivated escape hatch
    _setRandomPrevrandao();
    _warpForwardEpochs(DEFAULT_FREQUENCY);
    escapeHatch.selectCandidates();

    // DESIRED: Candidate should remain in ACTIVE state (selectCandidates is no-op)
    // CURRENT: Candidate transitions to PROPOSING on a dead contract
    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertTrue(info.status == Status.ACTIVE, "Candidate should remain ACTIVE on deactivated escape hatch");
  }

  /**
   * @notice Proof submission should verify attestations for normal epochs
   *
   *         Proof submission should still verify attestation signatures for checkpoints
   *         proposed during a normal epoch, even if the escape hatch is retroactively
   *         configured to classify that epoch as an escape hatch epoch.
   *
   * @dev DESIRED: Proof fails because attestation verification catches the bad signature.
   *      The epoch was normal at propose time, so attestation verification should run.
   */
  function test_proofSubmissionVerifiesAttestationsForNormalEpoch() public setup(4, 4) progressEpochsToInclusion {
    full = load("mixed_checkpoint_1");

    // Step 1: Propose during a normal epoch (no escape hatch configured)
    //         One attestation has an invalid signature
    BadAttestationData memory data = _proposeWithBadAttestation();

    // Step 2: Deploy an escape hatch that retroactively covers the proposal epoch
    _deployRetroactiveEscapeHatch(data.proposalEpoch);

    // Step 3: Submit proof with the stored attestations
    // DESIRED: Proof fails (attestation verification catches bad signature)
    // CURRENT: Proof succeeds (attestation verification SKIPPED due to retroactive escape hatch)
    bytes32 previousArchive = rollup.archiveAt(0);
    bytes32 endArchive = rollup.archiveAt(1);

    bytes32[] memory fees = new bytes32[](64);
    fees[0] = bytes32(uint256(uint160(bytes20(("sequencer")))));
    fees[1] = bytes32(0);

    vm.expectRevert();
    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: 1,
        end: 1,
        args: PublicInputArgs({
          previousArchive: previousArchive,
          endArchive: endArchive,
          outHash: full.checkpoint.header.outHash,
          proverId: address(this)
        }),
        fees: fees,
        attestations: data.packedAttestations,
        blobInputs: full.checkpoint.batchedBlobInputs,
        proof: ""
      })
    );
  }

  /**
   * @notice Invalidation should work for normal epoch checkpoints
   *
   *         A checkpoint proposed during a normal epoch with a bad attestation should
   *         be invalidatable, even if the escape hatch is retroactively configured to
   *         classify that epoch as an escape hatch epoch.
   *
   * @dev DESIRED: Invalidation succeeds because the epoch was normal at propose time.
   *      The bad attestation is detected and the checkpoint is removed.
   */
  function test_invalidationWorksForNormalEpochCheckpoint() public setup(4, 4) progressEpochsToInclusion {
    full = load("mixed_checkpoint_1");

    // Step 1: Propose during a normal epoch (no escape hatch configured)
    //         One attestation has an invalid signature
    BadAttestationData memory data = _proposeWithBadAttestation();

    // Step 2: Deploy an escape hatch that retroactively covers the proposal epoch
    _deployRetroactiveEscapeHatch(data.proposalEpoch);

    // Step 3: Invalidate the checkpoint using the bad attestation
    // DESIRED: Invalidation succeeds (epoch was normal, bad attestation detected)
    // CURRENT: Reverts with CannotInvalidateEscapeHatch (retroactive classification blocks invalidation)
    rollup.invalidateBadAttestation(1, data.packedAttestations, data.committee, data.invalidSignatureIndex);

    assertEq(rollup.getPendingCheckpointNumber(), 0, "Checkpoint should be invalidated");
  }

  /**
   * @notice Mid-window deactivation - candidate who proposed is still punished
   *
   *         When the escape hatch is deactivated mid-window and the candidate DID propose
   *         during the first epoch, they are still held to normal validation. If their proof
   *         was not submitted, they get punished.
   *
   * @dev Scenario:
   *      1. Candidate selected, proposes during first epoch of active window
   *      2. Governance deactivates escape hatch during the first epoch. With next-epoch
   *         activation, the second epoch no longer has the escape hatch.
   *      3. Proof for the proposed checkpoint is never submitted
   *      4. At validation: candidate proposed something and is "living up to that" -
   *         normal validation applies, punishment for unproven checkpoint.
   *
   *      This test PASSES in both current and fixed implementations because the
   *      candidate took on responsibility by proposing and must be held accountable.
   */
  function test_midWindowDeactivation_proposedThenDeactivated_stillPunished()
    public
    setup(48, 48)
    progressEpochsToInclusion
  {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Step 1: Candidate joins and is selected for a hatch
    _joinCandidateSet(CANDIDATE1);
    targetHatch = _selectCandidateForHatch();
    assertEq(escapeHatch.getDesignatedProposer(targetHatch), CANDIDATE1, "Should be designated proposer");

    // Step 2: Warp to first epoch of hatch window and propose successfully
    _warpToHatch(targetHatch);
    _proposeWithHatch(CANDIDATE1);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");

    // Step 3: Governance deactivates escape hatch during the first epoch of the window.
    //         With next-epoch activation, the second epoch no longer has the escape hatch,
    //         so the candidate loses coverage for the latter half of their window.
    address rollupOwner = Ownable(address(rollup)).owner();
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(0));

    // Step 4: Candidate proposed but proof was never submitted - should be punished
    _warpToExitableAt(CANDIDATE1);
    escapeHatch.validateProofSubmission(targetHatch);

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Should be EXITING after validation");
    assertEq(
      info.amount,
      DEFAULT_BOND_SIZE - DEFAULT_FAILED_HATCH_PUNISHMENT,
      "Should be punished - proposed but proof not submitted"
    );
  }

  /**
   * @notice Mid-window deactivation - candidate who did NOT propose is free
   *
   *         When the escape hatch is deactivated mid-window and the candidate did NOT
   *         propose, they should NOT be punished - the disruption from governance's
   *         mid-window change excuses them even though they could have proposed during
   *         the first epoch of the window.
   *
   * @dev Scenario:
   *      1. Candidate selected for a hatch but does NOT propose during first epoch
   *      2. Governance deactivates escape hatch during the first epoch. With next-epoch
   *         activation, the second epoch no longer has the escape hatch.
   *      3. At validation: candidate did nothing AND escape hatch was disrupted -
   *         no punishment despite the candidate potentially stalling for one epoch.
   *
   *      DESIRED: No punishment (candidate gets benefit of the doubt under disruption).
   */
  function test_midWindowDeactivation_didNotPropose_notPunished() public setup(48, 48) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Step 1: Candidate joins and is selected for a hatch
    _joinCandidateSet(CANDIDATE1);
    targetHatch = _selectCandidateForHatch();
    assertEq(escapeHatch.getDesignatedProposer(targetHatch), CANDIDATE1, "Should be designated proposer");

    // Step 2: Warp to first epoch of hatch window but do NOT propose
    _warpToHatch(targetHatch);

    // Step 3: Governance deactivates escape hatch during the first epoch of the window.
    //         With next-epoch activation, the second epoch no longer has the escape hatch,
    //         so the candidate's window is disrupted partway through.
    address rollupOwner = Ownable(address(rollup)).owner();
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(0));

    // Step 4: Candidate didn't propose and escape hatch was deactivated mid-window.
    //         Even though they could have stalled for one epoch, the benefit of the
    //         doubt is given since governance disrupted the active window.
    _warpToExitableAt(CANDIDATE1);
    escapeHatch.validateProofSubmission(targetHatch);

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Should be EXITING after validation");
    assertEq(info.amount, DEFAULT_BOND_SIZE, "Should NOT be punished - did not propose and escape hatch was disrupted");
  }
}
