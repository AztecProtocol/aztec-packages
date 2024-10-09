// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";

contract IsStableStateTest is Test {
  using ProposalLib for DataStructures.Proposal;

  DataStructures.Proposal internal proposal;

  function test_GivenStateIsExecuted() external {
    // it return true
    proposal.state = DataStructures.ProposalState.Executed;
    assertTrue(proposal.isStable());
  }

  function test_GivenStateIsDropped() external {
    // it return true
    proposal.state = DataStructures.ProposalState.Dropped;
    assertTrue(proposal.isStable());
  }

  function test_GivenStateNotInAbove(uint8 _state) external {
    // it return false
    DataStructures.ProposalState s = DataStructures.ProposalState(bound(_state, 0, 7));

    vm.assume(
      !(s == DataStructures.ProposalState.Executed || s == DataStructures.ProposalState.Dropped)
    );

    proposal.state = s;

    assertFalse(proposal.isStable());
  }
}
