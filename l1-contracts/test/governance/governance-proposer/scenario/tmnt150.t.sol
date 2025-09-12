// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceProposerBase} from "../Base.t.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Fakerollup} from "../mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract MaliciousRollup is Fakerollup {
  uint256 public numberOfRounds;
  GovernanceProposer public governanceProposer;
  IPayload public proposal;

  function maliciousValues(uint256 _numberOfRounds, GovernanceProposer _governanceProposer, IPayload _proposal)
    external
  {
    numberOfRounds = _numberOfRounds;
    governanceProposer = _governanceProposer;
    proposal = _proposal;
  }

  function commenceAttack() external {
    governanceProposer.signal(proposal);
  }

  function getCurrentProposer() external override returns (address) {
    if (numberOfRounds <= 1) {
      return address(this);
    }

    numberOfRounds--;

    governanceProposer.signal(proposal);

    return address(this);
  }
}

// https://linear.app/aztec-labs/issue/TMNT-150/spearbit-gov-finding-2-potential-reentrancy-with-malicious-rollup
contract TestTmnt150 is GovernanceProposerBase {
  using MessageHashUtils for bytes32;

  IPayload internal proposal = IPayload(address(0xdeadbeef));
  address internal proposer = address(0);
  MaliciousRollup internal rollup1;

  uint256 internal privateKey = 0x1234567890;
  Signature internal signature;

  function setUp() public override {
    super.setUp();
  }

  function test_reentry() external {
    rollup1 = new MaliciousRollup();

    proposer = vm.addr(privateKey);
    rollup1.setProposer(proposer);

    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(rollup1)));
    vm.warp(Timestamp.unwrap(rollup1.getTimestampForSlot(Slot.wrap(1))));

    // Create a signature for the proposer
    uint256 round = governanceProposer.getCurrentRound();
    signature = createSignature(privateKey, address(proposal), rollup1.getCurrentSlot());

    rollup1.maliciousValues(5, governanceProposer, proposal);

    assertEq(governanceProposer.signalCount(address(rollup1), round, proposal), 0, "invalid number of votes");

    vm.expectRevert(abi.encodeWithSelector(Errors.EmpireBase__SignalAlreadyCastForSlot.selector, 1));

    rollup1.commenceAttack();

    assertEq(governanceProposer.signalCount(address(rollup1), round, proposal), 0, "invalid number of votes");
  }

  function createSignature(uint256 _privateKey, address _payload, Slot _slot) internal view returns (Signature memory) {
    bytes32 digest = governanceProposer.getSignalSignatureDigest(IPayload(_payload), _slot);

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, digest);

    return Signature({v: v, r: r, s: s});
  }
}
