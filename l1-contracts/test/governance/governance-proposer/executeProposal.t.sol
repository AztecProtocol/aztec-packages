// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IEmpire} from "@aztec/governance/interfaces/IEmpire.sol";
import {GovernanceProposerBase} from "./Base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";

import {FaultyGovernance} from "./mocks/FaultyGovernance.sol";
import {Fakerollup} from "./mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {RoundAccounting} from "@aztec/governance/proposer/EmpireBase.sol";

contract ExecuteProposalTest is GovernanceProposerBase {
  Fakerollup internal validatorSelection;

  IPayload internal proposal = IPayload(address(this));
  address internal proposer = address(0);

  function test_GivenCanonicalInstanceHoldNoCode(uint256 _roundNumber) external {
    // it revert

    // Somehow we added a new rollup, and then its code was deleted. Or the registry implementation differed
    address f = address(new Fakerollup());
    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(f));
    vm.etch(f, "");

    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__InstanceHaveNoCode.selector, address(f))
    );
    governanceProposer.executeProposal(_roundNumber);
  }

  modifier givenCanonicalInstanceHoldCode() {
    validatorSelection = new Fakerollup();
    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(validatorSelection)));

    // We jump into the future since slot 0, will behave as if already voted in
    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(Slot.wrap(1))));
    _;
  }

  function test_WhenRoundNotInPast() external givenCanonicalInstanceHoldCode {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__CanOnlyExecuteProposalInPast.selector)
    );
    governanceProposer.executeProposal(0);
  }

  modifier whenRoundInPast() {
    vm.warp(
      Timestamp.unwrap(
        validatorSelection.getTimestampForSlot(Slot.wrap(governanceProposer.ROUND_SIZE()))
      )
    );
    _;
  }

  function test_WhenRoundTooFarInPast(uint256 _slotToHit)
    external
    givenCanonicalInstanceHoldCode
    whenRoundInPast
  {
    // it revert

    Slot lower = validatorSelection.getCurrentSlot()
      + Slot.wrap(governanceProposer.ROUND_SIZE() * governanceProposer.LIFETIME_IN_ROUNDS() + 1);
    Slot upper = Slot.wrap(
      (type(uint64).max - Timestamp.unwrap(validatorSelection.getGenesisTime()))
        / validatorSelection.getSlotDuration()
    );
    Slot slotToHit = Slot.wrap(bound(_slotToHit, Slot.unwrap(lower), Slot.unwrap(upper)));
    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(slotToHit)));

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.GovernanceProposer__ProposalTooOld.selector,
        0,
        governanceProposer.computeRound(validatorSelection.getCurrentSlot())
      )
    );
    governanceProposer.executeProposal(0);
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
      for (uint256 i = 0; i < governanceProposer.QUORUM_SIZE(); i++) {
        vm.prank(proposer);
        assertTrue(governanceProposer.vote(proposal));
        vm.warp(
          Timestamp.unwrap(
            validatorSelection.getTimestampForSlot(
              validatorSelection.getCurrentSlot() + Slot.wrap(1)
            )
          )
        );
      }
      vm.warp(
        Timestamp.unwrap(
          validatorSelection.getTimestampForSlot(
            validatorSelection.getCurrentSlot() + Slot.wrap(governanceProposer.ROUND_SIZE())
          )
        )
      );
      governanceProposer.executeProposal(1);
    }

    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__ProposalAlreadyExecuted.selector, 1)
    );
    governanceProposer.executeProposal(1);
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
    Slot lowerSlot = Slot.wrap(governanceProposer.ROUND_SIZE());
    uint256 lower = Timestamp.unwrap(validatorSelection.getTimestampForSlot(lowerSlot));
    // the last slot in the LIFETIME_IN_ROUNDS next round
    uint256 upper = Timestamp.unwrap(
      validatorSelection.getTimestampForSlot(
        lowerSlot
          + Slot.wrap(governanceProposer.ROUND_SIZE() * (governanceProposer.LIFETIME_IN_ROUNDS() - 1))
      )
    );
    uint256 time = bound(_slotsToJump, lower, upper);

    vm.warp(time);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__ProposalCannotBeAddressZero.selector)
    );
    governanceProposer.executeProposal(0);
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

    uint256 votesNeeded = governanceProposer.QUORUM_SIZE();

    vm.warp(
      Timestamp.unwrap(
        validatorSelection.getTimestampForSlot(
          validatorSelection.getCurrentSlot() + Slot.wrap(governanceProposer.ROUND_SIZE())
        )
      )
    );
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__InsufficientVotes.selector, 1, votesNeeded)
    );
    governanceProposer.executeProposal(1);
  }

  modifier givenSufficientYea(uint256 _yeas) {
    uint256 limit = bound(_yeas, governanceProposer.QUORUM_SIZE(), governanceProposer.ROUND_SIZE());

    for (uint256 i = 0; i < limit; i++) {
      vm.prank(proposer);
      assertTrue(governanceProposer.vote(proposal));
      vm.warp(
        Timestamp.unwrap(
          validatorSelection.getTimestampForSlot(validatorSelection.getCurrentSlot() + Slot.wrap(1))
        )
      );
    }
    vm.warp(
      Timestamp.unwrap(
        validatorSelection.getTimestampForSlot(
          validatorSelection.getCurrentSlot() + Slot.wrap(governanceProposer.ROUND_SIZE())
        )
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
    Fakerollup freshInstance = new Fakerollup();
    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(freshInstance)));

    // The old is still there, just not executable.
    RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), 1);
    assertFalse(r.executed);
    assertEq(address(r.leader), address(proposal));

    // As time is perceived differently, round 1 is currently in the future
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__CanOnlyExecuteProposalInPast.selector)
    );
    governanceProposer.executeProposal(1);

    // Jump 2 rounds, since we are currently in round 0
    vm.warp(
      Timestamp.unwrap(
        validatorSelection.getTimestampForSlot(
          validatorSelection.getCurrentSlot() + Slot.wrap(2 * governanceProposer.ROUND_SIZE())
        )
      )
    );
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__ProposalCannotBeAddressZero.selector)
    );
    governanceProposer.executeProposal(1);
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
    governanceProposer.executeProposal(1);
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
    // it emits {ProposalExecuted} event
    // it return true
    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.ProposalExecuted(proposal, 1);
    assertTrue(governanceProposer.executeProposal(1));
    RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), 1);
    assertTrue(r.executed);
    assertEq(address(r.leader), address(proposal));
    assertEq(governanceProposer.getProposalProposer(0), address(validatorSelection));
  }
}
