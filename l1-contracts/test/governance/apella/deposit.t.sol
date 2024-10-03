// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {ApellaBase} from "./base.t.sol";
import {IApella} from "@aztec/governance/interfaces/IApella.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract DepositTest is ApellaBase {
  uint256 internal constant DEPOSIT_COUNT = 8;
  mapping(address => uint256) internal sums;

  function test_WhenCallerHaveInsufficientAllowance(uint256 _amount) external {
    // it revert

    uint256 amount = bound(_amount, 1, type(uint256).max);
    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientAllowance.selector, address(apella), 0, amount
      )
    );
    apella.deposit(address(this), amount);
  }

  modifier whenCallerHaveSufficientAllowance() {
    _;
  }

  function test_WhenCallerHaveInsufficientFunds(uint256 _amount)
    external
    whenCallerHaveSufficientAllowance
  {
    // it revert
    uint256 amount = bound(_amount, 1, type(uint256).max);

    token.approve(address(apella), amount);

    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientBalance.selector, address(this), 0, amount
      )
    );
    apella.deposit(address(this), amount);
  }

  function test_WhenCallerHaveSufficientFunds(
    address[DEPOSIT_COUNT] memory _onBehalfOfs,
    uint256[DEPOSIT_COUNT] memory _deposits,
    uint256[DEPOSIT_COUNT] memory _timejumps
  ) external whenCallerHaveSufficientAllowance {
    // it transfer funds from caller
    // it add snapshot to user
    // it add snapshot to the total
    // it emits a {Deposit} event

    uint256 sum = 0;
    for (uint256 i = 0; i < DEPOSIT_COUNT; i++) {
      address onBehalfOf = i % 2 == 0 ? _onBehalfOfs[i] : address(0xdeadbeef);
      uint256 amount = bound(_deposits[i], 1, type(uint128).max);
      uint256 timeJump = bound(_timejumps[i], 1, type(uint32).max);

      token.mint(address(this), amount);
      token.approve(address(apella), amount);

      assertEq(token.balanceOf(address(this)), amount);
      assertEq(token.allowance(address(this), address(apella)), amount);

      sums[onBehalfOf] += amount;
      sum += amount;
      vm.warp(block.timestamp + timeJump);

      vm.expectEmit(true, true, true, true, address(apella));
      emit IApella.Deposit(address(this), onBehalfOf, amount);
      apella.deposit(onBehalfOf, amount);

      assertEq(
        apella.powerAt(onBehalfOf, Timestamp.wrap(block.timestamp - 1)), sums[onBehalfOf] - amount
      );
      assertEq(apella.powerAt(onBehalfOf, Timestamp.wrap(block.timestamp)), sums[onBehalfOf]);
      assertEq(apella.totalPowerAt(Timestamp.wrap(block.timestamp - 1)), sum - amount);
      assertEq(apella.totalPowerAt(Timestamp.wrap(block.timestamp)), sum);

      assertEq(token.balanceOf(address(this)), 0);
      assertEq(token.allowance(address(this), address(apella)), 0);
    }
  }
}
