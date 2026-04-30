// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "./EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {ProposeArgs, OracleInput, ProposeLib, ProposePayload} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {
  CommitteeAttestations,
  CommitteeAttestation,
  Signature,
  AttestationLib
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {ProposedHeader, ProposedHeaderLib} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";

/**
 * @title invalidateTest
 * @notice BTT tests for invalidate function integration with escape hatch
 *
 * @dev Tests that invalidation proceeds normally when escape hatch is not active,
 *      and is blocked when escape hatch is active for the checkpoint's epoch.
 */
contract invalidateTest is EscapeHatchIntegrationBase {
  // ============ Test Data Struct ============
  struct InvalidateTestData {
    CommitteeAttestation[] attestations;
    address[] committee;
    uint256 invalidSignatureIndex;
  }

  // ============ Tests ============

  function test_GivenEscapeHatchIsNotConfigured() external setup(4, 4) progressEpochsToInclusion {
    // it should proceed with normal invalidation logic
    full = load("mixed_checkpoint_1");

    assertEq(address(rollup.getEscapeHatch()), address(0), "Escape hatch should not be configured");

    // Propose a checkpoint with one invalid attestation signature
    InvalidateTestData memory data = _proposeCheckpointWithInvalidAttestation();

    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be invalidated");

    // Invalidation should proceed normally (no CannotInvalidateEscapeHatch error)
    // and succeed because we have an invalid attestation
    rollup.invalidateBadAttestation(
      1, AttestationLibHelper.packAttestations(data.attestations), data.committee, data.invalidSignatureIndex
    );

    // Verify the checkpoint was invalidated
    assertEq(rollup.getPendingCheckpointNumber(), 0, "Checkpoint should be invalidated");
  }

  modifier givenEscapeHatchIsConfigured() {
    _deployEscapeHatch();
    _;
  }

  function test_WhenEscapeHatchIsNotOpenForTheCheckpointEpoch()
    external
    setup(4, 4)
    progressEpochsToInclusion
    givenEscapeHatchIsConfigured
  {
    // it should proceed with normal invalidation logic
    full = load("mixed_checkpoint_1");

    // Current epoch is NOT an escape hatch epoch
    Epoch currentEpoch = rollup.getCurrentEpoch();
    (bool isOpen,) = escapeHatch.isHatchOpen(currentEpoch);
    assertFalse(isOpen, "Escape hatch should not be open");

    // Propose a checkpoint with one invalid attestation signature
    InvalidateTestData memory data = _proposeCheckpointWithInvalidAttestation();

    // Invalidation should proceed normally (escape hatch check passes because epoch is not an escape hatch epoch)
    rollup.invalidateBadAttestation(
      1, AttestationLibHelper.packAttestations(data.attestations), data.committee, data.invalidSignatureIndex
    );

    // Verify the checkpoint was invalidated
    assertEq(rollup.getPendingCheckpointNumber(), 0, "Checkpoint should be invalidated");
  }

  function test_WhenEscapeHatchIsOpenForTheCheckpointEpoch()
    external
    setup(4, 4)
    progressEpochsToInclusion
    givenEscapeHatchIsConfigured
  {
    // it should revert with Rollup__CannotInvalidateEscapeHatch
    full = load("empty_checkpoint_1");

    // Setup escape hatch and warp to the escape hatch window
    _joinCandidateSet(CANDIDATE1);
    targetHatch = _selectCandidateForHatch();
    _warpToHatch(targetHatch);

    Epoch currentEpoch = rollup.getCurrentEpoch();
    (bool isOpen,) = escapeHatch.isHatchOpen(currentEpoch);
    assertTrue(isOpen, "Escape hatch should be open");

    // Propose as escape hatch proposer - this creates a checkpoint in an escape hatch epoch
    _proposeWithHatch(CANDIDATE1);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");

    // Attempting to invalidate an escape hatch checkpoint should revert
    // because escape hatch checkpoints have no committee attestations by design
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__CannotInvalidateEscapeHatch.selector));
    rollup.invalidateBadAttestation(
      1, CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}), new address[](0), 0
    );
  }

  // ============ Helper Functions ============

  /**
   * @notice Propose a checkpoint with one invalid attestation signature
   * @dev Creates a valid proposal but with one bad signature that can be used to invalidate
   */
  function _proposeCheckpointWithInvalidAttestation() internal returns (InvalidateTestData memory data) {
    ProposedHeader memory header = full.checkpoint.header;

    // Jump to block time
    vm.warp(max(block.timestamp, Timestamp.unwrap(full.checkpoint.header.timestamp)));

    rollup.setupEpoch();

    address proposer = rollup.getCurrentProposer();
    data.committee = rollup.getEpochCommittee(rollup.getCurrentEpoch());

    // Update header with current values
    {
      uint128 manaMinFee = SafeCast.toUint128(rollup.getManaMinFeeAt(Timestamp.wrap(block.timestamp), true));
      header.gasFees.feePerL2Gas = manaMinFee;
    }

    ProposeArgs memory proposeArgs =
      ProposeArgs({header: header, archive: full.checkpoint.archive, oracleInput: OracleInput(0)});

    skipBlobCheck(address(rollup));

    // Build propose payload for signing
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
        // Create an invalid attestation by using a wrong key
        uint256 invalidKey = uint256(keccak256(abi.encode("invalid", block.timestamp)));
        address invalidSigner = vm.addr(invalidKey);
        attesterPrivateKeys[invalidSigner] = invalidKey;
        data.attestations[i] = _createAttestation(invalidSigner, digest);
        data.invalidSignatureIndex = i;
        break;
      }
    }

    // Proposer signs over attestations and signers
    Signature memory attestationsAndSignersSignature =
    _createAttestation(
      proposer,
      AttestationLib.getAttestationsAndSignersDigest(
        AttestationLibHelper.packAttestations(data.attestations), signers, address(rollup)
      )
    ).signature;

    // Propose the checkpoint
    vm.prank(proposer);
    rollup.propose(
      proposeArgs,
      AttestationLibHelper.packAttestations(data.attestations),
      signers,
      attestationsAndSignersSignature,
      full.checkpoint.blobCommitments
    );

    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");
  }
}
