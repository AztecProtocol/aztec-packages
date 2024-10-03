// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

contract VoteTest {
    function test_GivenStateIsNotActive() external {
        // it revert
    }

    modifier givenStatIsActive() {
        _;
    }

    function test_GivenAmountLargerThanAvailablePower() external givenStatIsActive {
        // it revert
    }

    modifier givenAmountSmallerOrEqAvailablePower() {
        _;
    }

    function test_WhenSupportIsYea() external givenStatIsActive givenAmountSmallerOrEqAvailablePower {
        // it increase yea on user ballot by amount
        // it increase yea on total by amount
        // it emitts {VoteCast} event
        // it returns true
    }

    function test_WhenSupportIsNea() external givenStatIsActive givenAmountSmallerOrEqAvailablePower {
        // it increase nea on user ballot by amount
        // it increase nea on total by amount
        // it emitts {VoteCast} event
        // it returns true
    }
}
