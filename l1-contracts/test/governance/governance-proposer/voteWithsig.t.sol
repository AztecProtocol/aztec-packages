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

contract VoteWithSigTest is GovernanceProposerBase {
  using MessageHashUtils for bytes32;

  IPayload internal proposal = IPayload(address(0xdeadbeef));
  address internal proposer = address(0);
  Fakerollup internal validatorSelection;

  uint256 internal privateKey = 0x1234567890;
  Signature internal signature;

  function setUp() public override {
    super.setUp();
  }

  // Skipping this test since the it matches the for now skipped check in `EmpireBase::vote`
  function skip__test_WhenProposalHoldNoCode() external {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__ProposalHaveNoCode.selector, proposal)
    );
    governanceProposer.voteWithSig(proposal, signature);
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

    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__InstanceHaveNoCode.selector, address(f))
    );
    governanceProposer.voteWithSig(proposal, signature);
  }

  modifier givenCanonicalRollupHoldCode() {
    validatorSelection = new Fakerollup();
    proposer = vm.addr(privateKey);
    validatorSelection.setProposer(proposer);

    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(validatorSelection)));

    // We jump into the future since slot 0, will behave as if already voted in
    vm.warp(Timestamp.unwrap(validatorSelection.getTimestampForSlot(Slot.wrap(1))));
    _;
  }

  function test_GivenAVoteAlreadyCastInTheSlot()
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
  {
    // it revert

    Slot currentSlot = validatorSelection.getCurrentSlot();
    assertEq(Slot.unwrap(currentSlot), 1);
    governanceProposer.voteWithSig(proposal, signature);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.GovernanceProposer__VoteAlreadyCastForSlot.selector, currentSlot
      )
    );
    governanceProposer.voteWithSig(proposal, signature);
  }

  modifier givenNoVoteAlreadyCastInTheSlot() {
    _;
  }

  function test_WhenSigNotFromProposer(uint256 _privateKey)
    external
    whenProposalHoldCode
    givenCanonicalRollupHoldCode
    givenNoVoteAlreadyCastInTheSlot
  {
    // it revert

    uint256 pk = bound(_privateKey, 1, type(uint128).max);

    address _proposer = vm.addr(pk);
    vm.assume(_proposer != proposer);
    signature = createSignature(pk, proposal);

    vm.expectRevert(
      abi.encodeWithSelector(SignatureLib__InvalidSignature.selector, proposer, _proposer)
    );
    governanceProposer.voteWithSig(proposal, signature);
  }

  modifier whenCallerIsProposer() {
    // Lets make sure that there first is a leader
    uint256 votesOnProposal = 5;

    for (uint256 i = 0; i < votesOnProposal; i++) {
      vm.warp(
        Timestamp.unwrap(
          validatorSelection.getTimestampForSlot(validatorSelection.getCurrentSlot() + Slot.wrap(1))
        )
      );
      signature = createSignature(privateKey, proposal);
      governanceProposer.voteWithSig(proposal, signature);
    }

    Slot currentSlot = validatorSelection.getCurrentSlot();
    uint256 round = governanceProposer.computeRound(currentSlot);
    RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), round);
    assertEq(
      governanceProposer.yeaCount(address(validatorSelection), round, r.leader),
      votesOnProposal,
      "invalid number of votes"
    );
    assertFalse(r.executed);
    assertEq(address(r.leader), address(proposal));
    assertEq(Slot.unwrap(currentSlot), Slot.unwrap(r.lastVote));

    vm.warp(
      Timestamp.unwrap(
        validatorSelection.getTimestampForSlot(validatorSelection.getCurrentSlot() + Slot.wrap(1))
      )
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

    Slot validatorSelectionSlot = validatorSelection.getCurrentSlot();
    uint256 validatorSelectionRound = governanceProposer.computeRound(validatorSelectionSlot);
    uint256 yeaBefore =
      governanceProposer.yeaCount(address(validatorSelection), validatorSelectionRound, proposal);

    Fakerollup freshInstance = new Fakerollup();
    freshInstance.setProposer(proposer);

    vm.prank(registry.getGovernance());
    registry.addRollup(IRollup(address(freshInstance)));

    vm.warp(Timestamp.unwrap(freshInstance.getTimestampForSlot(Slot.wrap(1))));

    Slot freshSlot = freshInstance.getCurrentSlot();
    uint256 freshRound = governanceProposer.computeRound(freshSlot);

    signature = createSignature(privateKey, proposal);

    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.VoteCast(proposal, freshRound, proposer);
    assertTrue(governanceProposer.voteWithSig(proposal, signature));

    // Check the new instance
    {
      RoundAccounting memory r = governanceProposer.getRoundData(address(freshInstance), freshRound);
      assertEq(
        governanceProposer.yeaCount(address(freshInstance), freshRound, r.leader),
        1,
        "invalid number of votes"
      );
      assertFalse(r.executed);
      assertEq(address(r.leader), address(proposal));
      assertEq(Slot.unwrap(freshSlot), Slot.unwrap(r.lastVote), "invalid slot [FRESH]");
    }

    // The old instance
    {
      RoundAccounting memory r =
        governanceProposer.getRoundData(address(validatorSelection), validatorSelectionRound);
      assertEq(
        governanceProposer.yeaCount(address(validatorSelection), validatorSelectionRound, proposal),
        yeaBefore,
        "invalid number of votes"
      );
      assertFalse(r.executed);
      assertEq(address(r.leader), address(proposal));
      assertEq(
        Slot.unwrap(validatorSelectionSlot),
        Slot.unwrap(r.lastVote) + 1,
        "invalid slot [ValidatorSelection]"
      );
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

    Slot currentSlot = validatorSelection.getCurrentSlot();
    uint256 round = governanceProposer.computeRound(currentSlot);

    uint256 yeaBefore = governanceProposer.yeaCount(address(validatorSelection), round, proposal);

    signature = createSignature(privateKey, proposal);

    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.VoteCast(proposal, round, proposer);
    assertTrue(governanceProposer.voteWithSig(proposal, signature));

    RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), round);
    assertEq(
      governanceProposer.yeaCount(address(validatorSelection), round, r.leader),
      yeaBefore + 1,
      "invalid number of votes"
    );
    assertFalse(r.executed);
    assertEq(address(r.leader), address(proposal));
    assertEq(Slot.unwrap(currentSlot), Slot.unwrap(r.lastVote));
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

    Slot currentSlot = validatorSelection.getCurrentSlot();
    uint256 round = governanceProposer.computeRound(currentSlot);

    uint256 leaderYeaBefore =
      governanceProposer.yeaCount(address(validatorSelection), round, proposal);

    signature = createSignature(privateKey, IPayload(address(validatorSelection)));

    vm.expectEmit(true, true, true, true, address(governanceProposer));
    emit IEmpire.VoteCast(IPayload(address(validatorSelection)), round, proposer);
    assertTrue(governanceProposer.voteWithSig(IPayload(address(validatorSelection)), signature));

    RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), round);
    assertEq(
      governanceProposer.yeaCount(address(validatorSelection), round, r.leader),
      leaderYeaBefore,
      "invalid number of votes"
    );
    assertEq(
      governanceProposer.yeaCount(
        address(validatorSelection), round, IPayload(address(validatorSelection))
      ),
      1,
      "invalid number of votes"
    );
    assertFalse(r.executed);
    assertEq(address(r.leader), address(proposal));
    assertEq(Slot.unwrap(currentSlot), Slot.unwrap(r.lastVote));
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

    Slot currentSlot = validatorSelection.getCurrentSlot();
    uint256 round = governanceProposer.computeRound(currentSlot);

    uint256 leaderYeaBefore =
      governanceProposer.yeaCount(address(validatorSelection), round, proposal);

    for (uint256 i = 0; i < leaderYeaBefore + 1; i++) {
      signature = createSignature(privateKey, IPayload(address(validatorSelection)));

      vm.expectEmit(true, true, true, true, address(governanceProposer));
      emit IEmpire.VoteCast(IPayload(address(validatorSelection)), round, proposer);
      assertTrue(governanceProposer.voteWithSig(IPayload(address(validatorSelection)), signature));

      vm.warp(
        Timestamp.unwrap(
          validatorSelection.getTimestampForSlot(validatorSelection.getCurrentSlot() + Slot.wrap(1))
        )
      );
    }

    {
      RoundAccounting memory r = governanceProposer.getRoundData(address(validatorSelection), round);
      assertEq(
        governanceProposer.yeaCount(
          address(validatorSelection), round, IPayload(address(validatorSelection))
        ),
        leaderYeaBefore + 1,
        "invalid number of votes"
      );
      assertFalse(r.executed);
      assertEq(address(r.leader), address(validatorSelection));
      assertEq(
        governanceProposer.yeaCount(address(validatorSelection), round, proposal),
        leaderYeaBefore,
        "invalid number of votes"
      );
      assertEq(Slot.unwrap(r.lastVote), Slot.unwrap(currentSlot) + leaderYeaBefore);
    }
  }

  function createSignature(uint256 _privateKey, IPayload _payload)
    internal
    view
    returns (Signature memory)
  {
    address p = vm.addr(privateKey);
    uint256 nonce = governanceProposer.nonces(p);
    bytes32 domainSeparator = keccak256(
      abi.encode(
        keccak256(
          "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        ),
        keccak256(bytes("EmpireBase")),
        keccak256(bytes("1")),
        block.chainid,
        address(governanceProposer)
      )
    );
    bytes32 digest = MessageHashUtils.toTypedDataHash(
      domainSeparator, keccak256(abi.encode(governanceProposer.VOTE_TYPEHASH(), _payload, nonce))
    );

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, digest);

    return Signature({v: v, r: r, s: s});
  }
}
