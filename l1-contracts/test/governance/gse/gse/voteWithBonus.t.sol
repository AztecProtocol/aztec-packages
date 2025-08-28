// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {IPayload, Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {UncompressedProposalWrapper} from "@test/governance/helpers/UncompressedProposalTestLib.sol";

contract VoteWithBonusTest is WithGSE {
  using ProposalLib for Proposal;

  UncompressedProposalWrapper internal upw = new UncompressedProposalWrapper();

  address internal BONUS_ADDRESS;

  function setUp() public override {
    super.setUp();

    vm.prank(governance.governanceProposer());
    governance.propose(IPayload(address(0xbeef)));

    BONUS_ADDRESS = gse.getBonusInstanceAddress();
  }

  function test_GivenCallerIsNotLatestAtProposalTime(address _instance) external {
    // it reverts

    vm.assume(_instance != address(0));

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__NotLatestRollup.selector, _instance));
    gse.voteWithBonus(0, 0, true);
  }

  modifier givenCallerIsLatestAtProposalTime(address _instance) {
    vm.assume(_instance != address(0) && _instance != BONUS_ADDRESS);

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    _;
  }

  function test_GivenAmountGreaterThanAvailableBonusPower(address _instance, address _attester, uint256 _amount)
    external
    givenCallerIsLatestAtProposalTime(_instance)
  {
    // it reverts

    vm.assume(_attester != address(0));

    uint256 availablePower = _prepare(_instance, _attester);
    uint256 amount = bound(_amount, availablePower + 1, type(uint256).max);

    vm.prank(_instance);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Delegation__InsufficientPower.selector, BONUS_ADDRESS, availablePower, amount)
    );
    gse.voteWithBonus(0, amount, true);
  }

  function test_GivenAmountLessOrEqualToAvailableBonusPower(
    address _instance,
    address _attester,
    bool _support,
    uint256 _amount
  ) external givenCallerIsLatestAtProposalTime(_instance) {
    // it uses delegation power for bonus
    // it votes in governance

    vm.assume(_attester != address(0));

    Proposal memory proposal = governance.getProposal(0);
    assertEq(proposal.summedBallot.yea, 0);
    assertEq(proposal.summedBallot.nay, 0);

    uint256 availablePower = _prepare(_instance, _attester);
    uint256 amount = bound(_amount, 0, availablePower);

    vm.prank(_instance);
    gse.voteWithBonus(0, amount, _support);

    proposal = governance.getProposal(0);
    assertEq(proposal.summedBallot.yea, _support ? amount : 0);
    assertEq(proposal.summedBallot.nay, _support ? 0 : amount);
  }

  function _prepare(address _instance, address _attester) internal returns (uint256) {
    cheat_deposit(_instance, _attester, _attester, true);

    Proposal memory proposal = governance.getProposal(0);
    vm.warp(Timestamp.unwrap(upw.pendingThrough(proposal)) + 1);

    uint256 availablePower = gse.getVotingPowerAt(BONUS_ADDRESS, upw.pendingThrough(proposal));

    return availablePower;
  }
}
