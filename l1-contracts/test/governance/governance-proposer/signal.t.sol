// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IEmpire} from "@aztec/governance/interfaces/IEmpire.sol";
import {GovernanceProposerBase} from "./Base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Fakerollup} from "./mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {RoundAccounting} from "@aztec/governance/proposer/EmpireBase.sol";

contract SignalTest is GovernanceProposerBase {
  IPayload internal proposal = IPayload(address(0xdeadbeef));
  address internal proposer = address(0x1234567890);
  Fakerollup internal validatorSelection;

  modifier whenProposalHoldCode() {
    proposal = IPayload(address(this));
    _;
  }

  function test_GivenCanonicalRollupHoldNoCode() external whenProposalHoldCode {
    // it revert

    // Somehow we added a new rollup, and then its code was deleted. Or the registry implementation differed
    address f = address(new Fakerollup());
    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(f));
    vm.etch(f, "");

    vm.expectRevert(abi.encodeWithSelector(Errors.EmpireBase__InstanceHaveNoCode.selector, address(f)));
    governanceProposer.signal(proposal);
  }

  modifier givenCanonicalRollupHoldCode() {
    validatorSelection = new Fakerollup();
    validatorSelection.setProposer(proposer);

    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(validatorSelection)));

    // We jump into the future since slot 0, will behave as if already signald in
    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(Slot.wrap(1))));
    _;
  }

  function test_GivenASignalAlreadyCastInTheSlot() external whenProposalHoldCode givenCanonicalRollupHoldCode {
    // it revert

    Slot currentSlot = validatorSelection.getCurrentSlot();
    assertEq(Slot.unwrap(currentSlot), 1);
    vm.prank(proposer);
    governanceProposer.signal(proposal);

    vm.expectRevert(abi.encodeWithSelector(Errors.EmpireBase__SignalAlreadyCastForSlot.selector, currentSlot));
    governanceProposer.signal(proposal);
  }

  function test_GivenSignalIsForPriorRound() external whenProposalHoldCode givenCanonicalRollupHoldCode 
  // solhint-disable-next-line no-empty-blocks
  {
    // it revert

    // This case is not possible unless you are voting with a signature.
    // See `signalWithSig.t.sol` for the test case.
  }

  modifier givenNoSignalAlreadyCastInTheSlot() {
    _;
  }

  function test_WhenCallerIsNotProposer(address _proposer)
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoSignalAlreadyCastInTheSlot
  {
    // it revert
    vm.assume(_proposer != proposer);
    vm.prank(_proposer);
    vm.expectRevert(abi.encodeWithSelector(Errors.EmpireBase__OnlyProposerCanSignal.selector, _proposer, proposer));
    governanceProposer.signal(proposal);
  }

  modifier whenCallerIsProposer() {
    // Lets make sure that there first is a leader
    uint256 signalsOnProposal = 5;

    for (uint256 i = 0; i < signalsOnProposal; i++) {
      vm.warp(
        Timestamp.unwrap(validatorSelection.getTimestampForSlot(validatorSelection.getCurrentSlot() + Slot.wrap(1)))
      );
      vm.prank(proposer);
      governanceProposer.signal(proposal);
    }

    Slot currentSlot = validatorSelection.getCurrentSlot();
    uint256 round = governanceProposer.computeRound(currentSlot);
    RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), round);
    assertEq(
      governanceProposer.signalCount(address(validatorSelection), round, r.payloadWithMostSignals),
      signalsOnProposal,
      "invalid number of signals"
    );
    assertFalse(r.executed);
    assertEq(address(r.payloadWithMostSignals), address(proposal));
    assertEq(Slot.unwrap(currentSlot), Slot.unwrap(r.lastSignalSlot));

    vm.warp(
      Timestamp.unwrap(validatorSelection.getTimestampForSlot(validatorSelection.getCurrentSlot() + Slot.wrap(1)))
    );

    _;
  }

  function test_GivenNewCanonicalInstance()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoSignalAlreadyCastInTheSlot
    whenCallerIsProposer
  {
    // it ignore signals from prior instance
    // it increase the yea count
    // it updates the leader to the proposal
    // it emits {SignalCast} event
    // it returns true

    Slot validatorSelectionSlot = validatorSelection.getCurrentSlot();
    uint256 validatorSelectionRound = governanceProposer.computeRound(validatorSelectionSlot);
    uint256 yeaBefore = governanceProposer.signalCount(address(validatorSelection), validatorSelectionRound, proposal);

    Fakerollup freshInstance = new Fakerollup();
    freshInstance.setProposer(proposer);
    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(freshInstance)));

    vm.warp(Timestamp.unwrap(freshInstance.getTimestampForSlot(Slot.wrap(1))));

    Slot freshSlot = freshInstance.getCurrentSlot();
    uint256 freshRound = governanceProposer.computeRound(freshSlot);

    vm.prank(proposer);
    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.SignalCast(proposal, freshRound, proposer);
    assertTrue(governanceProposer.signal(proposal));

    // Check the new instance
    {
      RoundAccounting memory r = governanceProposer.getRoundData(address(freshInstance), freshRound);
      assertEq(
        governanceProposer.signalCount(address(freshInstance), freshRound, r.payloadWithMostSignals),
        1,
        "invalid number of signals"
      );
      assertFalse(r.executed);
      assertEq(address(r.payloadWithMostSignals), address(proposal));
      assertEq(Slot.unwrap(freshSlot), Slot.unwrap(r.lastSignalSlot), "invalid slot [FRESH]");
    }

    // The old instance
    {
      RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), validatorSelectionRound);
      assertEq(
        governanceProposer.signalCount(address(validatorSelection), validatorSelectionRound, proposal),
        yeaBefore,
        "invalid number of signals"
      );
      assertFalse(r.executed);
      assertEq(address(r.payloadWithMostSignals), address(proposal));
      assertEq(
        Slot.unwrap(validatorSelectionSlot), Slot.unwrap(r.lastSignalSlot) + 1, "invalid slot [ValidatorSelection]"
      );
    }
  }

  function test_GivenRoundChanged()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoSignalAlreadyCastInTheSlot
    whenCallerIsProposer
  {
    // it ignore signals in prior round
    // it increase the yea count
    // it updates the leader to the proposal
    // it emits {SignalCast} event
    // it returns true
  }

  modifier givenRoundAndInstanceIsStable() {
    _;
  }

  function test_GivenProposalIsLeader()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoSignalAlreadyCastInTheSlot
    whenCallerIsProposer
    givenRoundAndInstanceIsStable
  {
    // it increase the yea count
    // it emits {SignalCast} event
    // it returns true

    Slot currentSlot = validatorSelection.getCurrentSlot();
    uint256 round = governanceProposer.computeRound(currentSlot);

    uint256 yeaBefore = governanceProposer.signalCount(address(validatorSelection), round, proposal);

    vm.prank(proposer);
    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.SignalCast(proposal, round, proposer);
    assertTrue(governanceProposer.signal(proposal));

    RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), round);
    assertEq(
      governanceProposer.signalCount(address(validatorSelection), round, r.payloadWithMostSignals),
      yeaBefore + 1,
      "invalid number of signals"
    );
    assertFalse(r.executed);
    assertEq(address(r.payloadWithMostSignals), address(proposal));
    assertEq(Slot.unwrap(currentSlot), Slot.unwrap(r.lastSignalSlot));
  }

  function test_GivenProposalHaveFeverSignalsThanLeader()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoSignalAlreadyCastInTheSlot
    whenCallerIsProposer
    givenRoundAndInstanceIsStable
  {
    // it increase the yea count
    // it emits {SignalCast} event
    // it returns true

    Slot currentSlot = validatorSelection.getCurrentSlot();
    uint256 round = governanceProposer.computeRound(currentSlot);

    uint256 leaderYeaBefore = governanceProposer.signalCount(address(validatorSelection), round, proposal);

    vm.prank(proposer);
    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.SignalCast(IPayload(address(validatorSelection)), round, proposer);
    assertTrue(governanceProposer.signal(IPayload(address(validatorSelection))));

    RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), round);
    assertEq(
      governanceProposer.signalCount(address(validatorSelection), round, r.payloadWithMostSignals),
      leaderYeaBefore,
      "invalid number of signals"
    );
    assertEq(
      governanceProposer.signalCount(address(validatorSelection), round, IPayload(address(validatorSelection))),
      1,
      "invalid number of signals"
    );
    assertFalse(r.executed);
    assertEq(address(r.payloadWithMostSignals), address(proposal));
    assertEq(Slot.unwrap(currentSlot), Slot.unwrap(r.lastSignalSlot));
  }

  function test_GivenProposalHaveMoreSignalsThanLeader()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoSignalAlreadyCastInTheSlot
    whenCallerIsProposer
    givenRoundAndInstanceIsStable
  {
    // it increase the yea count
    // it updates the leader to the proposal
    // it emits {SignalCast} event
    // it returns true

    Slot currentSlot = validatorSelection.getCurrentSlot();
    uint256 round = governanceProposer.computeRound(currentSlot);

    uint256 leaderYeaBefore = governanceProposer.signalCount(address(validatorSelection), round, proposal);

    for (uint256 i = 0; i < leaderYeaBefore + 1; i++) {
      vm.prank(proposer);
      vm.expectEmit(true, true, true, true, address(governanceProposer));
      emit IEmpire.SignalCast(IPayload(address(validatorSelection)), round, proposer);
      assertTrue(governanceProposer.signal(IPayload(address(validatorSelection))));

      vm.warp(
        Timestamp.unwrap(validatorSelection.getTimestampForSlot(validatorSelection.getCurrentSlot() + Slot.wrap(1)))
      );
    }

    {
      RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), round);
      assertEq(
        governanceProposer.signalCount(address(validatorSelection), round, IPayload(address(validatorSelection))),
        leaderYeaBefore + 1,
        "invalid number of signals"
      );
      assertFalse(r.executed);
      assertEq(address(r.payloadWithMostSignals), address(validatorSelection));
      assertEq(
        governanceProposer.signalCount(address(validatorSelection), round, proposal),
        leaderYeaBefore,
        "invalid number of signals"
      );
      assertEq(Slot.unwrap(r.lastSignalSlot), Slot.unwrap(currentSlot) + leaderYeaBefore);
    }
  }
}
