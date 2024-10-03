// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

/**
 * @notice  Library for dealing with proposal math
 *
 *          In particular, dealing with the computation to evaluate
 *          whether a proposal should be rejected or not.
 *
 *          We will be using `Ceil` as the rounding.
 *          The intuition is fairly straight forward, see the voting
 *          as repaying a debt. We want to ensure that the protocol
 *          is never "underpaid" when it is to perform an election.
 *          So when it computes the total debt repayment needed to
 *          execute the proposal, it will be rounding up.
 *
 *          If we do not round up, a mulDiv with small values could
 *          for example ending at 0, having a case where no votes are needed
 */
library ProposalLib {
  /**
   * @notice  Compute if we reject the proposal or not
   *          Can
   *
   *          Should only ever revert, if "bad" values are setup for the config.
   */
  function isRejected(DataStructures.Proposal storage self, uint256 _totalPower)
    internal
    view
    returns (bool)
  {
    require(self.config.minimumVotes > 0, Errors.Apella__ProposalLib__ZeroMinimum());
    if (_totalPower < self.config.minimumVotes) {
      return true;
    }

    uint256 votesNeeded = Math.mulDiv(_totalPower, self.config.quorum, 1e18, Math.Rounding.Ceil);
    require(votesNeeded > 0, Errors.Apella__ProposalLib__ZeroVotesNeeded());
    require(votesNeeded <= _totalPower, Errors.Apella__ProposalLib__MoreVoteThanExistNeeded());

    uint256 votesCast = self.summedBallot.nea + self.summedBallot.yea;
    if (votesCast < votesNeeded) {
      // Insufficient votes cast, better luck next time
      return true;
    }

    // Edge case where all the votes are yea, no need to compute differential
    // Assumes a "sane" value for differential, e.g., you cannot require more votes
    // to be yes than total votes.
    if (self.summedBallot.yea == votesCast) {
      return false;
    }

    uint256 yeaNeededFraction = Math.ceilDiv(1e18 + self.config.voteDifferential, 2);
    uint256 yeaNeeded = Math.mulDiv(votesCast, yeaNeededFraction, 1e18, Math.Rounding.Ceil);
    require(yeaNeeded > 0, Errors.Apella__ProposalLib__ZeroYeaVotesNeeded());
    require(yeaNeeded <= votesCast, Errors.Apella__ProposalLib__MoreYeaVoteThanExistNeeded());

    // If we need as many yea as there are votes, we know it is impossible already.
    // due to the check earlier.
    if (yeaNeeded == votesCast) {
      return true;
    }

    // In all other cases, we want to see that there are MORE votes on yea than needed
    // We explictly need MORE to ensure we don't "tie".
    return self.summedBallot.yea <= yeaNeeded;
  }

  /**
   * @notice	A stable state is one which cannoted be moved away from
   */
  function isStable(DataStructures.Proposal storage self) internal view returns (bool) {
    return self.state == DataStructures.ProposalState.Executed
      || self.state == DataStructures.ProposalState.Dropped
      || self.state == DataStructures.ProposalState.Expired
      || self.state == DataStructures.ProposalState.Rejected;
  }

  function pendingUntil(DataStructures.Proposal storage self) internal view returns (Timestamp) {
    return self.creation + self.config.votingDelay;
  }

  function activeUntil(DataStructures.Proposal storage self) internal view returns (Timestamp) {
    return ProposalLib.pendingUntil(self) + self.config.votingDuration;
  }

  function queuedUntil(DataStructures.Proposal storage self) internal view returns (Timestamp) {
    return ProposalLib.activeUntil(self) + self.config.executionDelay;
  }

  function executableUntil(DataStructures.Proposal storage self) internal view returns (Timestamp) {
    return ProposalLib.queuedUntil(self) + self.config.gracePeriod;
  }
}
