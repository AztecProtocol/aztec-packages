// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

contract ExecuteTest {
    function test_GivenStateIsNotExecutable() external {
        // it revert
    }

    modifier givenStateIsExecutable() {
        _;
    }

    function test_GivenPayloadCallAsset() external givenStateIsExecutable {
        // it revert
    }

    modifier givenPayloadDontCallAsset() {
        _;
    }

    function test_GivenAPayloadCallFails() external givenStateIsExecutable givenPayloadDontCallAsset {
        // it revert
    }

    function test_GivenAllPayloadCallSucceeds() external givenStateIsExecutable givenPayloadDontCallAsset {
        // it updates state to Executed
        // it executes the calls
        // it emits {ProposalExecuted} event
        // it return true
    }
}
