// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {PartialEpochProofGasReportBase} from "./happy.t.sol";
import {ExpectedEpochPublicInputsVerifier} from "./CompactEpochProof.t.sol";
import {SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";

// solhint-disable comprehensive-interface

/**
 * @notice Epoch proofs against a non-empty Inbox, covering the proven-consumption callback.
 *
 * Every other epoch-proof fixture proves an epoch whose Inbox never received a message, so the callback that
 * unlocks bucket eviction is never reached. These scenarios seed the Inbox ahead of the fixture epoch and assert
 * the eviction boundary that results from a first proof, from extensions that do and do not consume a further
 * bucket, and from submissions whose header layout or already-proven prefix could otherwise steer the decision.
 */
abstract contract InboxCallbackScenarioBase is PartialEpochProofGasReportBase {
  /// @dev The `[1...16]` submission with its first `_prefixLength` already-proven headers compacted away.
  function _extensionSubmission(uint256 _prefixLength) internal view returns (SubmitEpochRootProofArgs memory) {
    return _compactSubmission(_getGasReportSubmission(16), _prefixLength);
  }

  function _bindPublicInputs(SubmitEpochRootProofArgs memory _args) internal {
    bytes32[] memory inputs =
      rollup.getEpochProofPublicInputs(_args.start, _args.end, _args.args, _args.headers, _args.blobInputs);
    ExpectedEpochPublicInputsVerifier verifier = new ExpectedEpochPublicInputsVerifier(inputs);
    vm.etch(address(rollup.getEpochProofVerifier()), address(verifier).code);
  }
}

/// @notice A first, non-overlapping proof that consumes messages. The callback must fire.
contract InboxCallbackFirstProofTest is InboxCallbackScenarioBase {
  function _seedInitialInboxBucket() internal pure override returns (bool) {
    return true;
  }

  function testFirstProofConsumingInbox() public {
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 0);
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    assertEq(rollup.getProvenCheckpointNumber(), 8);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 1);
  }
}

/// @notice An extension over an already-proven prefix that consumes nothing new leaves the boundary where it was.
contract InboxCallbackNoNewConsumptionTest is InboxCallbackScenarioBase {
  function _seedInitialInboxBucket() internal pure override returns (bool) {
    return true;
  }

  function setUp() public override {
    super.setUp();
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 1);
  }

  function testCompactedExtension() public {
    rollup.submitEpochRootProof(_extensionSubmission(8));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 1);
  }

  function testUncompactedExtension() public {
    rollup.submitEpochRootProof(_extensionSubmission(0));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 1);
  }
}

/// @notice An extension whose new checkpoints consume a further bucket must move the boundary to it.
contract InboxCallbackNewConsumptionTest is InboxCallbackScenarioBase {
  function _seedInitialInboxBucket() internal pure override returns (bool) {
    return true;
  }

  function _seedSecondInboxBucket() internal pure override returns (bool) {
    return true;
  }

  function setUp() public override {
    super.setUp();
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 1);
  }

  function testCompactedExtension() public {
    rollup.submitEpochRootProof(_extensionSubmission(8));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
  }

  function testUncompactedExtension() public {
    rollup.submitEpochRootProof(_extensionSubmission(0));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
  }
}

/// @notice An extension on an Inbox that never received a message. The whole-epoch guard skips the callback.
contract InboxCallbackEmptyInboxTest is InboxCallbackScenarioBase {
  function setUp() public override {
    super.setUp();
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 0);
  }

  function testCompactedExtension() public {
    rollup.submitEpochRootProof(_extensionSubmission(8));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 0);
  }

  function testUncompactedExtension() public {
    rollup.submitEpochRootProof(_extensionSubmission(0));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 0);
  }
}

/// @notice The callback must follow canonical storage, not the submission's header layout.
contract InboxCallbackRegressionTest is InboxCallbackScenarioBase {
  function _seedInitialInboxBucket() internal pure override returns (bool) {
    return true;
  }

  function _seedSecondInboxBucket() internal pure override returns (bool) {
    return true;
  }

  function setUp() public override {
    super.setUp();
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    assertEq(rollup.getProvenCheckpointNumber(), 8);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 1);
  }

  /// @dev The old proven tip has no full header left in the array; nothing may index into it.
  function testSingleCheckpointExtensionWithFullyCompactedPrefix() public {
    rollup.submitEpochRootProof(_compactSubmission(_getGasReportSubmission(9), 8));
    assertEq(rollup.getProvenCheckpointNumber(), 9);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
  }

  /// @dev Same submission uncompacted: the outcome must not depend on the compact-prefix length.
  function testSingleCheckpointExtensionWithoutCompaction() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(9));
    assertEq(rollup.getProvenCheckpointNumber(), 9);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
  }

  function testPartiallyCompactedExtensionAdvancesConsumption() public {
    rollup.submitEpochRootProof(_compactSubmission(_getGasReportSubmission(16), 4));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
  }

  /**
   * @dev An already-proven header may be supplied in full but is not rehashed against storage, so its
   * `inboxRollingHash` is unauthenticated. Tampering with it must not steer the callback. The proof is checked
   * against the public inputs the Rollup assembles from the untampered submission, so a condition that read the
   * tampered field would have to reach its decision on inputs the verifier never saw.
   */
  function testTamperedProvenHeaderRollingHashDoesNotSuppressCallback() public {
    SubmitEpochRootProofArgs memory args = _getGasReportSubmission(16);
    _bindPublicInputs(args);
    // Checkpoints 9-16 consume bucket 2, so the canonical hash at the old tip differs from the end hash and the
    // callback is owed. Claim on checkpoint 8's unverified header that the epoch ended where it began.
    args.headers[7].inboxRollingHash = args.args.endInboxRollingHash;
    rollup.submitEpochRootProof(args);
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
  }

  /// @dev A submission built at tip 8 but included after the tip already moved compares against the real tip.
  function testSubmissionIncludedAfterAnotherProofAdvancedTheTip() public {
    SubmitEpochRootProofArgs memory prepared = _getGasReportSubmission(16);
    rollup.submitEpochRootProof(_getGasReportSubmission(12));
    assertEq(rollup.getProvenCheckpointNumber(), 12);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
    rollup.submitEpochRootProof(prepared);
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
  }

  /// @dev A proof that does not advance the tip must not touch the Inbox record.
  function testRepeatedProofDoesNotAdvanceConsumption() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(16));
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
    rollup.submitEpochRootProof(_getGasReportSubmission(12));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getInbox().getProvenConsumedBucketSeq(), 2);
  }
}
