// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IEmpire} from "@aztec/governance/interfaces/IEmpire.sol";
import {GovernanceProposerBase} from "./Base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Fakerollup} from "./mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Signature, SignatureLib__InvalidSignature} from "@aztec/shared/libraries/SignatureLib.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {RoundAccounting} from "@aztec/governance/proposer/EmpireBase.sol";

contract SignalWithSigTest is GovernanceProposerBase {
  using MessageHashUtils for bytes32;

  IPayload internal proposal = IPayload(address(0xdeadbeef));
  address internal proposer = address(0);
  Fakerollup internal validatorSelection;

  uint256 internal privateKey = 0x1234567890;
  Signature internal signature;

  function setUp() public override {
    super.setUp();
    validatorSelection = new Fakerollup();
  }

  modifier whenProposalHoldCode() {
    proposal = IPayload(address(this));
    signature = createSignature(privateKey, proposal);

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
    governanceProposer.signalWithSig(proposal, signature);
  }

  modifier givenCanonicalRollupHoldCode() {
    proposer = vm.addr(privateKey);
    validatorSelection.setProposer(proposer);

    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(validatorSelection)));

    // We jump into the future since slot 0, will behave as if already signald in
    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(Slot.wrap(1))));

    // Also we need to generate a signature because it is using the address of the instance as part of it.
    signature = createSignature(privateKey, proposal);
    _;
  }

  function test_GivenASignalAlreadyCastInTheSlot() external whenProposalHoldCode givenCanonicalRollupHoldCode {
    // it revert

    Slot currentSlot = validatorSelection.getCurrentSlot();
    assertEq(Slot.unwrap(currentSlot), 1);
    governanceProposer.signalWithSig(proposal, signature);

    vm.expectRevert(abi.encodeWithSelector(Errors.EmpireBase__SignalAlreadyCastForSlot.selector, currentSlot));
    governanceProposer.signalWithSig(proposal, signature);
  }

  function test_GivenSignalIsForPriorRound(uint256 _slotsToFastForward)
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
  {
    // it revert
    uint256 roundSize = governanceProposer.ROUND_SIZE();

    uint256 minSlotsToFastForward = roundSize - (Slot.unwrap(validatorSelection.getCurrentSlot()) % roundSize);

    _slotsToFastForward = bound(_slotsToFastForward, minSlotsToFastForward, roundSize * 1e6);

    // fast forward a round
    vm.warp(block.timestamp + _slotsToFastForward * validatorSelection.getSlotDuration());

    bytes32 digest = getDigest(proposal, validatorSelection.getCurrentSlot());

    // signal
    address expectedInvalidSigner = ecrecover(digest, signature.v, signature.r, signature.s);

    vm.expectRevert(abi.encodeWithSelector(SignatureLib__InvalidSignature.selector, proposer, expectedInvalidSigner));
    governanceProposer.signalWithSig(proposal, signature);
  }

  modifier givenNoSignalAlreadyCastInTheSlot() {
    _;
  }

  function test_WhenSigNotFromProposer(uint256 _privateKey)
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoSignalAlreadyCastInTheSlot
  {
    // it revert

    uint256 pk = bound(_privateKey, 1, type(uint128).max);

    address _proposer = vm.addr(pk);
    vm.assume(_proposer != proposer);
    signature = createSignature(pk, proposal);

    vm.expectRevert(abi.encodeWithSelector(SignatureLib__InvalidSignature.selector, proposer, _proposer));
    governanceProposer.signalWithSig(proposal, signature);
  }

  modifier whenCallerIsProposer() {
    // Lets make sure that there first is a leader
    uint256 signalsOnProposal = 5;

    for (uint256 i = 0; i < signalsOnProposal; i++) {
      vm.warp(
        Timestamp.unwrap(validatorSelection.getTimestampForSlot(validatorSelection.getCurrentSlot() + Slot.wrap(1)))
      );
      signature = createSignature(privateKey, proposal);
      governanceProposer.signalWithSig(proposal, signature);
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

    signature = createSignature(privateKey, proposal, freshSlot);

    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.SignalCast(proposal, freshRound, proposer);
    assertTrue(governanceProposer.signalWithSig(proposal, signature));

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

    signature = createSignature(privateKey, proposal);

    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.SignalCast(proposal, round, proposer);
    assertTrue(governanceProposer.signalWithSig(proposal, signature));

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

    signature = createSignature(privateKey, IPayload(address(validatorSelection)));

    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.SignalCast(IPayload(address(validatorSelection)), round, proposer);
    assertTrue(governanceProposer.signalWithSig(IPayload(address(validatorSelection)), signature));

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
      signature = createSignature(privateKey, IPayload(address(validatorSelection)));

      vm.expectEmit(true, true, true, true, address(governanceProposer));
      emit IEmpire.SignalCast(IPayload(address(validatorSelection)), round, proposer);
      assertTrue(governanceProposer.signalWithSig(IPayload(address(validatorSelection)), signature));

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

  function getDigest(IPayload _payload, Slot _slot) internal view returns (bytes32) {
    return governanceProposer.getSignalSignatureDigest(_payload, _slot);
  }

  function createSignature(uint256 _privateKey, IPayload _payload) internal view returns (Signature memory) {
    return createSignature(_privateKey, _payload, validatorSelection.getCurrentSlot());
  }

  function createSignature(uint256 _privateKey, IPayload _payload, Slot _slot) internal view returns (Signature memory) {
    bytes32 digest = getDigest(_payload, _slot);

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, digest);

    return Signature({v: v, r: r, s: s});
  }
}
