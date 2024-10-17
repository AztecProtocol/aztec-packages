// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

import {Slot} from "@aztec/core/libraries/TimeMath.sol";

/**
 * @title Errors Library
 * @author Aztec Labs
 * @notice Library that contains errors used throughout the Aztec governance
 * Errors are prefixed with the contract name to make it easy to identify where the error originated
 * when there are multiple contracts that could have thrown the error.
 */
library Errors {
  error Gerousia__CanOnlyPushProposalInPast(); // 0x49fdf611"
  error Gerousia__FailedToPropose(address proposal); // 0x6ca2a2ed
  error Gerousia__InstanceHaveNoCode(address instance); // 0x20a3b441
  error Gerousia__InsufficientVotes(); // 0xba1e05ef
  error Gerousia__InvalidNAndMValues(uint256 N, uint256 M); // 0x520d9704
  error Gerousia__NCannotBeLargerTHanM(uint256 N, uint256 M); // 0x2fdfc063
  error Gerousia__OnlyProposerCanVote(address caller, address proposer); // 0xba27df38
  error Gerousia__ProposalAlreadyExecuted(uint256 roundNumber); // 0x7aeacb17
  error Gerousia__ProposalCannotBeAddressZero(); // 0xdb3e4b6e
  error Gerousia__ProposalHaveNoCode(address proposal); // 0xdce0615b
  error Gerousia__ProposalTooOld(uint256 roundNumber); //0x02283b1a
  error Gerousia__VoteAlreadyCastForSlot(Slot slot); //0xc2201452

  error Nomismatokopio__InssuficientMintAvailable(uint256 available, uint256 needed); // 0xf268b931

  error Registry__RollupAlreadyRegistered(address rollup); // 0x3c34eabf
  error Registry__RollupNotRegistered(address rollup); // 0xa1fee4cf

  error Sysstia__InvalidCaller(address caller, address canonical); // 0xb95e39f6
}
