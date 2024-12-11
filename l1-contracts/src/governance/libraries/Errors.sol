// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
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
  error Governance__CallerNotGovernanceProposer(address caller, address governanceProposer);
  error Governance__CallerNotSelf(address caller, address self);
  error Governance__NoCheckpointsFound();
  error Governance__InsufficientPower(address voter, uint256 have, uint256 required);
  error Governance__InvalidConfiguration();
  error Governance__WithdrawalAlreadyclaimed();
  error Governance__WithdrawalNotUnlockedYet(Timestamp currentTime, Timestamp unlocksAt);
  error Governance__ProposalNotActive();
  error Governance__ProposalNotExecutable();
  error Governance__CannotCallAsset();
  error Governance__CallFailed(address target);
  error Governance__ProposalDoesNotExists(uint256 proposalId);
  error Governance__ProposalAlreadyDropped();
  error Governance__ProposalCannotBeDropped();

  error Governance__UserLib__NotInPast();

  error Governance__ConfigurationLib__InvalidMinimumVotes();
  error Governance__ConfigurationLib__LockAmountTooSmall();
  error Governance__ConfigurationLib__QuorumTooSmall();
  error Governance__ConfigurationLib__QuorumTooBig();
  error Governance__ConfigurationLib__DifferentialTooSmall();
  error Governance__ConfigurationLib__DifferentialTooBig();
  error Governance__ConfigurationLib__TimeTooSmall(string name);
  error Governance__ConfigurationLib__TimeTooBig(string name);

  error Governance__ProposalLib__ZeroMinimum();
  error Governance__ProposalLib__ZeroVotesNeeded();
  error Governance__ProposalLib__MoreVoteThanExistNeeded();
  error Governance__ProposalLib__ZeroYeaVotesNeeded();
  error Governance__ProposalLib__MoreYeaVoteThanExistNeeded();

  error GovernanceProposer__CanOnlyPushProposalInPast(); // 0x49fdf611"
  error GovernanceProposer__FailedToPropose(IPayload proposal); // 0x6ca2a2ed
  error GovernanceProposer__InstanceHaveNoCode(address instance); // 0x20a3b441
  error GovernanceProposer__InsufficientVotes(); // 0xba1e05ef
  error GovernanceProposer__InvalidNAndMValues(uint256 n, uint256 m); // 0x520d9704
  error GovernanceProposer__NCannotBeLargerTHanM(uint256 n, uint256 m); // 0x2fdfc063
  error GovernanceProposer__OnlyProposerCanVote(address caller, address proposer); // 0xba27df38
  error GovernanceProposer__ProposalAlreadyExecuted(uint256 roundNumber); // 0x7aeacb17
  error GovernanceProposer__ProposalCannotBeAddressZero(); // 0xdb3e4b6e
  error GovernanceProposer__ProposalHaveNoCode(IPayload proposal); // 0xdce0615b
  error GovernanceProposer__ProposalTooOld(uint256 roundNumber, uint256 currentRoundNumber); //0x02283b1a
  error GovernanceProposer__VoteAlreadyCastForSlot(Slot slot); //0xc2201452

  error CoinIssuer__InssuficientMintAvailable(uint256 available, uint256 needed); // 0xf268b931

  error Registry__RollupAlreadyRegistered(address rollup); // 0x3c34eabf
  error Registry__RollupNotRegistered(address rollup); // 0xa1fee4cf

  error RewardDistributor__InvalidCaller(address caller, address canonical); // 0xb95e39f6
}
