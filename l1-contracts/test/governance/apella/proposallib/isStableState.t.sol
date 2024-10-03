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

  function test_GivenStateIsExpired() external {
    // it return true
    proposal.state = DataStructures.ProposalState.Expired;
    assertTrue(proposal.isStable());
  }

  function test_GivenStateIsRejected() external {
    // it return true
    proposal.state = DataStructures.ProposalState.Rejected;
    assertTrue(proposal.isStable());
  }

  function test_GivenStateNotInAbove(uint8 _state) external {
    // it return false
    proposal.state = DataStructures.ProposalState(bound(_state, 0, 7));

    // I know, might not be the best way, but really easy to read
    vm.assume(
      !(
        proposal.state == DataStructures.ProposalState.Executed
          || proposal.state == DataStructures.ProposalState.Dropped
          || proposal.state == DataStructures.ProposalState.Expired
          || proposal.state == DataStructures.ProposalState.Rejected
      )
    );

    assertFalse(proposal.isStable());
  }
}
