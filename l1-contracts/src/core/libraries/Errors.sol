// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

library Errors {
  // MessageBox
  error NothingToConsume(bytes32 entryKey);
  error IncompatibleEntryArguments(
    bytes32 entryKey,
    uint64 storedFee,
    uint64 feePassed,
    uint32 storedDeadline,
    uint32 deadlinePassed
  );

  // Inbox
  error DeadlineBeforeNow();
  error NotPastDeadline();
  error PastDeadline();
  error FeeTooHigh();
  error FailedToWithdrawFees();

  // Generic errors

  // Access control
  error Unauthorized();
  error InvalidChainId();

  // Rollup
  error InvalidStateHash(bytes32 expected, bytes32 actual);
  error InvalidProof();
}
