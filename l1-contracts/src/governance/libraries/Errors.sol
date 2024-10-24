// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

import {Slot, Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

/**
 * @title Errors Library
 * @author Aztec Labs
 * @notice Library that contains errors used throughout the Aztec governance
 * Errors are prefixed with the contract name to make it easy to identify where the error originated
 * when there are multiple contracts that could have thrown the error.
 */
library Errors {
  error Apella__CallerNotGerousia(address caller, address gerousia);
  error Apella__CallerNotSelf(address caller, address self);
  error Apella__NoCheckpointsFound();
  error Apella__InsufficientPower(address voter, uint256 have, uint256 required);
  error Apella__InvalidConfiguration();
  error Apella__WithdrawalAlreadyclaimed();
  error Apella__WithdrawalNotUnlockedYet(Timestamp currentTime, Timestamp unlocksAt);
  error Apella__ProposalNotActive();
  error Apella__ProposalNotExecutable();
  error Apella__CannotCallAsset();
  error Apella__CallFailed(address target);
  error Apella__ProposalDoesNotExists(uint256 proposalId);
  error Apella__ProposalAlreadyDropped();
  error Apella__ProposalCannotBeDropped();

  error Apella__UserLib__NotInPast();

  error Apella__ConfigurationLib__InvalidMinimumVotes();
  error Apella__ConfigurationLib__QuorumTooSmall();
  error Apella__ConfigurationLib__QuorumTooBig();
  error Apella__ConfigurationLib__DifferentialTooSmall();
  error Apella__ConfigurationLib__DifferentialTooBig();
  error Apella__ConfigurationLib__TimeTooSmall(string name);
  error Apella__ConfigurationLib__TimeTooBig(string name);

  error Apella__ProposalLib__ZeroMinimum();
  error Apella__ProposalLib__ZeroVotesNeeded();
  error Apella__ProposalLib__MoreVoteThanExistNeeded();
  error Apella__ProposalLib__ZeroYeaVotesNeeded();
  error Apella__ProposalLib__MoreYeaVoteThanExistNeeded();

  error Gerousia__CanOnlyPushProposalInPast(); // 0x49fdf611"
  error Gerousia__FailedToPropose(IPayload proposal); // 0x6ca2a2ed
  error Gerousia__InstanceHaveNoCode(address instance); // 0x20a3b441
  error Gerousia__InsufficientVotes(); // 0xba1e05ef
  error Gerousia__InvalidNAndMValues(uint256 n, uint256 m); // 0x520d9704
  error Gerousia__NCannotBeLargerTHanM(uint256 n, uint256 m); // 0x2fdfc063
  error Gerousia__OnlyProposerCanVote(address caller, address proposer); // 0xba27df38
  error Gerousia__ProposalAlreadyExecuted(uint256 roundNumber); // 0x7aeacb17
  error Gerousia__ProposalCannotBeAddressZero(); // 0xdb3e4b6e
  error Gerousia__ProposalHaveNoCode(IPayload proposal); // 0xdce0615b
  error Gerousia__ProposalTooOld(uint256 roundNumber, uint256 currentRoundNumber); //0x02283b1a
  error Gerousia__VoteAlreadyCastForSlot(Slot slot); //0xc2201452

  error Nomismatokopio__InssuficientMintAvailable(uint256 available, uint256 needed); // 0xf268b931

  error Registry__RollupAlreadyRegistered(address rollup); // 0x3c34eabf
  error Registry__RollupNotRegistered(address rollup); // 0xa1fee4cf

  error Sysstia__InvalidCaller(address caller, address canonical); // 0xb95e39f6
}
