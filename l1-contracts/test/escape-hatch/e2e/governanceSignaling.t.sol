// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../integration/EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors as GovErrors} from "@aztec/governance/libraries/Errors.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IEmpire} from "@aztec/governance/interfaces/IEmpire.sol";
import {Governance} from "@aztec/governance/Governance.sol";

/**
 * @title EscapeHatchGovernanceSignalingTest
 * @notice E2E test: Governance signaling rights remain with committee during escape hatch
 *
 *    ├── given escape hatch is open and candidate is proposing blocks
 *    │   ├── when escape hatch candidate tries to signal in governance
 *    │   │   └── it should revert with EmpireBase__OnlyProposerCanSignal
 *    │   └── when committee proposer signals in governance
 *    │       ├── it should succeed
 *    │       └── it should increment the signal count
 *
 * @dev Security property: During escape hatch, block proposal and governance signaling
 *      are separate rights. Escape hatch candidates can propose blocks but cannot
 *      influence governance - that remains with the validator committee.
 */
contract EscapeHatchGovernanceSignalingTest is EscapeHatchIntegrationBase {
  function test_governanceSignaling() public setup(4, 4) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Get governance components - rollup owner is the Governance contract
    Governance governance = Governance(rollup.owner());
    GovernanceProposer governanceProposer = GovernanceProposer(governance.governanceProposer());
    IPayload dummyPayload = IPayload(address(this));

    _joinCandidateSet(CANDIDATE1);

    // Verify CANDIDATE1 is not in the validator committee
    address[] memory committee = rollup.getEpochCommittee(rollup.getCurrentEpoch());
    for (uint256 i = 0; i < committee.length; i++) {
      assertTrue(committee[i] != CANDIDATE1, "CANDIDATE1 should not be in validator committee");
    }

    // Step 2: Selection
    targetHatch = _selectCandidateForHatch();
    assertEq(escapeHatch.getDesignatedProposer(targetHatch), CANDIDATE1, "CANDIDATE1 should be proposer");

    // Step 3: Warp to escape hatch and verify it's open
    _warpToHatch(targetHatch);
    Epoch currentEpoch = rollup.getCurrentEpoch();
    (bool isOpen, address escapeHatchProposer) = escapeHatch.isHatchOpen(currentEpoch);
    assertTrue(isOpen, "Escape hatch should be open");
    assertEq(escapeHatchProposer, CANDIDATE1, "CANDIDATE1 should be escape hatch proposer");

    // Get committee proposer (from validator selection, NOT escape hatch)
    rollup.setupEpoch();
    address committeeProposer = rollup.getCurrentProposer();
    assertTrue(committeeProposer != escapeHatchProposer, "Committee proposer should differ from escape hatch proposer");

    // Step 4: Escape hatch candidate proposes a block - SUCCESS
    _proposeWithHatch(CANDIDATE1);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Escape hatch candidate should be able to propose");

    // Step 5: Escape hatch candidate tries to signal in governance - FAIL
    vm.prank(CANDIDATE1);
    vm.expectRevert(
      abi.encodeWithSelector(GovErrors.EmpireBase__OnlyProposerCanSignal.selector, CANDIDATE1, committeeProposer)
    );
    governanceProposer.signal(dummyPayload);

    // Step 6: Committee proposer signals in governance - SUCCESS
    uint256 currentRound = governanceProposer.getCurrentRound();
    uint256 signalCountBefore = governanceProposer.signalCount(address(rollup), currentRound, dummyPayload);

    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.SignalCast(dummyPayload, currentRound, committeeProposer);
    vm.prank(committeeProposer);
    assertTrue(governanceProposer.signal(dummyPayload), "Committee proposer signal should succeed");

    uint256 signalCountAfter = governanceProposer.signalCount(address(rollup), currentRound, dummyPayload);
    assertEq(signalCountAfter, signalCountBefore + 1, "Signal count should increment");
  }
}
