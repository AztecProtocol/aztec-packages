// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {PartialEpochProofGasReportBase} from "./happy.t.sol";
import {SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {ProposedHeader, ProposedHeaderLib} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

contract ExpectedEpochPublicInputsVerifier {
  bytes32 private immutable expected;

  constructor(bytes32[] memory _inputs) {
    expected = keccak256(abi.encode(_inputs));
  }

  function verify(bytes calldata, bytes32[] calldata _inputs) external view returns (bool) {
    return keccak256(abi.encode(_inputs)) == expected;
  }
}

contract CompactEpochProofTest is PartialEpochProofGasReportBase {
  struct LegacySubmission {
    uint256 start;
    uint256 end;
    PublicInputArgs args;
    ProposedHeader[] headers;
    CommitteeAttestations attestations;
    bytes blobInputs;
    bytes proof;
  }

  function _bindPublicInputs(SubmitEpochRootProofArgs memory _args) internal {
    bytes32[] memory inputs =
      rollup.getEpochProofPublicInputs(_args.start, _args.end, _args.args, _args.headers, _args.blobInputs);
    ExpectedEpochPublicInputsVerifier verifier = new ExpectedEpochPublicInputsVerifier(inputs);
    vm.etch(address(rollup.getEpochProofVerifier()), address(verifier).code);
  }

  function testCompactExtensionPreservesPublicInputsAndRewards() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    SubmitEpochRootProofArgs memory fullArgs = _getGasReportSubmission(16);
    _bindPublicInputs(fullArgs);
    uint256 snapshot = vm.snapshotState();
    rollup.submitEpochRootProof(fullArgs);
    uint256 rewards = rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(GAS_REPORT_EPOCH));
    uint256[] memory sequencerRewards = new uint256[](16);
    for (uint256 i = 0; i < 16; i++) {
      sequencerRewards[i] = rollup.getSequencerRewards(checkpointHeaders[i + 1].coinbase);
    }
    vm.revertToState(snapshot);
    rollup.submitEpochRootProof(_compactSubmission(fullArgs, 8));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
    assertEq(rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(GAS_REPORT_EPOCH)), rewards);
    for (uint256 i = 0; i < 16; i++) {
      assertEq(rollup.getSequencerRewards(checkpointHeaders[i + 1].coinbase), sequencerRewards[i]);
    }
  }

  function testCompactPrefixRejectsUnprovenCheckpoints() public {
    SubmitEpochRootProofArgs memory args = _compactSubmission(_getGasReportSubmission(8), 1);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidProvenCheckpointCount.selector, 0, 1));
    rollup.submitEpochRootProof(args);
  }

  function testCompactPrefixCannotExtendPastProvenTip() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    SubmitEpochRootProofArgs memory args = _compactSubmission(_getGasReportSubmission(16), 9);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidProvenCheckpointCount.selector, 8, 9));
    rollup.submitEpochRootProof(args);
  }

  function testCompactPrefixCannotOmitUnaccountedCheckpoints() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    bytes32 epochRewardsSlot = keccak256(abi.encode(GAS_REPORT_EPOCH, uint256(keccak256("aztec.reward.storage")) + 1));
    uint256 rewards = uint256(vm.load(address(rollup), epochRewardsSlot));
    vm.store(address(rollup), epochRewardsSlot, bytes32((rewards & ~uint256(type(uint128).max)) | 4));
    SubmitEpochRootProofArgs memory args = _compactSubmission(_getGasReportSubmission(16), 8);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidProvenCheckpointCount.selector, 4, 8));
    rollup.submitEpochRootProof(args);
  }

  function testFuzzCompactPrefix(uint256 _proven, uint256 _prefix, uint256 _end) public {
    uint256 proven = bound(_proven, 1, 31);
    uint256 prefix = bound(_prefix, 0, proven);
    uint256 end = bound(_end, proven + 1, 32);
    rollup.submitEpochRootProof(_getGasReportSubmission(proven));
    SubmitEpochRootProofArgs memory args = _getGasReportSubmission(end);
    _bindPublicInputs(args);
    rollup.submitEpochRootProof(_compactSubmission(args, prefix));
    assertEq(rollup.getProvenCheckpointNumber(), end);
  }

  function testCompactPrefixRejectsMissingHeader() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    SubmitEpochRootProofArgs memory args = _compactSubmission(_getGasReportSubmission(15), 8);
    args.end = 16;
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidCheckpointHeaderCount.selector, 16, 15));
    rollup.submitEpochRootProof(args);
  }

  function testCompactPrefixRejectsChangedNewHeader() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    SubmitEpochRootProofArgs memory args = _compactSubmission(_getGasReportSubmission(16), 8);
    bytes32 expected = ProposedHeaderLib.hash(args.headers[0]);
    args.headers[0].accumulatedFees++;
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidCheckpointHeader.selector, expected, ProposedHeaderLib.hash(args.headers[0])
      )
    );
    rollup.submitEpochRootProof(args);
  }

  function testCompactPrefixBindsFeesToProof() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    SubmitEpochRootProofArgs memory args = _getGasReportSubmission(16);
    _bindPublicInputs(args);
    args = _compactSubmission(args, 8);
    args.provenCheckpointFees[0].accumulatedFees++;
    vm.expectRevert(Errors.Rollup__InvalidProof.selector);
    rollup.submitEpochRootProof(args);
  }

  function testCompactPrefixBindsCoinbaseToProof() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    SubmitEpochRootProofArgs memory args = _getGasReportSubmission(16);
    _bindPublicInputs(args);
    args = _compactSubmission(args, 8);
    args.provenCheckpointFees[0].coinbase = address(0xdead);
    vm.expectRevert(Errors.Rollup__InvalidProof.selector);
    rollup.submitEpochRootProof(args);
  }

  function testCompactPrefixAllowsProvenTipToAdvanceBeforeInclusion() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    SubmitEpochRootProofArgs memory args = _compactSubmission(_getGasReportSubmission(16), 8);
    rollup.submitEpochRootProof(_getGasReportSubmission(12));
    rollup.submitEpochRootProof(args);
    assertEq(rollup.getProvenCheckpointNumber(), 16);
  }

  function testCompactRepeatedAndShorterProofs() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(16));
    SubmitEpochRootProofArgs memory repeated = _compactSubmission(_getGasReportSubmission(16), 16);
    repeated.args.proverId = address(0xbeef);
    rollup.submitEpochRootProof(repeated);
    rollup.submitEpochRootProof(_compactSubmission(_getGasReportSubmission(8), 8));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
  }

  function testCompactCalldataSavings() public {
    uint256[5] memory prefixes = [uint256(0), 1, 8, 16, 31];
    uint256[5] memory lengths = [uint256(1), 2, 16, 32, 32];
    for (uint256 i = 0; i < prefixes.length; i++) {
      SubmitEpochRootProofArgs memory args = _getGasReportSubmission(lengths[i]);
      bytes memory legacy = abi.encode(
        LegacySubmission(args.start, args.end, args.args, args.headers, args.attestations, args.blobInputs, args.proof)
      );
      bytes memory compact = abi.encode(_compactSubmission(args, prefixes[i]));
      assertEq(int256(legacy.length) - int256(compact.length), int256(352 * prefixes[i]) - 64);
      emit log_named_uint("Compact checkpoints", prefixes[i]);
      emit log_named_uint("Checkpoints in proof", lengths[i]);
      emit log_named_int("Calldata bytes saved", int256(legacy.length) - int256(compact.length));
      emit log_named_int("Calldata gas saved (4/16)", int256(_calldataGas(legacy)) - int256(_calldataGas(compact)));
    }
  }

  function _calldataGas(bytes memory _data) private pure returns (uint256 result) {
    for (uint256 i = 0; i < _data.length; i++) {
      result += _data[i] == 0 ? 4 : 16;
    }
  }
}
