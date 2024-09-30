// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {SysstiaBase} from "./Base.t.sol";

import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract ClaimTest is SysstiaBase {
  address internal caller;

  function test_WhenCallerIsNotCanonical(address _caller) external {
    // it reverts
    vm.assume(_caller != address(0xdead));

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Sysstia__InvalidCaller.selector, _caller, address(0xdead))
    );
    vm.prank(_caller);
    sysstia.claim(_caller);
  }

  modifier whenCallerIsCanonical() {
    caller = address(0xdead);
    _;
  }

  function test_GivenBalanceSmallerThanReward() external whenCallerIsCanonical {
    // it reverts
    uint256 needed = sysstia.BLOCK_REWARD();
    vm.prank(caller);
    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientBalance.selector, address(sysstia), 0, needed
      )
    );
    sysstia.claim(caller);
  }

  function test_GivenBalanceLargerOrEqualReward(uint256 _balance) external whenCallerIsCanonical {
    // it transfers block reward of asset
    // it returns block reward value
    uint256 balance = bound(_balance, sysstia.BLOCK_REWARD(), type(uint256).max);
    token.mint(address(sysstia), balance);

    uint256 callerBalance = token.balanceOf(caller);
    vm.prank(caller);
    sysstia.claim(caller);

    assertEq(token.balanceOf(caller), callerBalance + sysstia.BLOCK_REWARD());
  }
}
