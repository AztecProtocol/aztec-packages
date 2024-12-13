// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IGovernanceProposer} from "@aztec/governance/interfaces/IGovernanceProposer.sol";
import {GovernanceProposerBase} from "./Base.t.sol";
import {Leonidas} from "../../harnesses/Leonidas.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Slot, SlotLib, Timestamp} from "@aztec/core/libraries/TimeMath.sol";

import {FaultyGovernance} from "./mocks/FaultyGovernance.sol";
import {FalsyGovernance} from "./mocks/FalsyGovernance.sol";

contract PushProposalTest is GovernanceProposerBase {
  using SlotLib for Slot;

  Leonidas internal leonidas;

  IPayload internal proposal = IPayload(address(this));
  address internal proposer = address(0);

  function test_GivenCanonicalInstanceHoldNoCode(uint256 _roundNumber) external {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.GovernanceProposer__InstanceHaveNoCode.selector, address(0xdead)
      )
    );
    governanceProposer.pushProposal(_roundNumber);
  }

  modifier givenCanonicalInstanceHoldCode() {
    leonidas = new Leonidas();
    vm.prank(registry.getGovernance());
    registry.upgrade(address(leonidas));

    // We jump into the future since slot 0, will behave as if already voted in
    vm.warp(Timestamp.unwrap(leonidas.getTimestampForSlot(Slot.wrap(1))));
    _;
  }

  function test_WhenRoundNotInPast() external givenCanonicalInstanceHoldCode {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__CanOnlyPushProposalInPast.selector)
    );
    governanceProposer.pushProposal(0);
  }

  modifier whenRoundInPast() {
    vm.warp(Timestamp.unwrap(leonidas.getTimestampForSlot(Slot.wrap(governanceProposer.M()))));
    _;
  }

  function test_WhenRoundTooFarInPast(uint256 _slotToHit)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
  {
    // it revert

    Slot lower = leonidas.getCurrentSlot()
      + Slot.wrap(governanceProposer.M() * governanceProposer.LIFETIME_IN_ROUNDS() + 1);
    Slot upper = Slot.wrap(
      (type(uint256).max - Timestamp.unwrap(leonidas.GENESIS_TIME())) / leonidas.SLOT_DURATION()
    );
    Slot slotToHit = Slot.wrap(bound(_slotToHit, lower.unwrap(), upper.unwrap()));
    vm.warp(Timestamp.unwrap(leonidas.getTimestampForSlot(slotToHit)));

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.GovernanceProposer__ProposalTooOld.selector,
        0,
        governanceProposer.computeRound(leonidas.getCurrentSlot())
      )
    );
    governanceProposer.pushProposal(0);
  }

  modifier whenRoundInRecentPast() {
    _;
  }

  function test_GivenRoundAlreadyExecuted()
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
    whenRoundInRecentPast
  {
    // it revert

    {
      // Need to execute a proposal first here.
      for (uint256 i = 0; i < governanceProposer.N(); i++) {
        vm.prank(proposer);
        assertTrue(governanceProposer.vote(proposal));
        vm.warp(
          Timestamp.unwrap(leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(1)))
        );
      }
      vm.warp(
        Timestamp.unwrap(
          leonidas.getTimestampForSlot(
            leonidas.getCurrentSlot() + Slot.wrap(governanceProposer.M())
          )
        )
      );
      governanceProposer.pushProposal(1);
    }

    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__ProposalAlreadyExecuted.selector, 1)
    );
    governanceProposer.pushProposal(1);
  }

  modifier givenRoundNotExecutedBefore() {
    _;
  }

  function test_GivenLeaderIsAddress0(uint256 _slotsToJump)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
    whenRoundInRecentPast
    givenRoundNotExecutedBefore
  {
    // it revert

    // The first slot in the next round (round 1)
    Slot lowerSlot = Slot.wrap(governanceProposer.M());
    uint256 lower = Timestamp.unwrap(leonidas.getTimestampForSlot(lowerSlot));
    // the last slot in the LIFETIME_IN_ROUNDS next round
    uint256 upper = Timestamp.unwrap(
      leonidas.getTimestampForSlot(
        lowerSlot
          + Slot.wrap(governanceProposer.M() * (governanceProposer.LIFETIME_IN_ROUNDS() - 1))
      )
    );
    uint256 time = bound(_slotsToJump, lower, upper);

    vm.warp(time);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__ProposalCannotBeAddressZero.selector)
    );
    governanceProposer.pushProposal(0);
  }

  modifier givenLeaderIsNotAddress0() {
    _;
  }

  function test_GivenInsufficientYea()
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
    whenRoundInRecentPast
    givenRoundNotExecutedBefore
    givenLeaderIsNotAddress0
  {
    // it revert

    vm.prank(proposer);
    governanceProposer.vote(proposal);

    uint256 votesNeeded = governanceProposer.N();

    vm.warp(
      Timestamp.unwrap(
        leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(governanceProposer.M()))
      )
    );
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__InsufficientVotes.selector, 1, votesNeeded)
    );
    governanceProposer.pushProposal(1);
  }

  modifier givenSufficientYea(uint256 _yeas) {
    uint256 limit = bound(_yeas, governanceProposer.N(), governanceProposer.M());

    for (uint256 i = 0; i < limit; i++) {
      vm.prank(proposer);
      assertTrue(governanceProposer.vote(proposal));
      vm.warp(
        Timestamp.unwrap(leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(1)))
      );
    }
    vm.warp(
      Timestamp.unwrap(
        leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(governanceProposer.M()))
      )
    );

    _;
  }

  function test_GivenNewCanonicalInstance(uint256 _yeas)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
    whenRoundInRecentPast
    givenRoundNotExecutedBefore
    givenLeaderIsNotAddress0
    givenSufficientYea(_yeas)
  {
    // it revert

    // When using a new registry we change the governanceProposer's interpetation of time :O
    Leonidas freshInstance = new Leonidas();
    vm.prank(registry.getGovernance());
    registry.upgrade(address(freshInstance));

    // The old is still there, just not executable.
    (, IPayload leader, bool executed) = governanceProposer.rounds(address(leonidas), 1);
    assertFalse(executed);
    assertEq(address(leader), address(proposal));

    // As time is perceived differently, round 1 is currently in the future
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__CanOnlyPushProposalInPast.selector)
    );
    governanceProposer.pushProposal(1);

    // Jump 2 rounds, since we are currently in round 0
    vm.warp(
      Timestamp.unwrap(
        freshInstance.getTimestampForSlot(
          freshInstance.getCurrentSlot() + Slot.wrap(2 * governanceProposer.M())
        )
      )
    );
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__ProposalCannotBeAddressZero.selector)
    );
    governanceProposer.pushProposal(1);
  }

  function test_GivenGovernanceCallReturnFalse(uint256 _yeas)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
    whenRoundInRecentPast
    givenRoundNotExecutedBefore
    givenLeaderIsNotAddress0
    givenSufficientYea(_yeas)
  {
    // it revert
    FalsyGovernance falsy = new FalsyGovernance();
    vm.etch(address(governance), address(falsy).code);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__FailedToPropose.selector, proposal)
    );
    governanceProposer.pushProposal(1);
  }

  function test_GivenGovernanceCallFails(uint256 _yeas)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
    whenRoundInRecentPast
    givenRoundNotExecutedBefore
    givenLeaderIsNotAddress0
    givenSufficientYea(_yeas)
  {
    // it revert
    FaultyGovernance faulty = new FaultyGovernance();
    vm.etch(address(governance), address(faulty).code);

    vm.expectRevert(abi.encodeWithSelector(FaultyGovernance.Faulty.selector));
    governanceProposer.pushProposal(1);
  }

  function test_GivenGovernanceCallSucceeds(uint256 _yeas)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
    whenRoundInRecentPast
    givenRoundNotExecutedBefore
    givenLeaderIsNotAddress0
    givenSufficientYea(_yeas)
  {
    // it update executed to true
    // it emits {ProposalPushed} event
    // it return true
    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IGovernanceProposer.ProposalPushed(proposal, 1);
    assertTrue(governanceProposer.pushProposal(1));
    (, IPayload leader, bool executed) = governanceProposer.rounds(address(leonidas), 1);
    assertTrue(executed);
    assertEq(address(leader), address(proposal));
  }
}
