// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {IPayload, Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract VoteTest is WithGSE {
  using ProposalLib for Proposal;

  function setUp() public override {
    super.setUp();

    vm.prank(governance.governanceProposer());
    governance.propose(IPayload(address(0xbeef)));
  }

  function test_GivenAmountGreaterThanAvailablePower(
    address _instance,
    address _attester,
    address _delegatee,
    bool _delegate,
    uint256 _amount
  ) external {
    // it reverts

    (address voter, uint256 availablePower) = _prepare(_instance, _attester, _delegatee, _delegate);
    uint256 amount = bound(_amount, availablePower + 1, type(uint256).max);

    vm.prank(voter);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Delegation__InsufficientPower.selector, voter, availablePower, amount
      )
    );
    gse.vote(0, amount, true);
  }

  function test_GivenAmountLessOrEqualToAvailablePower(
    address _instance,
    address _attester,
    address _delegatee,
    bool _delegate,
    uint256 _amount,
    bool _support
  ) external {
    // it uses delegation power for proposal
    // it votes in governance

    Proposal memory proposal = governance.getProposal(0);
    assertEq(proposal.summedBallot.yea, 0);
    assertEq(proposal.summedBallot.nay, 0);

    (address voter, uint256 availablePower) = _prepare(_instance, _attester, _delegatee, _delegate);
    uint256 amount = bound(_amount, 0, availablePower);
    assertEq(gse.getPowerUsed(voter, 0), 0);

    vm.prank(voter);
    gse.vote(0, amount, _support);

    proposal = governance.getProposal(0);
    assertEq(proposal.summedBallot.yea, _support ? amount : 0);
    assertEq(proposal.summedBallot.nay, _support ? 0 : amount);

    assertEq(gse.getPowerUsed(voter, 0), amount);
  }

  function _prepare(address _instance, address _attester, address _delegatee, bool _delegate)
    internal
    returns (address, uint256)
  {
    vm.assume(_instance != address(0) && _instance != gse.getBonusInstanceAddress());

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    cheat_deposit(_instance, _attester, _attester, false);

    if (_delegate) {
      vm.prank(_attester);
      gse.delegate(_instance, _attester, _delegatee);
    }

    Proposal memory proposal = governance.getProposal(0);
    vm.warp(Timestamp.unwrap(proposal.pendingThroughMemory()) + 1);

    address voter = _delegate ? _delegatee : _attester;

    uint256 availablePower = gse.getVotingPowerAt(voter, proposal.pendingThroughMemory());

    return (voter, availablePower);
  }
}
