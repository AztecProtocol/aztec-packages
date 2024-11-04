// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

library ConfigurationLib {
  uint256 internal constant YEAR_2100 = 4102444800;

  uint256 internal constant QUORUM_LOWER = 1;
  uint256 internal constant QUORUM_UPPER = 1e18;

  uint256 internal constant DIFFERENTIAL_UPPER = 1e18;

  uint256 internal constant VOTES_LOWER = 1;

  Timestamp internal constant TIME_LOWER = Timestamp.wrap(3600);
  Timestamp internal constant TIME_UPPER = Timestamp.wrap(30 * 24 * 3600);

  function lockDelay(DataStructures.Configuration storage _self) internal view returns (Timestamp) {
    return Timestamp.wrap(Timestamp.unwrap(_self.votingDelay) / 5) + _self.votingDuration
      + _self.executionDelay;
  }

  /**
   * @notice
   * @dev     We specify `memory` here since it is called on outside import for validation
   *          before writing it to state.
   */
  function assertValid(DataStructures.Configuration memory _self) internal pure returns (bool) {
    require(_self.quorum >= QUORUM_LOWER, Errors.Apella__ConfigurationLib__QuorumTooSmall());
    require(_self.quorum <= QUORUM_UPPER, Errors.Apella__ConfigurationLib__QuorumTooBig());

    require(
      _self.voteDifferential <= DIFFERENTIAL_UPPER,
      Errors.Apella__ConfigurationLib__DifferentialTooBig()
    );

    require(
      _self.minimumVotes >= VOTES_LOWER, Errors.Apella__ConfigurationLib__InvalidMinimumVotes()
    );

    require(
      _self.votingDelay >= TIME_LOWER, Errors.Apella__ConfigurationLib__TimeTooSmall("VotingDelay")
    );
    require(
      _self.votingDelay <= TIME_UPPER, Errors.Apella__ConfigurationLib__TimeTooBig("VotingDelay")
    );

    require(
      _self.votingDuration >= TIME_LOWER,
      Errors.Apella__ConfigurationLib__TimeTooSmall("VotingDuration")
    );
    require(
      _self.votingDuration <= TIME_UPPER,
      Errors.Apella__ConfigurationLib__TimeTooBig("VotingDuration")
    );

    require(
      _self.executionDelay >= TIME_LOWER,
      Errors.Apella__ConfigurationLib__TimeTooSmall("ExecutionDelay")
    );
    require(
      _self.executionDelay <= TIME_UPPER,
      Errors.Apella__ConfigurationLib__TimeTooBig("ExecutionDelay")
    );

    require(
      _self.gracePeriod >= TIME_LOWER, Errors.Apella__ConfigurationLib__TimeTooSmall("GracePeriod")
    );
    require(
      _self.gracePeriod <= TIME_UPPER, Errors.Apella__ConfigurationLib__TimeTooBig("GracePeriod")
    );

    return true;
  }
}
