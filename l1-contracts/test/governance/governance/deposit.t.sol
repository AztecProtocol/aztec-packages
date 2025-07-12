// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "./base.t.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {DEPOSIT_GRANULARITY_SECONDS} from "@aztec/governance/libraries/UserLib.sol";

contract DepositTest is GovernanceBase {
  uint256 internal constant DEPOSIT_COUNT = 8;
  mapping(address => uint256) internal sums;

  function test_WhenCallerHaveInsufficientAllowance(uint256 _amount) external {
    // it revert

    uint256 amount = bound(_amount, 1, type(uint256).max);
    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientAllowance.selector, address(governance), 0, amount
      )
    );
    governance.deposit(address(this), amount);
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

    token.approve(address(governance), amount);

    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientBalance.selector, address(this), 0, amount
      )
    );
    governance.deposit(address(this), amount);
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
      uint256 timeJump = bound(_timejumps[i], DEPOSIT_GRANULARITY_SECONDS, type(uint16).max);

      token.mint(address(this), amount);
      token.approve(address(governance), amount);

      assertEq(token.balanceOf(address(this)), amount);
      assertEq(token.allowance(address(this), address(governance)), amount);

      sums[onBehalfOf] += amount;
      sum += amount;
      vm.warp(block.timestamp + timeJump);

      vm.expectEmit(true, true, true, true, address(governance));
      emit IGovernance.Deposit(address(this), onBehalfOf, amount);
      governance.deposit(onBehalfOf, amount);

      assertEq(
        governance.powerAt(
          onBehalfOf, Timestamp.wrap(block.timestamp - DEPOSIT_GRANULARITY_SECONDS)
        ),
        sums[onBehalfOf] - amount
      );
      assertEq(governance.powerAt(onBehalfOf, Timestamp.wrap(block.timestamp)), sums[onBehalfOf]);
      assertEq(
        governance.totalPowerAt(Timestamp.wrap(block.timestamp - DEPOSIT_GRANULARITY_SECONDS)),
        sum - amount
      );
      assertEq(governance.totalPowerAt(Timestamp.wrap(block.timestamp)), sum);

      assertEq(token.balanceOf(address(this)), 0);
      assertEq(token.allowance(address(this), address(governance)), 0);
    }
  }
}
