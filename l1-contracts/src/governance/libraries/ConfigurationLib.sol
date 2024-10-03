// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

library ConfigurationLib {
  uint256 internal constant YEAR_2100 = 4102444800;

  uint256 internal constant QUORUM_LOWER = 1;
  uint256 internal constant QUORUM_UPPER = 1e18;

  uint256 internal constant DIFFERENTIAL_LOWER = 0;
  uint256 internal constant DIFFERENTIAL_UPPER = 1e18;

  uint256 internal constant VOTES_LOWER = 1;

  function lockDelay(DataStructures.Configuration storage self) internal view returns (Timestamp) {
    return self.votingDuration + self.executionDelay;
  }

  /**
   * @notice
   * @dev     We specify `memory` here since it is called on outside import for validation
   *          before writing it to state.
   */
  function assertValid(DataStructures.Configuration memory self) internal pure returns (bool) {
    require(self.quorum >= QUORUM_LOWER, Errors.Apella__ConfigurationLib__ConfigInvalidQuorum());
    require(self.quorum <= QUORUM_UPPER, Errors.Apella__ConfigurationLib__ConfigInvalidQuorum());

    require(
      self.voteDifferential >= DIFFERENTIAL_LOWER,
      Errors.Apella__ConfigurationLib__ConfigInvalidDifferential()
    );
    require(
      self.voteDifferential <= DIFFERENTIAL_UPPER,
      Errors.Apella__ConfigurationLib__ConfigInvalidDifferential()
    );

    require(
      self.minimumVotes >= VOTES_LOWER, Errors.Apella__ConfigurationLib__InvalidMinimumVotes()
    );

    // Some restrictions on the individual sections.

    return true;
  }
}
