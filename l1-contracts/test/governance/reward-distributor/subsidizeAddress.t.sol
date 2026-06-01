// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RewardDistributorBase} from "./Base.t.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

contract SubsidizeRollupTest is RewardDistributorBase {
  function test_revertsWhen_rollupIsZero(uint256 _amount) external {
    address funder = makeAddr("funder");
    token.mint(funder, _amount);
    vm.prank(funder);
    token.approve(address(rewardDistributor), _amount);

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardDistributor__ZeroRollup.selector));
    vm.prank(funder);
    rewardDistributor.subsidizeAddress(address(0), _amount);
  }

  // subsidizeAddress is permissionless: any non-zero caller with allowance can fund any non-zero rollup.
  function test_creditsSpecificAndTotal(address _funder, address _rollup, uint256 _amount) external {
    vm.assume(_rollup != address(0));
    vm.assume(_funder != address(0) && _funder != address(rewardDistributor));
    uint256 amount = bound(_amount, 1, type(uint128).max);

    token.mint(_funder, amount);
    vm.prank(_funder);
    token.approve(address(rewardDistributor), amount);

    uint256 prevSpecific = rewardDistributor.specificRecipientBalance(_rollup);
    uint256 prevDebt = rewardDistributor.totalEarmarkedBalance();
    uint256 prevBalance = token.balanceOf(address(rewardDistributor));

    vm.prank(_funder);
    rewardDistributor.subsidizeAddress(_rollup, amount);

    assertEq(rewardDistributor.specificRecipientBalance(_rollup), prevSpecific + amount, "specificRecipientBalance");
    assertEq(rewardDistributor.totalEarmarkedBalance(), prevDebt + amount, "totalEarmarkedBalance");
    assertEq(token.balanceOf(address(rewardDistributor)), prevBalance + amount, "balance");
    assertEq(rewardDistributor.availableTo(_rollup), prevSpecific + amount, "availableTo");
  }

  function test_accumulatesAcrossCalls(address _rollup) external {
    vm.assume(_rollup != address(0));
    uint256 first = 10e18;
    uint256 second = 25e18;

    address funder = makeAddr("funder");
    token.mint(funder, first + second);
    vm.prank(funder);
    token.approve(address(rewardDistributor), first + second);

    vm.prank(funder);
    rewardDistributor.subsidizeAddress(_rollup, first);
    vm.prank(funder);
    rewardDistributor.subsidizeAddress(_rollup, second);

    assertEq(rewardDistributor.specificRecipientBalance(_rollup), first + second);
    assertEq(rewardDistributor.totalEarmarkedBalance(), first + second);
  }

  function test_emitsSubsidizedEvent(address _rollup, uint256 _amount) external {
    // Every credit recorded against `specificRecipientBalance` must emit Subsidized so an
    // off-chain indexer can rebuild bucket-by-bucket history from logs alone.
    vm.assume(_rollup != address(0));
    uint256 amount = bound(_amount, 0, type(uint128).max);

    address funder = makeAddr("eventFunder");
    token.mint(funder, amount);
    vm.prank(funder);
    token.approve(address(rewardDistributor), amount);

    vm.expectEmit(true, true, true, true, address(rewardDistributor));
    emit IRewardDistributor.Subsidized(funder, _rollup, amount);
    vm.prank(funder);
    rewardDistributor.subsidizeAddress(_rollup, amount);
  }

  function test_zeroAmountIsNoop(address _rollup) external {
    vm.assume(_rollup != address(0));
    address funder = makeAddr("funder");
    vm.prank(funder);
    token.approve(address(rewardDistributor), 0);

    uint256 prevSpecific = rewardDistributor.specificRecipientBalance(_rollup);
    uint256 prevDebt = rewardDistributor.totalEarmarkedBalance();

    vm.prank(funder);
    rewardDistributor.subsidizeAddress(_rollup, 0);

    assertEq(rewardDistributor.specificRecipientBalance(_rollup), prevSpecific);
    assertEq(rewardDistributor.totalEarmarkedBalance(), prevDebt);
  }
}
