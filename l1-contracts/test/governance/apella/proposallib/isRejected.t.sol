// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {ConfigurationLib} from "@aztec/governance/libraries/ConfigurationLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

import {Math} from "@oz/utils/math/Math.sol";

contract IsRejectedTest is Test {
  using ProposalLib for DataStructures.Proposal;
  using ConfigurationLib for DataStructures.Configuration;

  DataStructures.Proposal internal proposal;
  uint256 internal totalPower;
  uint256 internal votes;
  uint256 internal votesNeeded;
  uint256 internal yeaLimit;

  function test_WhenMinimumConfigEq0() external {
    // it revert
    vm.expectRevert(abi.encodeWithSelector(Errors.Apella__ProposalLib__ZeroMinimum.selector));
    proposal.isRejected(0);
  }

  modifier whenMinimumGt0(DataStructures.Configuration memory _config) {
    proposal.config.minimumVotes =
      bound(_config.minimumVotes, ConfigurationLib.VOTES_LOWER, type(uint256).max);
    _;
  }

  function test_WhenTotalPowerLtMinimum(DataStructures.Configuration memory _config)
    external
    whenMinimumGt0(_config)
  {
    // it return true
    assertTrue(proposal.isRejected(0));
  }

  modifier whenTotalPowerGteMinimum(uint256 _totalPower) {
    totalPower = bound(_totalPower, proposal.config.minimumVotes, type(uint256).max);

    _;
  }

  modifier whenQuorumConfigInvalid() {
    _;
  }

  function test_WhenVotesNeededEq0(DataStructures.Configuration memory _config, uint256 _totalPower)
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigInvalid
  {
    // it revert
    vm.expectRevert(abi.encodeWithSelector(Errors.Apella__ProposalLib__ZeroVotesNeeded.selector));
    proposal.isRejected(totalPower);
  }

  function test_WhenVotesNeededGtTotal(
    DataStructures.Configuration memory _config,
    uint256 _totalPower
  ) external whenMinimumGt0(_config) whenTotalPowerGteMinimum(_totalPower) whenQuorumConfigInvalid {
    // it revert
    proposal.config.quorum = 1e18 + 1;

    // Overwriting some limits such that we do not overflow
    uint256 upperLimit = Math.mulDiv(type(uint256).max, 1e18, proposal.config.quorum);
    proposal.config.minimumVotes =
      bound(_config.minimumVotes, ConfigurationLib.VOTES_LOWER, upperLimit);
    totalPower = bound(_totalPower, proposal.config.minimumVotes, upperLimit);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Apella__ProposalLib__MoreVoteThanExistNeeded.selector)
    );
    proposal.isRejected(totalPower);
  }

  function test_WhenVotesNeededGtUint256Max(
    DataStructures.Configuration memory _config,
    uint256 _totalPower
  ) external whenMinimumGt0(_config) whenTotalPowerGteMinimum(_totalPower) whenQuorumConfigInvalid {
    // it revert
    totalPower = type(uint256).max;
    proposal.config.quorum = 1e18 + 1;
    vm.expectRevert(abi.encodeWithSelector(Math.MathOverflowedMulDiv.selector));
    proposal.isRejected(totalPower);
  }

  modifier whenQuorumConfigValid(DataStructures.Configuration memory _config) {
    proposal.config.quorum =
      bound(_config.quorum, ConfigurationLib.QUORUM_LOWER, ConfigurationLib.QUORUM_UPPER);
    votesNeeded = Math.mulDiv(totalPower, proposal.config.quorum, 1e18, Math.Rounding.Ceil);

    _;
  }

  function test_WhenVotesCastLtVotesNeeded(
    DataStructures.Configuration memory _config,
    uint256 _totalPower,
    uint256 _votes,
    uint256 _yea
  )
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
  {
    // it return true

    uint256 maxVotes = votesNeeded > 0 ? votesNeeded - 1 : votesNeeded;

    votes = bound(_votes, 0, maxVotes);

    uint256 yea = bound(_yea, 0, votes);
    uint256 nea = votes - yea;

    proposal.summedBallot.yea = yea;
    proposal.summedBallot.nea = nea;

    assertTrue(proposal.isRejected(totalPower));
  }

  modifier whenVotesCastGteVotesNeeded(uint256 _votes) {
    votes = bound(_votes, votesNeeded, totalPower);
    _;
  }

  modifier whenDifferentialConfigInvalid() {
    _;
  }

  function test_WhenYeaVotesNeededEq0(
    DataStructures.Configuration memory _config,
    uint256 _totalPower,
    uint256 _votes
  )
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigInvalid
  {
    // it revert
    // Not sure if we can actually even hit this case, think we could only hit it
    // if votesCast is 0 because we are rounding up
    // @todo
    assertFalse(true, "TODO");
  }

  function test_WhenYeaVotesNeededGtUint256Max(
    DataStructures.Configuration memory _config,
    uint256 _totalPower,
    uint256 _votes
  )
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigInvalid
  {
    // it revert
    // @todo
    assertFalse(true, "TODO");
  }

  function _test_WhenYeaVotesNeededGtVotesCast(
    DataStructures.Configuration memory _config,
    uint256 _totalPower,
    uint256 _votes
  )
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigInvalid
  {
    // it revert
    proposal.config.voteDifferential = 1e18 + 1;

    // Overwriting some limits such that we do not overflow
    uint256 upperLimit = Math.mulDiv(type(uint256).max, 1e18, proposal.config.voteDifferential);
    proposal.config.minimumVotes =
      bound(_config.minimumVotes, ConfigurationLib.VOTES_LOWER, upperLimit);
    totalPower = bound(_totalPower, proposal.config.minimumVotes, upperLimit);
    votesNeeded = Math.mulDiv(totalPower, proposal.config.quorum, 1e18, Math.Rounding.Ceil);
    votes = bound(_votes, votesNeeded, totalPower);
    proposal.summedBallot.nea = votes;

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Apella__ProposalLib__MoreYeaVoteThanExistNeeded.selector)
    );
    proposal.isRejected(totalPower);
  }

  modifier whenDifferentialConfigValid(DataStructures.Configuration memory _config) {
    proposal.config.voteDifferential = bound(
      _config.voteDifferential,
      ConfigurationLib.DIFFERENTIAL_LOWER,
      ConfigurationLib.DIFFERENTIAL_UPPER
    );
    uint256 yeaFraction = Math.ceilDiv(1e18 + proposal.config.voteDifferential, 2);
    yeaLimit = Math.mulDiv(votes, yeaFraction, 1e18, Math.Rounding.Ceil);

    _;
  }

  function test_WhenYeaNeededEqVotesCast(
    DataStructures.Configuration memory _config,
    uint256 _totalPower,
    uint256 _votes
  )
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigValid(_config)
  {
    // it return true
    // overwriting whenDifferentialConfigValid
    proposal.config.voteDifferential = 1e18;
    uint256 yeaFraction = Math.ceilDiv(1e18 + proposal.config.voteDifferential, 2);
    yeaLimit = Math.mulDiv(votes, yeaFraction, 1e18, Math.Rounding.Ceil);

    assertTrue(proposal.isRejected(totalPower));
  }

  function test_WhenYeaVotesLteYeaNeeded(
    DataStructures.Configuration memory _config,
    uint256 _totalPower,
    uint256 _votes,
    uint256 _yea
  )
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigValid(_config)
  {
    // it return true

    // Avoid the edge case where all votes YEA, which should pass
    uint256 maxYea = yeaLimit == votes ? yeaLimit - 1 : yeaLimit;

    uint256 yea = bound(_yea, 0, maxYea);
    uint256 nea = votes - yea;

    proposal.summedBallot.yea = yea;
    proposal.summedBallot.nea = nea;

    assertTrue(proposal.isRejected(totalPower));
  }

  function test_WhenYeaVotesGtYeaNeeded(
    DataStructures.Configuration memory _config,
    uint256 _totalPower,
    uint256 _votes,
    uint256 _yea
  )
    external
    whenMinimumGt0(_config)
    whenTotalPowerGteMinimum(_totalPower)
    whenQuorumConfigValid(_config)
    whenVotesCastGteVotesNeeded(_votes)
    whenDifferentialConfigValid(_config)
  {
    // it return false

    // If we are not in the case where all votes are YEA, we should add 1 to ensure
    // that we actually have sufficient YEA votes.
    uint256 minYea = yeaLimit < votes ? yeaLimit + 1 : yeaLimit;

    uint256 yea = bound(_yea, minYea, votes);
    uint256 nea = votes - yea;

    proposal.summedBallot.yea = yea;
    proposal.summedBallot.nea = nea;

    assertGt(yea, nea, "yea <= nea");
    assertFalse(proposal.isRejected(totalPower), "Was rejected");
  }
}
