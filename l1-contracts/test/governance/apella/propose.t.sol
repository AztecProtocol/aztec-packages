// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

contract ProposeTest {
    function test_WhenCallerIsNotGerousia() external {
        // it revert
    }

    function test_WhenCallerIsGerousia() external {
        // it creates a new proposal with current config
        // it emits a {ProposalCreated} event
        // it returns true
    }
}
