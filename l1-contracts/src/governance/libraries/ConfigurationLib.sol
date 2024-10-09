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

  function lockDelay(DataStructures.Configuration storage self) internal view returns (Timestamp) {
    return Timestamp.wrap(Timestamp.unwrap(self.votingDelay) / 5) + self.votingDuration
      + self.executionDelay;
  }

  /**
   * @notice
   * @dev     We specify `memory` here since it is called on outside import for validation
   *          before writing it to state.
   */
  function assertValid(DataStructures.Configuration memory self) internal pure returns (bool) {
    require(self.quorum >= QUORUM_LOWER, Errors.Apella__ConfigurationLib__QuorumTooSmall());
    require(self.quorum <= QUORUM_UPPER, Errors.Apella__ConfigurationLib__QuorumTooBig());

    require(
      self.voteDifferential <= DIFFERENTIAL_UPPER,
      Errors.Apella__ConfigurationLib__DifferentialTooBig()
    );

    require(
      self.minimumVotes >= VOTES_LOWER, Errors.Apella__ConfigurationLib__InvalidMinimumVotes()
    );

    require(
      self.votingDelay >= TIME_LOWER, Errors.Apella__ConfigurationLib__TimeTooSmall("VotingDelay")
    );
    require(
      self.votingDelay <= TIME_UPPER, Errors.Apella__ConfigurationLib__TimeTooBig("VotingDelay")
    );

    require(
      self.votingDuration >= TIME_LOWER,
      Errors.Apella__ConfigurationLib__TimeTooSmall("VotingDuration")
    );
    require(
      self.votingDuration <= TIME_UPPER,
      Errors.Apella__ConfigurationLib__TimeTooBig("VotingDuration")
    );

    require(
      self.executionDelay >= TIME_LOWER,
      Errors.Apella__ConfigurationLib__TimeTooSmall("ExecutionDelay")
    );
    require(
      self.executionDelay <= TIME_UPPER,
      Errors.Apella__ConfigurationLib__TimeTooBig("ExecutionDelay")
    );

    require(
      self.gracePeriod >= TIME_LOWER, Errors.Apella__ConfigurationLib__TimeTooSmall("GracePeriod")
    );
    require(
      self.gracePeriod <= TIME_UPPER, Errors.Apella__ConfigurationLib__TimeTooBig("GracePeriod")
    );

    return true;
  }
}
