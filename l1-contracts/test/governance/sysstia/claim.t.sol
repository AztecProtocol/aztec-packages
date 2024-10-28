// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {SysstiaBase} from "./Base.t.sol";

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

  function test_GivenBalanceIs0() external whenCallerIsCanonical {
    // it return 0
    vm.record();
    vm.prank(caller);
    assertEq(sysstia.claim(caller), 0);
    (, bytes32[] memory writes) = vm.accesses(address(this));
    assertEq(writes.length, 0);
  }

  function test_GivenBalanceGt0(uint256 _balance) external whenCallerIsCanonical {
    // it transfer min(balance, BLOCK_REWARD)
    // it return min(balance, BLOCK_REWARD)

    uint256 balance = bound(_balance, 1, type(uint256).max);
    token.mint(address(sysstia), balance);

    uint256 reward = balance > sysstia.BLOCK_REWARD() ? sysstia.BLOCK_REWARD() : balance;

    uint256 callerBalance = token.balanceOf(caller);
    vm.prank(caller);
    vm.record();
    uint256 claimed = sysstia.claim(caller);
    (, bytes32[] memory writes) = vm.accesses(address(token));

    assertEq(claimed, reward);
    assertEq(token.balanceOf(caller), callerBalance + reward);
    assertEq(token.balanceOf(address(sysstia)), balance - reward);

    assertEq(writes.length, 2, "writes");
  }
}
