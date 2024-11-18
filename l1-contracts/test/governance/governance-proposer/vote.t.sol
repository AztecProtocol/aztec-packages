// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IGovernanceProposer} from "@aztec/governance/interfaces/IGovernanceProposer.sol";
import {GovernanceProposerBase} from "./Base.t.sol";
import {Leonidas} from "../../harnesses/Leonidas.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Slot, SlotLib, Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract VoteTest is GovernanceProposerBase {
  using SlotLib for Slot;

  IPayload internal proposal = IPayload(address(0xdeadbeef));
  address internal proposer = address(0);
  Leonidas internal leonidas;

  function test_WhenProposalHoldNoCode() external {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__ProposalHaveNoCode.selector, proposal)
    );
    governanceProposer.vote(proposal);
  }

  modifier whenProposalHoldCode() {
    proposal = IPayload(address(this));
    _;
  }

  function test_GivenCanonicalRollupHoldNoCode() external whenProposalHoldCode {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.GovernanceProposer__InstanceHaveNoCode.selector, address(0xdead)
      )
    );
    governanceProposer.vote(proposal);
  }

  modifier givenCanonicalRollupHoldCode() {
    leonidas = new Leonidas(address(this));
    vm.prank(registry.getGovernance());
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
    governanceProposer.vote(proposal);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.GovernanceProposer__VoteAlreadyCastForSlot.selector, currentSlot
      )
    );
    governanceProposer.vote(proposal);
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
      abi.encodeWithSelector(
        Errors.GovernanceProposer__OnlyProposerCanVote.selector, _proposer, proposer
      )
    );
    governanceProposer.vote(proposal);
  }

  modifier whenCallerIsProposer() {
    // Lets make sure that there first is a leader
    uint256 votesOnProposal = 5;

    for (uint256 i = 0; i < votesOnProposal; i++) {
      vm.warp(
        Timestamp.unwrap(leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(1)))
      );
      vm.prank(proposer);
      governanceProposer.vote(proposal);
    }

    Slot currentSlot = leonidas.getCurrentSlot();
    uint256 round = governanceProposer.computeRound(currentSlot);
    (Slot lastVote, IPayload leader, bool executed) =
      governanceProposer.rounds(address(leonidas), round);
    assertEq(
      governanceProposer.yeaCount(address(leonidas), round, leader),
      votesOnProposal,
      "invalid number of votes"
    );
    assertFalse(executed);
    assertEq(address(leader), address(proposal));
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
    uint256 leonidasRound = governanceProposer.computeRound(leonidasSlot);
    uint256 yeaBefore = governanceProposer.yeaCount(address(leonidas), leonidasRound, proposal);

    Leonidas freshInstance = new Leonidas(address(this));
    vm.prank(registry.getGovernance());
    registry.upgrade(address(freshInstance));

    vm.warp(Timestamp.unwrap(freshInstance.getTimestampForSlot(Slot.wrap(1))));

    Slot freshSlot = freshInstance.getCurrentSlot();
    uint256 freshRound = governanceProposer.computeRound(freshSlot);

    vm.prank(proposer);
    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IGovernanceProposer.VoteCast(proposal, freshRound, proposer);
    assertTrue(governanceProposer.vote(proposal));

    // Check the new instance
    {
      (Slot lastVote, IPayload leader, bool executed) =
        governanceProposer.rounds(address(freshInstance), freshRound);
      assertEq(
        governanceProposer.yeaCount(address(freshInstance), freshRound, leader),
        1,
        "invalid number of votes"
      );
      assertFalse(executed);
      assertEq(address(leader), address(proposal));
      assertEq(freshSlot.unwrap(), lastVote.unwrap(), "invalid slot [FRESH]");
    }

    // The old instance
    {
      (Slot lastVote, IPayload leader, bool executed) =
        governanceProposer.rounds(address(leonidas), leonidasRound);
      assertEq(
        governanceProposer.yeaCount(address(leonidas), leonidasRound, proposal),
        yeaBefore,
        "invalid number of votes"
      );
      assertFalse(executed);
      assertEq(address(leader), address(proposal));
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
    uint256 round = governanceProposer.computeRound(currentSlot);

    uint256 yeaBefore = governanceProposer.yeaCount(address(leonidas), round, proposal);

    vm.prank(proposer);
    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IGovernanceProposer.VoteCast(proposal, round, proposer);
    assertTrue(governanceProposer.vote(proposal));

    (Slot lastVote, IPayload leader, bool executed) =
      governanceProposer.rounds(address(leonidas), round);
    assertEq(
      governanceProposer.yeaCount(address(leonidas), round, leader),
      yeaBefore + 1,
      "invalid number of votes"
    );
    assertFalse(executed);
    assertEq(address(leader), address(proposal));
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
    uint256 round = governanceProposer.computeRound(currentSlot);

    uint256 leaderYeaBefore = governanceProposer.yeaCount(address(leonidas), round, proposal);

    vm.prank(proposer);
    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IGovernanceProposer.VoteCast(IPayload(address(leonidas)), round, proposer);
    assertTrue(governanceProposer.vote(IPayload(address(leonidas))));

    (Slot lastVote, IPayload leader, bool executed) =
      governanceProposer.rounds(address(leonidas), round);
    assertEq(
      governanceProposer.yeaCount(address(leonidas), round, leader),
      leaderYeaBefore,
      "invalid number of votes"
    );
    assertEq(
      governanceProposer.yeaCount(address(leonidas), round, IPayload(address(leonidas))),
      1,
      "invalid number of votes"
    );
    assertFalse(executed);
    assertEq(address(leader), address(proposal));
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
    uint256 round = governanceProposer.computeRound(currentSlot);

    uint256 leaderYeaBefore = governanceProposer.yeaCount(address(leonidas), round, proposal);

    for (uint256 i = 0; i < leaderYeaBefore + 1; i++) {
      vm.prank(proposer);
      vm.expectEmit(true, true, true, true, address(governanceProposer));
      emit IGovernanceProposer.VoteCast(IPayload(address(leonidas)), round, proposer);
      assertTrue(governanceProposer.vote(IPayload(address(leonidas))));

      vm.warp(
        Timestamp.unwrap(leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(1)))
      );
    }

    {
      (Slot lastVote, IPayload leader, bool executed) =
        governanceProposer.rounds(address(leonidas), round);
      assertEq(
        governanceProposer.yeaCount(address(leonidas), round, IPayload(address(leonidas))),
        leaderYeaBefore + 1,
        "invalid number of votes"
      );
      assertFalse(executed);
      assertEq(address(leader), address(leonidas));
      assertEq(
        governanceProposer.yeaCount(address(leonidas), round, proposal),
        leaderYeaBefore,
        "invalid number of votes"
      );
      assertEq(lastVote.unwrap(), currentSlot.unwrap() + leaderYeaBefore);
    }
  }
}
