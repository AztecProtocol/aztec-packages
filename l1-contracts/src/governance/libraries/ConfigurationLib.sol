// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Configuration} from "@aztec/governance/interfaces/IGovernance.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

library ConfigurationLib {
  uint256 internal constant QUORUM_LOWER = 1;
  uint256 internal constant QUORUM_UPPER = 1e18;

  uint256 internal constant DIFFERENTIAL_UPPER = 1e18;

  uint256 internal constant VOTES_LOWER = 1;

  Timestamp internal constant TIME_LOWER = Timestamp.wrap(60);
  Timestamp internal constant TIME_UPPER = Timestamp.wrap(30 * 24 * 3600);

  function withdrawalDelay(Configuration storage _self) internal view returns (Timestamp) {
    return Timestamp.wrap(Timestamp.unwrap(_self.votingDelay) / 5) + _self.votingDuration
      + _self.executionDelay;
  }

  /**
   * @notice
   * @dev     We specify `memory` here since it is called on outside import for validation
   *          before writing it to state.
   */
  function assertValid(Configuration memory _self) internal pure returns (bool) {
    require(_self.quorum >= QUORUM_LOWER, Errors.Governance__ConfigurationLib__QuorumTooSmall());
    require(_self.quorum <= QUORUM_UPPER, Errors.Governance__ConfigurationLib__QuorumTooBig());

    require(
      _self.voteDifferential <= DIFFERENTIAL_UPPER,
      Errors.Governance__ConfigurationLib__DifferentialTooBig()
    );

    require(
      _self.minimumVotes >= VOTES_LOWER, Errors.Governance__ConfigurationLib__InvalidMinimumVotes()
    );
    require(
      _self.proposeConfig.lockAmount >= VOTES_LOWER,
      Errors.Governance__ConfigurationLib__LockAmountTooSmall()
    );

    // Beyond checking the bounds like this, it might be useful to ensure that the value is larger than the withdrawal delay
    // this, can be useful if one want to ensure that the "locker" cannot himself vote in the proposal, but as it is unclear
    // if this is a useful property, it is not enforced.
    require(
      _self.proposeConfig.lockDelay >= TIME_LOWER,
      Errors.Governance__ConfigurationLib__TimeTooSmall("LockDelay")
    );
    require(
      _self.proposeConfig.lockDelay <= TIME_UPPER,
      Errors.Governance__ConfigurationLib__TimeTooBig("LockDelay")
    );

    require(
      _self.votingDelay >= TIME_LOWER,
      Errors.Governance__ConfigurationLib__TimeTooSmall("VotingDelay")
    );
    require(
      _self.votingDelay <= TIME_UPPER,
      Errors.Governance__ConfigurationLib__TimeTooBig("VotingDelay")
    );

    require(
      _self.votingDuration >= TIME_LOWER,
      Errors.Governance__ConfigurationLib__TimeTooSmall("VotingDuration")
    );
    require(
      _self.votingDuration <= TIME_UPPER,
      Errors.Governance__ConfigurationLib__TimeTooBig("VotingDuration")
    );

    require(
      _self.executionDelay >= TIME_LOWER,
      Errors.Governance__ConfigurationLib__TimeTooSmall("ExecutionDelay")
    );
    require(
      _self.executionDelay <= TIME_UPPER,
      Errors.Governance__ConfigurationLib__TimeTooBig("ExecutionDelay")
    );

    require(
      _self.gracePeriod >= TIME_LOWER,
      Errors.Governance__ConfigurationLib__TimeTooSmall("GracePeriod")
    );
    require(
      _self.gracePeriod <= TIME_UPPER,
      Errors.Governance__ConfigurationLib__TimeTooBig("GracePeriod")
    );

    return true;
  }
}
