// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestERC20TestBase} from "./base.t.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract MintTest is TestERC20TestBase {
  function test_WhenTheCallerIsNotAMinter(address _caller, address _to, uint256 _amount) external {
    vm.assume(_caller != testERC20.owner());
    vm.startPrank(_caller);
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(IMintableERC20.NotMinter.selector, _caller));
    testERC20.mint(_to, _amount);
    vm.stopPrank();
  }

  function test_WhenTheCallerIsAMinter(address _caller, address _to, uint256 _amount) external {
    // it mints the amount to _to
    // it emits a Transfer event
    vm.prank(testERC20.owner());
    testERC20.addMinter(_caller);

    vm.assume(_to != address(0));

    vm.prank(_caller);
    vm.expectEmit(true, true, true, true, address(testERC20));
    emit IERC20.Transfer(address(0), _to, _amount);
    testERC20.mint(_to, _amount);
  }
}
