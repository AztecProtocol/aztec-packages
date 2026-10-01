// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {EscapeHatchIntegrationBase} from "./EscapeHatchIntegrationBase.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {CommitteeAttestation} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {SubmitEpochRootProofArgs, PublicInputArgs, ProvenCheckpointFees} from "@aztec/core/interfaces/IRollup.sol";
import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {RewardConfig, BpsLib} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";
import {TableCalculator} from "@test/mock/SequencerRewardCalculatorMocks.sol";

/**
 * @notice Escape-hatch epochs have no committee, so their proofs skip the sequencer reward calculator and pay the
 *         default; committee epochs of the same rollup consult it.
 */
contract SequencerRewardCalculatorEscapeHatchTest is EscapeHatchIntegrationBase {
  uint256 internal constant PREMIUM = 1234e18;

  TableCalculator internal calculator;

  function test_WhenEscapeHatchIsOpen_PaysTheDefaultWithoutCallingTheCalculator()
    external
    setup(4, 4)
    progressEpochsToInclusion
  {
    _deployEscapeHatch();
    _setCalculator();
    calculator.setReward(CANDIDATE1, PREMIUM);

    full = load("empty_checkpoint_1");
    _joinCandidateSet(CANDIDATE1);
    targetHatch = _selectCandidateForHatch();
    _warpToHatch(targetHatch);
    (bool isOpen,) = escapeHatch.isHatchOpen(rollup.getCurrentEpoch());
    assertTrue(isOpen, "escape hatch should be open");

    _proposeWithHatch(CANDIDATE1);

    vm.expectCall(address(calculator), "", 0);
    _proveCheckpoints("empty_checkpoint_", 1, 1, address(this));

    assertEq(rollup.getProvenCheckpointNumber(), 1);
    assertEq(rollup.getSequencerRewards(CANDIDATE1), _defaultReward(), "default not paid");
  }

  function test_WhenEscapeHatchIsNotOpen_PaysWhatTheCalculatorReturns() external setup(4, 4) progressEpochsToInclusion {
    _deployEscapeHatch();
    _setCalculator();

    full = load("mixed_checkpoint_1");
    (, CommitteeAttestation[] memory attestations) = _proposeWithCommittee();
    address proposer = rollup.getCurrentProposer();
    calculator.setReward(proposer, PREMIUM);

    address coinbase = proposedHeaders[1].coinbase;

    // The same proof without a calculator pays the default plus the checkpoint's sequencer fee.
    uint256 snapshot = vm.snapshotState();
    vm.prank(rollup.owner());
    rollup.setSequencerRewardCalculator(address(0));
    _submitProofWithAttestations(attestations);
    uint256 withoutCalculator = rollup.getSequencerRewards(coinbase);
    vm.revertToState(snapshot);

    address[] memory proposers = new address[](1);
    proposers[0] = proposer;
    RewardConfig memory config = rollup.getRewardConfig();
    vm.expectCall(
      address(calculator),
      abi.encodeCall(
        ISequencerRewardCalculator.getSequencerRewards,
        (rollup.getCurrentEpoch(), proposers, _defaultReward(), config.checkpointReward)
      ),
      1
    );
    _submitProofWithAttestations(attestations);

    assertEq(rollup.getProvenCheckpointNumber(), 1);
    assertEq(rollup.getSequencerRewards(coinbase), withoutCalculator - _defaultReward() + PREMIUM, "premium not paid");
  }

  function _setCalculator() internal {
    calculator = new TableCalculator();
    vm.prank(rollup.owner());
    rollup.setSequencerRewardCalculator(address(calculator));
  }

  function _defaultReward() internal view returns (uint256) {
    RewardConfig memory config = rollup.getRewardConfig();
    return BpsLib.mul(config.checkpointReward, config.sequencerBps);
  }

  function _submitProofWithAttestations(CommitteeAttestation[] memory _attestations) internal {
    PublicInputArgs memory args = PublicInputArgs({
      previousArchive: rollup.archiveAt(0),
      endArchive: rollup.archiveAt(1),
      outHash: rollup.getCheckpoint(1).outHash,
      previousInboxRollingHash: 0,
      endInboxRollingHash: 0,
      proverId: address(this)
    });

    ProposedHeader[] memory headers = new ProposedHeader[](1);
    headers[0] = proposedHeaders[1];

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: 1,
        end: 1,
        args: args,
        provenCheckpointFees: new ProvenCheckpointFees[](0),
        headers: headers,
        attestations: AttestationLibHelper.packAttestations(_attestations),
        blobInputs: full.checkpoint.batchedBlobInputs,
        proof: ""
      })
    );
  }
}
