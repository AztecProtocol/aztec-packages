// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IGerousia} from "@aztec/governance/interfaces/IGerousia.sol";
import {GerousiaBase} from "./Base.t.sol";
import {Leonidas} from "@aztec/core/Leonidas.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Slot, SlotLib, Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract VoteTest is GerousiaBase {
  using SlotLib for Slot;

  address internal proposal = address(0xdeadbeef);
  address internal proposer = address(0);
  Leonidas internal leonidas;

  function test_WhenProposalHoldNoCode() external {
    // it revert
    vm.expectRevert(abi.encodeWithSelector(Errors.Gerousia__ProposalHaveNoCode.selector, proposal));
    gerousia.vote(proposal);
  }

  modifier whenProposalHoldCode() {
    proposal = address(this);
    _;
  }

  function test_GivenCanonicalRollupHoldNoCode() external whenProposalHoldCode {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Gerousia__InstanceHaveNoCode.selector, address(0xdead))
    );
    gerousia.vote(proposal);
  }

  modifier givenCanonicalRollupHoldCode() {
    leonidas = new Leonidas(address(this));
    registry.upgrade(address(leonidas));

    // We jump into the future since slot 0, will behave as if already voted in
    vm.warp(Timestamp.unwrap(leonidas.getTimestampForSlot(Slot.wrap(1))));
    _;
  }

  function test_GivenAVoteAlreadyCastInTheSlot()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
  {
    // it revert

    Slot currentSlot = leonidas.getCurrentSlot();
    assertEq(currentSlot.unwrap(), 1);
    vm.prank(proposer);
    gerousia.vote(proposal);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Gerousia__VoteAlreadyCastForSlot.selector, currentSlot)
    );
    gerousia.vote(proposal);
  }

  modifier givenNoVoteAlreadyCastInTheSlot() {
    _;
  }

  function test_WhenCallerIsNotProposer(address _proposer)
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoVoteAlreadyCastInTheSlot
  {
    // it revert
    vm.assume(_proposer != proposer);
    vm.prank(_proposer);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Gerousia__OnlyProposerCanVote.selector, _proposer, proposer)
    );
    gerousia.vote(proposal);
  }

  modifier whenCallerIsProposer() {
    // Lets make sure that there first is a leader
    uint256 votesOnProposal = 5;

    for (uint256 i = 0; i < votesOnProposal; i++) {
      vm.warp(
        Timestamp.unwrap(leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(1)))
      );
      vm.prank(proposer);
      gerousia.vote(proposal);
    }

    Slot currentSlot = leonidas.getCurrentSlot();
    uint256 round = gerousia.computeRound(currentSlot);
    (Slot lastVote, address leader, bool executed) = gerousia.rounds(address(leonidas), round);
    assertEq(
      gerousia.yeaCount(address(leonidas), round, leader),
      votesOnProposal,
      "invalid number of votes"
    );
    assertFalse(executed);
    assertEq(leader, proposal);
    assertEq(currentSlot.unwrap(), lastVote.unwrap());

    vm.warp(
      Timestamp.unwrap(leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(1)))
    );

    _;
  }

  function test_GivenNewCanonicalInstance()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoVoteAlreadyCastInTheSlot
    whenCallerIsProposer
  {
    // it ignore votes from prior instance
    // it increase the yea count
    // it updates the leader to the proposal
    // it emits {VoteCast} event
    // it returns true

    Slot leonidasSlot = leonidas.getCurrentSlot();
    uint256 leonidasRound = gerousia.computeRound(leonidasSlot);
    uint256 yeaBefore = gerousia.yeaCount(address(leonidas), leonidasRound, proposal);

    Leonidas freshInstance = new Leonidas(address(this));
    registry.upgrade(address(freshInstance));

    vm.warp(Timestamp.unwrap(freshInstance.getTimestampForSlot(Slot.wrap(1))));

    Slot freshSlot = freshInstance.getCurrentSlot();
    uint256 freshRound = gerousia.computeRound(freshSlot);

    vm.prank(proposer);
    vm.expectEmit(true, true, true, true, address(gerousia));
    emit IGerousia.VoteCast(proposal, freshRound, proposer);
    assertTrue(gerousia.vote(proposal));

    // Check the new instance
    {
      (Slot lastVote, address leader, bool executed) =
        gerousia.rounds(address(freshInstance), freshRound);
      assertEq(
        gerousia.yeaCount(address(freshInstance), freshRound, leader), 1, "invalid number of votes"
      );
      assertFalse(executed);
      assertEq(leader, proposal);
      assertEq(freshSlot.unwrap(), lastVote.unwrap(), "invalid slot [FRESH]");
    }

    // The old instance
    {
      (Slot lastVote, address leader, bool executed) =
        gerousia.rounds(address(leonidas), leonidasRound);
      assertEq(
        gerousia.yeaCount(address(leonidas), leonidasRound, proposal),
        yeaBefore,
        "invalid number of votes"
      );
      assertFalse(executed);
      assertEq(leader, proposal);
      assertEq(leonidasSlot.unwrap(), lastVote.unwrap() + 1, "invalid slot [LEONIDAS]");
    }
  }

  function test_GivenRoundChanged()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoVoteAlreadyCastInTheSlot
    whenCallerIsProposer
  {
    // it ignore votes in prior round
    // it increase the yea count
    // it updates the leader to the proposal
    // it emits {VoteCast} event
    // it returns true
  }

  modifier givenRoundAndInstanceIsStable() {
    _;
  }

  function test_GivenProposalIsLeader()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoVoteAlreadyCastInTheSlot
    whenCallerIsProposer
    givenRoundAndInstanceIsStable
  {
    // it increase the yea count
    // it emits {VoteCast} event
    // it returns true

    Slot currentSlot = leonidas.getCurrentSlot();
    uint256 round = gerousia.computeRound(currentSlot);

    uint256 yeaBefore = gerousia.yeaCount(address(leonidas), round, proposal);

    vm.prank(proposer);
    vm.expectEmit(true, true, true, true, address(gerousia));
    emit IGerousia.VoteCast(proposal, round, proposer);
    assertTrue(gerousia.vote(proposal));

    (Slot lastVote, address leader, bool executed) = gerousia.rounds(address(leonidas), round);
    assertEq(
      gerousia.yeaCount(address(leonidas), round, leader), yeaBefore + 1, "invalid number of votes"
    );
    assertFalse(executed);
    assertEq(leader, proposal);
    assertEq(currentSlot.unwrap(), lastVote.unwrap());
  }

  function test_GivenProposalHaveFeverVotesThanLeader()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoVoteAlreadyCastInTheSlot
    whenCallerIsProposer
    givenRoundAndInstanceIsStable
  {
    // it increase the yea count
    // it emits {VoteCast} event
    // it returns true

    Slot currentSlot = leonidas.getCurrentSlot();
    uint256 round = gerousia.computeRound(currentSlot);

    uint256 leaderYeaBefore = gerousia.yeaCount(address(leonidas), round, proposal);

    vm.prank(proposer);
    vm.expectEmit(true, true, true, true, address(gerousia));
    emit IGerousia.VoteCast(address(leonidas), round, proposer);
    assertTrue(gerousia.vote(address(leonidas)));

    (Slot lastVote, address leader, bool executed) = gerousia.rounds(address(leonidas), round);
    assertEq(
      gerousia.yeaCount(address(leonidas), round, leader),
      leaderYeaBefore,
      "invalid number of votes"
    );
    assertEq(
      gerousia.yeaCount(address(leonidas), round, address(leonidas)), 1, "invalid number of votes"
    );
    assertFalse(executed);
    assertEq(leader, proposal);
    assertEq(currentSlot.unwrap(), lastVote.unwrap());
  }

  function test_GivenProposalHaveMoreVotesThanLeader()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoVoteAlreadyCastInTheSlot
    whenCallerIsProposer
    givenRoundAndInstanceIsStable
  {
    // it increase the yea count
    // it updates the leader to the proposal
    // it emits {VoteCast} event
    // it returns true

    Slot currentSlot = leonidas.getCurrentSlot();
    uint256 round = gerousia.computeRound(currentSlot);

    uint256 leaderYeaBefore = gerousia.yeaCount(address(leonidas), round, proposal);

    for (uint256 i = 0; i < leaderYeaBefore + 1; i++) {
      vm.prank(proposer);
      vm.expectEmit(true, true, true, true, address(gerousia));
      emit IGerousia.VoteCast(address(leonidas), round, proposer);
      assertTrue(gerousia.vote(address(leonidas)));

      vm.warp(
        Timestamp.unwrap(leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(1)))
      );
    }

    {
      (Slot lastVote, address leader, bool executed) = gerousia.rounds(address(leonidas), round);
      assertEq(
        gerousia.yeaCount(address(leonidas), round, address(leonidas)),
        leaderYeaBefore + 1,
        "invalid number of votes"
      );
      assertFalse(executed);
      assertEq(leader, address(leonidas));
      assertEq(
        gerousia.yeaCount(address(leonidas), round, proposal),
        leaderYeaBefore,
        "invalid number of votes"
      );
      assertEq(lastVote.unwrap(), currentSlot.unwrap() + leaderYeaBefore);
    }
  }
}
