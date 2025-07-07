// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Math} from "@oz/utils/math/Math.sol";

enum VoteTabulationReturn {
  Accepted,
  Rejected,
  Invalid
}

enum VoteTabulationInfo {
  MinimumEqZero,
  TotalPowerLtMinimum,
  VotesNeededEqZero,
  VotesNeededGtTotalPower,
  VotesCastLtVotesNeeded,
  YeaLimitEqZero,
  YeaLimitGtVotesCast,
  YeaLimitEqVotesCast,
  YeaVotesEqVotesCast,
  YeaVotesLeYeaLimit,
  YeaVotesGtYeaLimit
}

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
  function voteTabulation(Proposal storage _self, uint256 _totalPower)
    internal
    view
    returns (VoteTabulationReturn, VoteTabulationInfo)
  {
    if (_self.config.minimumVotes == 0) {
      return (VoteTabulationReturn.Invalid, VoteTabulationInfo.MinimumEqZero);
    }
    if (_totalPower < _self.config.minimumVotes) {
      return (VoteTabulationReturn.Rejected, VoteTabulationInfo.TotalPowerLtMinimum);
    }

    uint256 votesNeeded = Math.mulDiv(_totalPower, _self.config.quorum, 1e18, Math.Rounding.Ceil);
    if (votesNeeded == 0) {
      return (VoteTabulationReturn.Invalid, VoteTabulationInfo.VotesNeededEqZero);
    }
    if (votesNeeded > _totalPower) {
      return (VoteTabulationReturn.Invalid, VoteTabulationInfo.VotesNeededGtTotalPower);
    }

    uint256 votesCast = _self.summedBallot.nea + _self.summedBallot.yea;
    if (votesCast < votesNeeded) {
      return (VoteTabulationReturn.Rejected, VoteTabulationInfo.VotesCastLtVotesNeeded);
    }

    // Edge case where all the votes are yea, no need to compute differential
    // Assumes a "sane" value for differential, e.g., you cannot require more votes
    // to be yes than total votes.
    if (_self.summedBallot.yea == votesCast) {
      return (VoteTabulationReturn.Accepted, VoteTabulationInfo.YeaVotesEqVotesCast);
    }

    uint256 yeaLimitFraction = Math.ceilDiv(1e18 + _self.config.voteDifferential, 2);
    uint256 yeaLimit = Math.mulDiv(votesCast, yeaLimitFraction, 1e18, Math.Rounding.Ceil);

    /*if (yeaLimit == 0) {
      // It should be impossible to hit this case as `yeaLimitFraction` cannot be 0,
      // and due to rounding, only way to hit this would be if `votesCast = 0`,
      // which is already handled as `votesCast >= votesNeeded` and `votesNeeded > 0`.
      return (VoteTabulationReturn.Invalid, VoteTabulationInfo.YeaLimitEqZero);
    }*/
    if (yeaLimit > votesCast) {
      return (VoteTabulationReturn.Invalid, VoteTabulationInfo.YeaLimitGtVotesCast);
    }

    // We want to see that there are MORE votes on yea than needed
    // We explictly need MORE to ensure we don't "tie".
    // If we need as many yea as there are votes, we know it is impossible already.
    // due to the check earlier, that summedBallot.yea == votesCast.
    if (_self.summedBallot.yea <= yeaLimit) {
      return (VoteTabulationReturn.Rejected, VoteTabulationInfo.YeaVotesLeYeaLimit);
    }

    return (VoteTabulationReturn.Accepted, VoteTabulationInfo.YeaVotesGtYeaLimit);
  }

  /**
   * @notice	A stable state is one which cannoted be moved away from
   */
  function isStable(Proposal storage _self) internal view returns (bool) {
    ProposalState s = _self.state; // cache
    return s == ProposalState.Executed || s == ProposalState.Dropped;
  }

  function pendingThrough(Proposal storage _self) internal view returns (Timestamp) {
    return _self.creation + _self.config.votingDelay;
  }

  function activeThrough(Proposal storage _self) internal view returns (Timestamp) {
    return ProposalLib.pendingThrough(_self) + _self.config.votingDuration;
  }

  function queuedThrough(Proposal storage _self) internal view returns (Timestamp) {
    return ProposalLib.activeThrough(_self) + _self.config.executionDelay;
  }

  function executableThrough(Proposal storage _self) internal view returns (Timestamp) {
    return ProposalLib.queuedThrough(_self) + _self.config.gracePeriod;
  }

  function pendingThroughMemory(Proposal memory _self) internal pure returns (Timestamp) {
    return _self.creation + _self.config.votingDelay;
  }
}
