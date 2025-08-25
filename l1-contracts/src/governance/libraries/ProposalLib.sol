// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
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
 * @notice  Library for governance proposal evaluation and lifecycle management
 *
 *          This library implements the core vote tabulation logic, and has helpers for getting timestamps
 *          for the proposal lifecycle.
 *
 * @dev     VOTING MECHANICS:
 *
 *          The voting system uses three key parameters that interact to determine proposal outcomes:
 *
 *          1. **minimumVotes**: Absolute minimum voting power required in the system
 *             - Prevents proposals when total power is too low for meaningful governance
 *             - Must be > 0 and <= totalPower for valid proposals
 *
 *          2. **quorum**: Percentage of total power that must participate (in 1e18 precision)
 *             - votesNeeded = ceil(totalPower * quorum / 1e18)
 *             - Ensures sufficient community participation before decisions are made
 *             - Example: 30% quorum (0.3e18) with 1000 total power requires ≥300 votes
 *
 *          3. **requiredYeaMargin**: the required minimum difference between the percentage of yea votes,
 *                                    and the percentage of nay votes, in 1e18 precision
 *             - requiredYeaVotesFraction = ceil((1e18 + requiredYeaMargin) / 2)
 *             - requiredYeaVotes = ceil(votesCast * requiredYeaVotesFraction / 1e18)
 *             - Yea votes must be > requiredYeaVotes to pass (strict inequality to avoid ties)
 *             - Example: 20% requiredYeaMargin (0.2e18) means yea needs >60% of cast votes
 *             - Example: 0% requiredYeaMargin means yea needs >50% of cast votes
 *
 *             To see why this is the case, let `y` be the percentage of yea votes,
 *             and `n` be the percentage of nay votes, and `m` be the requiredYeaMargin.
 *
 *             The condition for the proposal to pass is `y - n > m`.
 *             Thus, `y > m + n`, which is equivalent to `y > m + (1 - y)` => `2y > m + 1` => `y > (m + 1) / 2`.
 *
 *          These parameters are included on the proposal itself, which are copied from Governance at the
 *          time the proposal is created.
 *
 * @dev     EXAMPLE SCENARIO:
 *          - Total power: 1000 tokens
 *          - Minimum votes: 100 tokens
 *          - Quorum: 40% (0.4e18)
 *          - Required yea margin: 10% (0.1e18)
 *
 *          For a proposal to pass:
 *          1. Total power (1000) must be ≥ minimum votes (100) ✓
 *          2. Votes needed = ceil(1000 * 0.4) = 400 votes minimum
 *          3. If 500 votes cast (300 yea, 200 nay):
 *             - Quorum met: 500 ≥ 400 ✓
 *             - Required yea votes = ceil(500 * ceil(1.1e18/2) / 1e18) = ceil(500 * 0.55) = 275
 *             - Proposal passes: 300 yea > 275 required yea votes ✓
 *
 * @dev     ROUNDING STRATEGY:
 *          All calculations use ceiling rounding to ensure the protocol is never "underpaid"
 *          in terms of required votes. This prevents edge cases where fractional vote
 *          requirements could round down to zero or insufficient thresholds.
 *
 * @dev     PROPOSAL LIFECYCLE:
 *          The library also manages proposal timing through four phases:
 *          1. Pending: creation → creation + votingDelay
 *          2. Active: pending end → pending end + votingDuration
 *          3. Queued: active end → active end + executionDelay
 *          4. Executable: queued end → queued end + gracePeriod
 */
library ProposalLib {
  /**
   * @notice Tabulate the votes for a proposal.
   * @dev This function is used to determine if a proposal has met the acceptance criteria.
   *
   * @param _self The proposal to tabulate the votes for.
   * @param _totalPower The total power (in Governance) at proposal.pendingThrough().
   * @return The vote tabulation result, and additional information.
   */
  function voteTabulation(Proposal storage _self, uint256 _totalPower)
    internal
    view
    returns (VoteTabulationReturn, VoteTabulationInfo)
  {
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

    uint256 votesCast = _self.summedBallot.nay + _self.summedBallot.yea;
    if (votesCast < votesNeeded) {
      return (VoteTabulationReturn.Rejected, VoteTabulationInfo.VotesCastLtVotesNeeded);
    }

    // Edge case where all the votes are yea, no need to compute requiredApprovalVotes.
    // ConfigurationLib enforces that requiredYeaMargin is <= 1e18,
    // i.e. we cannot require more votes to be yes than total votes.
    if (_self.summedBallot.yea == votesCast) {
      return (VoteTabulationReturn.Accepted, VoteTabulationInfo.YeaVotesEqVotesCast);
    }

    uint256 requiredApprovalVotesFraction = Math.ceilDiv(1e18 + _self.config.requiredYeaMargin, 2);
    uint256 requiredApprovalVotes = Math.mulDiv(votesCast, requiredApprovalVotesFraction, 1e18, Math.Rounding.Ceil);

    /*if (requiredApprovalVotes == 0) {
      // It should be impossible to hit this case as `requiredApprovalVotesFraction` cannot be 0,
      // and due to rounding up, only way to hit this would be if `votesCast = 0`,
      // which is already handled as `votesCast >= votesNeeded` and `votesNeeded > 0`.
      return (VoteTabulationReturn.Invalid, VoteTabulationInfo.YeaLimitEqZero);
    }*/
    if (requiredApprovalVotes > votesCast) {
      return (VoteTabulationReturn.Invalid, VoteTabulationInfo.YeaLimitGtVotesCast);
    }

    // We want to see that there are MORE votes on yea than needed
    // We explicitly need MORE to ensure we don't "tie".
    // If we need as many yea as there are votes, we know it is impossible already.
    // due to the check earlier, that summedBallot.yea == votesCast.
    if (_self.summedBallot.yea <= requiredApprovalVotes) {
      return (VoteTabulationReturn.Rejected, VoteTabulationInfo.YeaVotesLeYeaLimit);
    }

    return (VoteTabulationReturn.Accepted, VoteTabulationInfo.YeaVotesGtYeaLimit);
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

  // Identical to `pendingThrough` but for proposals already in memory
  function pendingThroughMemory(Proposal memory _self) internal pure returns (Timestamp) {
    return _self.creation + _self.config.votingDelay;
  }
}
