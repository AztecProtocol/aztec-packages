// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceProposerBase} from "../Base.t.sol";

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Fakerollup} from "../mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";

// https://linear.app/aztec-labs/issue/TMNT-144/spearbit-gov-finding-3-missing-instance-in-digest
contract TestTmnt144 is GovernanceProposerBase {
  using MessageHashUtils for bytes32;

  IPayload internal proposal = IPayload(address(0xdeadbeef));
  address internal proposer = address(0);
  Fakerollup internal rollup1;
  Fakerollup internal rollup2;

  uint256 internal privateKey = 0x1234567890;
  Signature internal signature;

  function setUp() public override {
    super.setUp();
  }

  function test_replay() external {
    rollup1 = new Fakerollup();

    proposer = vm.addr(privateKey);
    rollup1.setProposer(proposer);

    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(rollup1)));
    vm.warp(Timestamp.unwrap(rollup1.getTimestampForSlot(Slot.wrap(1))));

    // Create a signature for the proposer
    uint256 round = governanceProposer.getCurrentRound();
    signature = createSignature(privateKey, address(proposal), rollup1.getCurrentSlot());

    // For some reason, before he signals, the time progresses and he is no longer the proposer!
    // It is not even the same round actually
    vm.warp(Timestamp.unwrap(rollup1.getTimestampForSlot(Slot.wrap(2 + governanceProposer.ROUND_SIZE()))));
    rollup1.setProposer(address(0xdead));
    assertNotEq(round, governanceProposer.getCurrentRound());

    // We therefore expect the tx to revert, but not before it was broadcast, so anyone can pick up the signature
    vm.expectRevert();
    governanceProposer.signalWithSig(proposal, signature);

    // A new rollup swings by, and gets added to the registry!
    rollup2 = new Fakerollup();
    rollup2.setProposer(proposer);
    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(rollup2)));

    vm.warp(Timestamp.unwrap(rollup2.getTimestampForSlot(Slot.wrap(1))));

    // Some random dude that picked up the earlier signature sends it to vote using the new rollup!
    assertEq(governanceProposer.signalCount(address(rollup2), 0, proposal), 0, "invalid number of votes");

    vm.expectRevert();
    governanceProposer.signalWithSig(proposal, signature);

    assertEq(governanceProposer.signalCount(address(rollup2), 0, proposal), 0, "invalid number of votes");
  }

  function createSignature(uint256 _privateKey, address _payload, Slot _slot) internal view returns (Signature memory) {
    bytes32 digest = governanceProposer.getSignalSignatureDigest(IPayload(_payload), _slot);

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, digest);

    return Signature({v: v, r: r, s: s});
  }
}
