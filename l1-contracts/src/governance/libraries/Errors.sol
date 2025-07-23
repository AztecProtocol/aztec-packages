// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Slot, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @title Errors Library
 * @author Aztec Labs
 * @notice Library that contains errors used throughout the Aztec governance
 * Errors are prefixed with the contract name to make it easy to identify where the error originated
 * when there are multiple contracts that could have thrown the error.
 */
library Errors {
  error Governance__CallerNotGovernanceProposer(address caller, address governanceProposer);
  error Governance__GovernanceProposerCannotBeSelf();
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
  error Governance__DepositNotAllowed();

  error Governance__UserLib__NotInPast();

  error Governance__ConfigurationLib__InvalidMinimumVotes();
  error Governance__ConfigurationLib__LockAmountTooSmall();
  error Governance__ConfigurationLib__QuorumTooSmall();
  error Governance__ConfigurationLib__QuorumTooBig();
  error Governance__ConfigurationLib__RequiredYeaMarginTooBig();
  error Governance__ConfigurationLib__TimeTooSmall(string name);
  error Governance__ConfigurationLib__TimeTooBig(string name);

  error Governance__ProposalLib__ZeroMinimum();
  error Governance__ProposalLib__ZeroVotesNeeded();
  error Governance__ProposalLib__MoreVoteThanExistNeeded();
  error Governance__ProposalLib__ZeroYeaVotesNeeded();
  error Governance__ProposalLib__MoreYeaVoteThanExistNeeded();

  error GovernanceProposer__CanOnlySubmitRoundWinnerInPast();
  error GovernanceProposer__FailedToSubmitRoundWinner(IPayload payload);
  error GovernanceProposer__InstanceHaveNoCode(address instance);
  error GovernanceProposer__InsufficientSignals(uint256 signalsCast, uint256 signalsNeeded);
  error GovernanceProposer__InvalidQuorumAndRoundSize(uint256 quorumSize, uint256 roundSize);
  error GovernanceProposer__QuorumCannotBeLargerThanRoundSize(uint256 quorumSize, uint256 roundSize);
  error GovernanceProposer__OnlyProposerCanSignal(address caller, address proposer);
  error GovernanceProposer__PayloadAlreadySubmitted(uint256 roundNumber);
  error GovernanceProposer__PayloadCannotBeAddressZero();
  error GovernanceProposer__PayloadHaveNoCode(IPayload payload);
  error GovernanceProposer__RoundTooOld(uint256 roundNumber, uint256 currentRoundNumber);
  error GovernanceProposer__SignalAlreadyCastForSlot(Slot slot);
  error GovernanceProposer__GSEPayloadInvalid();

  error CoinIssuer__InsufficientMintAvailable(uint256 available, uint256 needed); // 0xa1cc8799

  error Registry__RollupAlreadyRegistered(address rollup); // 0x3c34eabf
  error Registry__RollupNotRegistered(uint256 version);
  error Registry__NoRollupsRegistered();

  error RewardDistributor__InvalidCaller(address caller, address canonical); // 0xb95e39f6

  error GSE__NotRollup(address);
  error GSE__GovernanceAlreadySet();
  error GSE__InvalidRollupAddress(address);
  error GSE__RollupAlreadyRegistered(address);
  error GSE__NotLatestRollup(address);
  error GSE__AlreadyRegistered(address, address);
  error GSE__NothingToExit(address);
  error GSE__InsufficientStake(uint256, uint256);
  error GSE__FailedToRemove(address);
  error GSE__InstanceDoesNotExist(address);
  error GSE__NotWithdrawer(address, address);
  error GSE__OutOfBounds(uint256, uint256);
  error GSE__FatalError(string);

  error Delegation__InsufficientPower(address, uint256, uint256);
}
