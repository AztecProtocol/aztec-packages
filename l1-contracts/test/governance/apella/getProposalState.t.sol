// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

contract GetProposalStateTest {
    function test_WhenProposalIsOutOfBounds() external {
        // it revert
    }

    modifier whenValidProposalId() {
        _;
    }

    function test_GivenStateIsExecuted() external whenValidProposalId {
        // it return Executed
    }

    function test_GivenStateIsDropped() external whenValidProposalId {
        // it return Dropped
    }

    function test_GivenStateIsExpired() external whenValidProposalId {
        // it return Expired
    }

    function test_GivenStateIsRejected() external whenValidProposalId {
        // it return Rejected
    }

    modifier givenStateIsUnstable() {
        _;
    }

    modifier givenGerousiaHaveChanged() {
        _;
    }

    function test_GivenGerousiaHaveChanged()
        external
        whenValidProposalId
        givenStateIsUnstable
        givenGerousiaHaveChanged
    {
        // it return Dropped
    }

    modifier givenGerousiaIsUnchanged() {
        _;
    }

    function test_WhenVotingDelayHaveNotPassed()
        external
        whenValidProposalId
        givenStateIsUnstable
        givenGerousiaHaveChanged
        givenGerousiaIsUnchanged
    {
        // it return Pending
    }

    modifier whenVotingDelayHavePassed() {
        _;
    }

    function test_WhenVotingDurationHaveNotPassed()
        external
        whenValidProposalId
        givenStateIsUnstable
        givenGerousiaHaveChanged
        givenGerousiaIsUnchanged
        whenVotingDelayHavePassed
    {
        // it return Active
    }

    modifier whenVotingDurationHavePassed() {
        _;
    }

    function test_GivenLackOfQourumOrLackOfDifferential()
        external
        whenValidProposalId
        givenStateIsUnstable
        givenGerousiaHaveChanged
        givenGerousiaIsUnchanged
        whenVotingDelayHavePassed
        whenVotingDurationHavePassed
    {
        // it return Rejected
    }

    modifier givenQuorumAndDifferential() {
        _;
    }

    function test_GivenExecutionDelayHaveNotPassed()
        external
        whenValidProposalId
        givenStateIsUnstable
        givenGerousiaHaveChanged
        givenGerousiaIsUnchanged
        whenVotingDelayHavePassed
        whenVotingDurationHavePassed
        givenQuorumAndDifferential
    {
        // it return Queued
    }

    modifier givenExecutionDelayHavePassed() {
        _;
    }

    function test_GivenGracePeriodHaveNotPassed()
        external
        whenValidProposalId
        givenStateIsUnstable
        givenGerousiaHaveChanged
        givenGerousiaIsUnchanged
        whenVotingDelayHavePassed
        whenVotingDurationHavePassed
        givenQuorumAndDifferential
        givenExecutionDelayHavePassed
    {
        // it return Executable
    }

    function test_GivenGracePeriodHavePassed()
        external
        whenValidProposalId
        givenStateIsUnstable
        givenGerousiaHaveChanged
        givenGerousiaIsUnchanged
        whenVotingDelayHavePassed
        whenVotingDurationHavePassed
        givenQuorumAndDifferential
        givenExecutionDelayHavePassed
    {
        // it return Expired
    }
}
