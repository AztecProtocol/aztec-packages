// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IGerousia} from "@aztec/governance/interfaces/IGerousia.sol";
import {GerousiaBase} from "./Base.t.sol";
import {Leonidas} from "@aztec/core/Leonidas.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Slot, SlotLib, Timestamp} from "@aztec/core/libraries/TimeMath.sol";

import {FaultyApella} from "./mocks/FaultyApella.sol";
import {FalsyApella} from "./mocks/FalsyApella.sol";

contract PushProposalTest is GerousiaBase {
  using SlotLib for Slot;

  Leonidas internal leonidas;

  IPayload internal proposal = IPayload(address(this));
  address internal proposer = address(0);

  function test_GivenCanonicalInstanceHoldNoCode(uint256 _roundNumber) external {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Gerousia__InstanceHaveNoCode.selector, address(0xdead))
    );
    gerousia.pushProposal(_roundNumber);
  }

  modifier givenCanonicalInstanceHoldCode() {
    leonidas = new Leonidas(address(this));
    vm.prank(registry.getApella());
    registry.upgrade(address(leonidas));

    // We jump into the future since slot 0, will behave as if already voted in
    vm.warp(Timestamp.unwrap(leonidas.getTimestampForSlot(Slot.wrap(1))));
    _;
  }

  function test_WhenRoundNotInPast() external givenCanonicalInstanceHoldCode {
    // it revert
    vm.expectRevert(abi.encodeWithSelector(Errors.Gerousia__CanOnlyPushProposalInPast.selector));
    gerousia.pushProposal(0);
  }

  modifier whenRoundInPast() {
    vm.warp(Timestamp.unwrap(leonidas.getTimestampForSlot(Slot.wrap(gerousia.M()))));
    _;
  }

  function test_WhenRoundTooFarInPast(uint256 _slotsToJump)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
  {
    // it revert

    uint256 lower = Timestamp.unwrap(
      leonidas.getTimestampForSlot(
        leonidas.getCurrentSlot() + Slot.wrap(gerousia.M() * gerousia.LIFETIME_IN_ROUNDS() + 1)
      )
    );
    uint256 upper =
      (type(uint256).max - Timestamp.unwrap(leonidas.GENESIS_TIME())) / leonidas.SLOT_DURATION();
    uint256 time = bound(_slotsToJump, lower, upper);

    vm.warp(time);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Gerousia__ProposalTooOld.selector,
        0,
        gerousia.computeRound(leonidas.getCurrentSlot())
      )
    );
    gerousia.pushProposal(0);
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
      for (uint256 i = 0; i < gerousia.N(); i++) {
        vm.prank(proposer);
        assertTrue(gerousia.vote(proposal));
        vm.warp(
          Timestamp.unwrap(leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(1)))
        );
      }
      vm.warp(
        Timestamp.unwrap(
          leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(gerousia.M()))
        )
      );
      gerousia.pushProposal(1);
    }

    vm.expectRevert(abi.encodeWithSelector(Errors.Gerousia__ProposalAlreadyExecuted.selector, 1));
    gerousia.pushProposal(1);
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
    Slot lowerSlot = Slot.wrap(gerousia.M());
    uint256 lower = Timestamp.unwrap(leonidas.getTimestampForSlot(lowerSlot));
    // the last slot in the LIFETIME_IN_ROUNDS next round
    uint256 upper = Timestamp.unwrap(
      leonidas.getTimestampForSlot(
        lowerSlot + Slot.wrap(gerousia.M() * (gerousia.LIFETIME_IN_ROUNDS() - 1))
      )
    );
    uint256 time = bound(_slotsToJump, lower, upper);

    vm.warp(time);

    vm.expectRevert(abi.encodeWithSelector(Errors.Gerousia__ProposalCannotBeAddressZero.selector));
    gerousia.pushProposal(0);
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
    gerousia.vote(proposal);

    vm.warp(
      Timestamp.unwrap(
        leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(gerousia.M()))
      )
    );
    vm.expectRevert(abi.encodeWithSelector(Errors.Gerousia__InsufficientVotes.selector));
    gerousia.pushProposal(1);
  }

  modifier givenSufficientYea(uint256 _yeas) {
    uint256 limit = bound(_yeas, gerousia.N(), gerousia.M());

    for (uint256 i = 0; i < limit; i++) {
      vm.prank(proposer);
      assertTrue(gerousia.vote(proposal));
      vm.warp(
        Timestamp.unwrap(leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(1)))
      );
    }
    vm.warp(
      Timestamp.unwrap(
        leonidas.getTimestampForSlot(leonidas.getCurrentSlot() + Slot.wrap(gerousia.M()))
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

    // When using a new registry we change the gerousia's interpetation of time :O
    Leonidas freshInstance = new Leonidas(address(this));
    vm.prank(registry.getApella());
    registry.upgrade(address(freshInstance));

    // The old is still there, just not executable.
    (, IPayload leader, bool executed) = gerousia.rounds(address(leonidas), 1);
    assertFalse(executed);
    assertEq(address(leader), address(proposal));

    // As time is perceived differently, round 1 is currently in the future
    vm.expectRevert(abi.encodeWithSelector(Errors.Gerousia__CanOnlyPushProposalInPast.selector));
    gerousia.pushProposal(1);

    // Jump 2 rounds, since we are currently in round 0
    vm.warp(
      Timestamp.unwrap(
        freshInstance.getTimestampForSlot(
          freshInstance.getCurrentSlot() + Slot.wrap(2 * gerousia.M())
        )
      )
    );
    vm.expectRevert(abi.encodeWithSelector(Errors.Gerousia__ProposalCannotBeAddressZero.selector));
    gerousia.pushProposal(1);
  }

  function test_GivenApellaCallReturnFalse(uint256 _yeas)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
    whenRoundInRecentPast
    givenRoundNotExecutedBefore
    givenLeaderIsNotAddress0
    givenSufficientYea(_yeas)
  {
    // it revert
    FalsyApella falsy = new FalsyApella();
    vm.etch(address(apella), address(falsy).code);

    vm.expectRevert(abi.encodeWithSelector(Errors.Gerousia__FailedToPropose.selector, proposal));
    gerousia.pushProposal(1);
  }

  function test_GivenApellaCallFails(uint256 _yeas)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
    whenRoundInRecentPast
    givenRoundNotExecutedBefore
    givenLeaderIsNotAddress0
    givenSufficientYea(_yeas)
  {
    // it revert
    FaultyApella faulty = new FaultyApella();
    vm.etch(address(apella), address(faulty).code);

    vm.expectRevert(abi.encodeWithSelector(FaultyApella.Faulty.selector));
    gerousia.pushProposal(1);
  }

  function test_GivenApellaCallSucceeds(uint256 _yeas)
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
    vm.expectEmit(true, true, true, true, address(gerousia));
    emit IGerousia.ProposalPushed(proposal, 1);
    assertTrue(gerousia.pushProposal(1));
    (, IPayload leader, bool executed) = gerousia.rounds(address(leonidas), 1);
    assertTrue(executed);
    assertEq(address(leader), address(proposal));
  }
}
