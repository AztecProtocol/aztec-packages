// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "../base.t.sol";
import {Configuration, Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {VoteTabulationReturn, VoteTabulationInfo} from "@aztec/governance/libraries/ProposalLib.sol";
import {ConfigurationLib} from "@aztec/governance/libraries/ConfigurationLib.sol";
import {Math, Panic} from "@oz/utils/math/Math.sol";

contract VoteTabulationTest is GovernanceBase {
  using ConfigurationLib for Configuration;

  uint256 internal totalPower;
  uint256 internal votes;
  uint256 internal votesNeeded;
  uint256 internal yeaLimit;

  modifier whenMinimumGt0(Configuration memory _config) {
    proposal.config.minimumVotes = bound(_config.minimumVotes, ConfigurationLib.VOTES_LOWER, type(uint96).max);
    _;
  }

  function test_WhenTotalPowerLtMinimum(Configuration memory _config, uint256 _totalPower)
    external
    whenMinimumGt0(_config)
  {
    // it return (Rejected, TotalPowerLtMinimum)
    totalPower = bound(_totalPower, 0, proposal.config.minimumVotes - 1);
    (VoteTabulationReturn vtr, VoteTabulationInfo vti) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Rejected, "invalid return value");
    assertEq(vti, VoteTabulationInfo.TotalPowerLtMinimum, "invalid info value");
  }

  modifier whenTotalPowerGteMinimum(uint256 _totalPower) {
    totalPower = bound(_totalPower, proposal.config.minimumVotes, type(uint96).max);
    _;
  }

  modifier whenQuorumConfigInvalid() {
    _;
  }

  function test_WhenVotesNeededEq0(Configuration memory _config, uint256 _totalPower)
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigInvalid
  {
    // it return (Invalid, VotesNeededEqZero)
    (VoteTabulationReturn vtr, VoteTabulationInfo vti) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Invalid, "invalid return value");
    assertEq(vti, VoteTabulationInfo.VotesNeededEqZero, "invalid info value");
  }

  function test_WhenVotesNeededGtTotal(Configuration memory _config, uint256 _totalPower)
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigInvalid
  {
    // it return (Invalid, VotesNeededGtTotalPower)

    proposal.config.quorum = 1e18 + 1;

    // Overwriting some limits such that we do not overflow
    uint256 upperLimit = Math.mulDiv(type(uint96).max, 1e18, proposal.config.quorum);
    proposal.config.minimumVotes = bound(_config.minimumVotes, ConfigurationLib.VOTES_LOWER, upperLimit);
    totalPower = bound(_totalPower, proposal.config.minimumVotes, upperLimit);

    (VoteTabulationReturn vtr, VoteTabulationInfo vti) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Invalid, "invalid return value");
    assertEq(vti, VoteTabulationInfo.VotesNeededGtTotalPower, "invalid info value");
  }

  function test_WhenVotesNeededGtUint256Max(Configuration memory _config, uint256 _totalPower)
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigInvalid
  {
    // it revert
    totalPower = type(uint256).max;
    proposal.config.quorum = 1e18 + 1;
    vm.expectRevert(abi.encodeWithSelector(0x4e487b71, Panic.UNDER_OVERFLOW));
    upw.voteTabulation(proposal, totalPower);
  }

  modifier whenQuorumConfigValid(Configuration memory _config) {
    proposal.config.quorum = bound(_config.quorum, ConfigurationLib.QUORUM_LOWER, ConfigurationLib.QUORUM_UPPER);
    votesNeeded = Math.mulDiv(totalPower, proposal.config.quorum, 1e18, Math.Rounding.Ceil);

    _;
  }

  function test_WhenVotesCastLtVotesNeeded(
    Configuration memory _config,
    uint256 _totalPower,
    uint256 _votes,
    uint256 _yea
  ) external whenMinimumGt0(_config) whenTotalPowerGteMinimum(_totalPower) whenQuorumConfigValid(_config) {
    // it return (Rejected, VotesCastLtVotesNeeded)

    uint256 maxVotes = votesNeeded > 0 ? votesNeeded - 1 : votesNeeded;

    votes = bound(_votes, 0, maxVotes);

    uint256 yea = bound(_yea, 0, votes);
    uint256 nay = votes - yea;

    proposal.summedBallot.yea = yea;
    proposal.summedBallot.nay = nay;

    (VoteTabulationReturn vtr, VoteTabulationInfo vti) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Rejected, "invalid return value");
    assertEq(vti, VoteTabulationInfo.VotesCastLtVotesNeeded, "invalid info value");
  }

  modifier whenVotesCastGteVotesNeeded(uint256 _votes) {
    votes = bound(_votes, votesNeeded, totalPower);
    _;
  }

  modifier whenDifferentialConfigInvalid() {
    _;
  }

  function test_WhenYeaLimitEq0(Configuration memory _config, uint256 _totalPower, uint256 _votes)
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigInvalid
  {
    // it return (Invalid, YeaLimitEqZero)
    // It should be impossible to hit this case as `yeaLimitFraction` cannot be 0,
    // and due to rounding, only way to hit this would be if `votesCast = 0`,
    // which is already handled as `votesCast >= votesNeeded` and `votesNeeded > 0`.
  }

  function test_WhenYeaLimitGtVotesCast(Configuration memory _config, uint256 _totalPower, uint256 _votes)
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigInvalid
  {
    // it return (Invalid, YeaLimitGtVotesCast)
    proposal.config.requiredYeaMargin = 1e18 + 1;

    // Overwriting some limits such that we do not overflow
    uint256 upperLimit = Math.mulDiv(type(uint96).max, 1e18, proposal.config.requiredYeaMargin);
    proposal.config.minimumVotes = bound(_config.minimumVotes, ConfigurationLib.VOTES_LOWER, upperLimit);
    totalPower = bound(_totalPower, proposal.config.minimumVotes, upperLimit);
    votesNeeded = Math.mulDiv(totalPower, proposal.config.quorum, 1e18, Math.Rounding.Ceil);
    votes = bound(_votes, votesNeeded, totalPower);
    proposal.summedBallot.nay = votes;

    (VoteTabulationReturn vtr, VoteTabulationInfo vti) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Invalid, "invalid return value");
    assertEq(vti, VoteTabulationInfo.YeaLimitGtVotesCast, "invalid info value");
  }

  modifier whenDifferentialConfigValid(Configuration memory _config) {
    proposal.config.requiredYeaMargin = bound(_config.requiredYeaMargin, 0, ConfigurationLib.REQUIRED_YEA_MARGIN_UPPER);
    uint256 yeaFraction = Math.ceilDiv(1e18 + proposal.config.requiredYeaMargin, 2);
    yeaLimit = Math.mulDiv(votes, yeaFraction, 1e18, Math.Rounding.Ceil);

    _;
  }

  function test_WhenYeaVotesEqVotesCast(Configuration memory _config, uint256 _totalPower, uint256 _votes)
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigValid(_config)
  {
    // it return (Accepted, YeaVotesEqVotesCast)
    proposal.summedBallot.yea = votes;

    (VoteTabulationReturn vtr, VoteTabulationInfo vti) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Accepted, "invalid return value");
    assertEq(vti, VoteTabulationInfo.YeaVotesEqVotesCast, "invalid info value");
  }

  function test_WhenYeaVotesLteYeaLimit(Configuration memory _config, uint256 _totalPower, uint256 _votes, uint256 _yea)
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigValid(_config)
  {
    // it return (Rejected, YeaVotesLeYeaLimit)

    // Likely not the best way to do it, but we just need to avoid that one case.
    vm.assume(yeaLimit != votes);

    // Avoid the edge case where all votes YEA, which should pass
    uint256 maxYea = yeaLimit == votes ? yeaLimit - 1 : yeaLimit;

    uint256 yea = bound(_yea, 0, maxYea);
    uint256 nay = votes - yea;

    proposal.summedBallot.yea = yea;
    proposal.summedBallot.nay = nay;

    (VoteTabulationReturn vtr, VoteTabulationInfo vti) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Rejected, "invalid return value");
    assertEq(vti, VoteTabulationInfo.YeaVotesLeYeaLimit, "invalid info value");
  }

  function test_WhenYeaVotesGtYeaLimit(Configuration memory _config, uint256 _totalPower, uint256 _votes, uint256 _yea)
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigValid(_config)
  {
    // it return (Accepted, YeaVotesGtYeaLimit)

    // If we are not in the case where all votes are YEA, we should add 1 to ensure
    // that we actually have sufficient YEA votes.
    uint256 minYea = yeaLimit < votes ? yeaLimit + 1 : yeaLimit;
    uint256 yea = bound(_yea, minYea, votes);

    // Likely not the best way to do it, but we just need to avoid that one case.
    vm.assume(yea != votes);

    uint256 nay = votes - yea;

    proposal.summedBallot.yea = yea;
    proposal.summedBallot.nay = nay;

    assertGt(yea, nay, "yea <= nay");

    (VoteTabulationReturn vtr, VoteTabulationInfo vti) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Accepted, "invalid return value");
    assertEq(vti, VoteTabulationInfo.YeaVotesGtYeaLimit, "invalid info value");
  }
}
