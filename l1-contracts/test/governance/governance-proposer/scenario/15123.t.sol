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
    governanceProposer.voteWithSig(proposal, signature);

    assertEq(
      governanceProposer.yeaCount(address(validatorSelection), 0, proposal),
      0,
      "invalid number of votes"
    );
  }

  function test_replay() external {
    validatorSelection = new Fakerollup();
    proposer = vm.addr(privateKey);
    validatorSelection.setProposer(proposer);

    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(validatorSelection)));
    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(Slot.wrap(1))));

    // Create invalid signature
    signature = createSignature(privateKey, address(proposal));

    governanceProposer.voteWithSig(proposal, signature);

    assertEq(
      governanceProposer.yeaCount(address(validatorSelection), 0, proposal),
      1,
      "invalid number of votes"
    );

    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(Slot.wrap(2))));

    vm.expectRevert();
    governanceProposer.voteWithSig(proposal, signature);

    assertEq(
      governanceProposer.yeaCount(address(validatorSelection), 0, proposal),
      1,
      "invalid number of votes"
    );
  }

  function createSignature(uint256 _privateKey, address _payload)
    internal
    view
    returns (Signature memory)
  {
    bytes32 TYPE_HASH = keccak256(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 hashedName = keccak256(bytes("EmpireBase"));
    bytes32 hashedVersion = keccak256(bytes("1"));
    bytes32 domainSeparator = keccak256(
      abi.encode(TYPE_HASH, hashedName, hashedVersion, block.chainid, address(governanceProposer))
    );
    bytes32 digest = MessageHashUtils.toTypedDataHash(
      domainSeparator, keccak256(abi.encode(governanceProposer.VOTE_TYPEHASH(), _payload))
    );

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, digest);

    return Signature({v: v, r: r, s: s});
  }
}
