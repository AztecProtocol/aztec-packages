// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";

contract IsStableStateTest is Test {
  using ProposalLib for Proposal;

  Proposal internal proposal;

  function test_GivenStateIsExecuted() external {
    // it return true
    proposal.state = ProposalState.Executed;
    assertTrue(proposal.isStable());
  }

  function test_GivenStateIsDropped() external {
    // it return true
    proposal.state = ProposalState.Dropped;
    assertTrue(proposal.isStable());
  }

  function test_GivenStateNotInAbove(uint8 _state) external {
    // it return false
    ProposalState s = ProposalState(bound(_state, 0, 7));

    vm.assume(!(s == ProposalState.Executed || s == ProposalState.Dropped));

    proposal.state = s;

    assertFalse(proposal.isStable());
  }
}
