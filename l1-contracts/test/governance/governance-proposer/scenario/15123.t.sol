// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceProposerBase} from "../Base.t.sol";

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IEmpire} from "@aztec/governance/interfaces/IEmpire.sol";
import {GovernanceProposerBase} from "../Base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Fakerollup} from "../mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Signature, SignatureLib__InvalidSignature} from "@aztec/shared/libraries/SignatureLib.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";

// See https://github.com/AztecProtocol/aztec-packages/issues/15123
contract Test15123 is GovernanceProposerBase {
  using MessageHashUtils for bytes32;

  IPayload internal proposal = IPayload(address(0xdeadbeef));
  address internal proposer = address(0);
  Fakerollup internal validatorSelection;

  uint256 internal privateKey = 0x1234567890;
  Signature internal signature;

  function setUp() public override {
    super.setUp();
  }

  function test_ProposerEqZero() external {
    validatorSelection = new Fakerollup();

    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(validatorSelection)));
    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(Slot.wrap(1))));

    // Create invalid signature
    signature = Signature({v: 4, r: bytes32(0), s: bytes32(0)});

    vm.expectRevert();
    governanceProposer.signalWithSig(proposal, signature);

    assertEq(governanceProposer.signalCount(address(validatorSelection), 0, proposal), 0, "invalid number of votes");
  }

  function test_replay() external {
    validatorSelection = new Fakerollup();
    proposer = vm.addr(privateKey);
    validatorSelection.setProposer(proposer);

    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(validatorSelection)));
    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(Slot.wrap(1))));

    uint256 round = governanceProposer.getCurrentRound();
    signature = createSignature(privateKey, proposal, validatorSelection.getCurrentSlot());

    governanceProposer.signalWithSig(proposal, signature);

    assertEq(governanceProposer.signalCount(address(validatorSelection), round, proposal), 1, "invalid number of votes");

    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(Slot.wrap(2))));

    vm.expectRevert();
    governanceProposer.signalWithSig(proposal, signature);

    assertEq(governanceProposer.signalCount(address(validatorSelection), round, proposal), 1, "invalid number of votes");
  }

  function createSignature(uint256 _privateKey, IPayload _payload, Slot _slot) internal view returns (Signature memory) {
    bytes32 digest = governanceProposer.getSignalSignatureDigest(_payload, _slot);
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, digest);
    return Signature({v: v, r: r, s: s});
  }
}
