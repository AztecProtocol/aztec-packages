// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {IPayload, Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {DEPOSIT_GRANULARITY_SECONDS} from "@aztec/governance/libraries/UserLib.sol";

contract VoteWithCanonicalTest is WithGSE {
  using ProposalLib for Proposal;

  address internal MAGIC_ADDRESS;

  function setUp() public override {
    super.setUp();

    vm.prank(governance.governanceProposer());
    governance.propose(IPayload(address(0xbeef)));

    MAGIC_ADDRESS = gse.getCanonicalMagicAddress();
  }

  function test_GivenCallerIsNotCanonicalAtProposalTime(address _instance) external {
    // it reverts

    vm.assume(_instance != address(0));

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__NotCanonical.selector, _instance));
    gse.voteWithCanonical(0, 0, true);
  }

  modifier givenCallerIsCanonicalAtProposalTime(address _instance) {
    vm.assume(_instance != address(0) && _instance != MAGIC_ADDRESS);

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    _;
  }

  function test_GivenAmountGreaterThanAvailableCanonicalPower(
    address _instance,
    address _attester,
    uint256 _amount
  ) external givenCallerIsCanonicalAtProposalTime(_instance) {
    // it reverts

    uint256 availablePower = _prepare(_instance, _attester);
    uint256 amount = bound(_amount, availablePower + 1, type(uint256).max);

    vm.prank(_instance);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Delegation__InsufficientPower.selector, MAGIC_ADDRESS, availablePower, amount
      )
    );
    gse.voteWithCanonical(0, amount, true);
  }

  function test_GivenAmountLessOrEqualToAvailableCanonicalPower(
    address _instance,
    address _attester,
    bool _support,
    uint256 _amount
  ) external givenCallerIsCanonicalAtProposalTime(_instance) {
    // it uses delegation power for canonical
    // it votes in governance

    Proposal memory proposal = governance.getProposal(0);
    assertEq(proposal.summedBallot.yea, 0);
    assertEq(proposal.summedBallot.nea, 0);

    uint256 availablePower = _prepare(_instance, _attester);
    uint256 amount = bound(_amount, 0, availablePower);

    vm.prank(_instance);
    gse.voteWithCanonical(0, amount, _support);

    proposal = governance.getProposal(0);
    assertEq(proposal.summedBallot.yea, _support ? amount : 0);
    assertEq(proposal.summedBallot.nea, _support ? 0 : amount);
  }

  function _prepare(address _instance, address _attester) internal returns (uint256) {
    cheat_deposit(_instance, _attester, _attester, true);

    Proposal memory proposal = governance.getProposal(0);
    vm.warp(Timestamp.unwrap(proposal.pendingThroughMemory()) + DEPOSIT_GRANULARITY_SECONDS);

    uint256 availablePower = gse.getVotingPowerAt(MAGIC_ADDRESS, proposal.pendingThroughMemory());

    return availablePower;
  }
}
