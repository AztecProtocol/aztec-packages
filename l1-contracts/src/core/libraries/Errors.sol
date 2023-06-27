// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

/**
 * @title Errors Library
 * @author Aztec Labs
 * @notice Library that contains errors used throughout the Aztec protocol
 * Errors are prefixed with the contract name to make it easy to identify where the error originated
 * when there are multiple contracts that could have thrown the error.
 */
library Errors {
  // Inbox
  error Inbox__DeadlineBeforeNow(); // 0xbf94a5dc
  error Inbox__NotPastDeadline(); //0x3218ad9e
  error Inbox__PastDeadline(); // 0x1eb114ea
  error Inbox__FeeTooHigh(); // 0x6f478f42
  error Inbox__FailedToWithdrawFees(); // 0xbc66d464
  error Inbox__Unauthorized(); // 0xe5336a6b
  error Inbox__NothingToConsume(bytes32 entryKey); // 0xdd7e995e
  error Inbox__IncompatibleEntryArguments(
    bytes32 entryKey,
    uint64 storedFee,
    uint64 feePassed,
    uint32 storedDeadline,
    uint32 deadlinePassed
  ); // 0xd483d8f2

  // Outbox
  error Outbox__Unauthorized(); // 0x2c9490c2
  error Outbox__InvalidChainId(); // 0x577ec7c4
  error Outbox__NothingToConsume(bytes32 entryKey); // 0xfb4fb506
  error Outbox__IncompatibleEntryArguments(
    bytes32 entryKey,
    uint64 storedFee,
    uint64 feePassed,
    uint32 storedDeadline,
    uint32 deadlinePassed
  ); // 0xad1b401b

  // Rollup
  error Rollup__InvalidStateHash(bytes32 expected, bytes32 actual); // 0xa3cfaab3
  error Rollup__InvalidProof(); // 0xa5b2ba17
  error Rollup__InvalidChainId(uint256 expected, uint256 actual); // 0x37b5bc12
  error Rollup__InvalidVersion(uint256 expected, uint256 actual); // 0x9ef30794
}
