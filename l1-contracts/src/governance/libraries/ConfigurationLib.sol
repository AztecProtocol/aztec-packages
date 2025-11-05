// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Configuration} from "@aztec/governance/interfaces/IGovernance.sol";
import {CompressedConfiguration} from "@aztec/governance/libraries/compressed-data/Configuration.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {CompressedTimeMath, CompressedTimestamp} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

library ConfigurationLib {
  using CompressedTimeMath for CompressedTimestamp;

  uint256 internal constant QUORUM_LOWER = 1;
  uint256 internal constant QUORUM_UPPER = 1e18;

  uint256 internal constant REQUIRED_YEA_MARGIN_UPPER = 1e18;

  uint256 internal constant VOTES_LOWER = 1;
  uint256 internal constant VOTES_UPPER = type(uint96).max; // Maximum for compressed storage (uint96)

  uint256 internal constant LOCK_AMOUNT_LOWER = 2;
  uint256 internal constant LOCK_AMOUNT_UPPER = type(uint96).max; // Maximum for compressed storage (uint96)

  Timestamp internal constant TIME_LOWER = Timestamp.wrap(60);
  Timestamp internal constant TIME_UPPER = Timestamp.wrap(90 * 24 * 3600);

  /**
   * @notice The delay after which a withdrawal can be finalized.
   * @dev This applies to the "normal" withdrawal, not one induced by proposeWithLock.
   * @dev Making the delay equal to the voting duration + execution delay + a "small buffer"
   * ensures that if you were able to vote on a proposal, someone may execute it before you can exit.
   *
   * The "small buffer" is somewhat arbitrarily set to the votingDelay / 5.
   */
  function getWithdrawalDelay(CompressedConfiguration storage _self) internal view returns (Timestamp) {
    Timestamp votingDelay = _self.votingDelay.decompress();
    Timestamp votingDuration = _self.votingDuration.decompress();
    Timestamp executionDelay = _self.executionDelay.decompress();

    return Timestamp.wrap(Timestamp.unwrap(votingDelay) / 5) + votingDuration + executionDelay;
  }

  /**
   * @notice
   * @dev     We specify `memory` here since it is called on outside import for validation
   *          before writing it to state.
   */
  function assertValid(Configuration memory _self) internal pure {
    require(_self.quorum >= QUORUM_LOWER, Errors.Governance__ConfigurationLib__QuorumTooSmall());
    require(_self.quorum <= QUORUM_UPPER, Errors.Governance__ConfigurationLib__QuorumTooBig());

    require(
      _self.requiredYeaMargin <= REQUIRED_YEA_MARGIN_UPPER,
      Errors.Governance__ConfigurationLib__RequiredYeaMarginTooBig()
    );

    require(_self.minimumVotes >= VOTES_LOWER, Errors.Governance__ConfigurationLib__InvalidMinimumVotes());
    require(_self.minimumVotes <= VOTES_UPPER, Errors.Governance__ConfigurationLib__InvalidMinimumVotes());

    require(
      _self.proposeConfig.lockAmount >= LOCK_AMOUNT_LOWER, Errors.Governance__ConfigurationLib__LockAmountTooSmall()
    );
    require(
      _self.proposeConfig.lockAmount <= LOCK_AMOUNT_UPPER, Errors.Governance__ConfigurationLib__LockAmountTooBig()
    );

    // Beyond checking the bounds like this, it might be useful to ensure that the value is larger than the withdrawal
    // delay. this, can be useful if one want to ensure that the "locker" cannot himself vote in the proposal, but as
    // it is unclear if this is a useful property, it is not enforced.
    require(_self.proposeConfig.lockDelay >= TIME_LOWER, Errors.Governance__ConfigurationLib__TimeTooSmall("LockDelay"));
    require(
      _self.proposeConfig.lockDelay <= Timestamp.wrap(type(uint32).max),
      Errors.Governance__ConfigurationLib__TimeTooBig("LockDelay")
    );

    require(_self.votingDelay >= TIME_LOWER, Errors.Governance__ConfigurationLib__TimeTooSmall("VotingDelay"));
    require(_self.votingDelay <= TIME_UPPER, Errors.Governance__ConfigurationLib__TimeTooBig("VotingDelay"));

    require(_self.votingDuration >= TIME_LOWER, Errors.Governance__ConfigurationLib__TimeTooSmall("VotingDuration"));
    require(_self.votingDuration <= TIME_UPPER, Errors.Governance__ConfigurationLib__TimeTooBig("VotingDuration"));

    require(_self.executionDelay >= TIME_LOWER, Errors.Governance__ConfigurationLib__TimeTooSmall("ExecutionDelay"));
    require(_self.executionDelay <= TIME_UPPER, Errors.Governance__ConfigurationLib__TimeTooBig("ExecutionDelay"));

    require(_self.gracePeriod >= TIME_LOWER, Errors.Governance__ConfigurationLib__TimeTooSmall("GracePeriod"));
    require(_self.gracePeriod <= TIME_UPPER, Errors.Governance__ConfigurationLib__TimeTooBig("GracePeriod"));
  }
}
