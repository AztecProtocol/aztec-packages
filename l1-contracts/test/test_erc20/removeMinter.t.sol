// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {TestERC20TestBase} from "./base.t.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract RemoveMinterTest is TestERC20TestBase {
  modifier whenTheCallerIsTheOwner() {
    vm.startPrank(testERC20.owner());
    _;
    vm.stopPrank();
  }

  modifier whenTheCallerIsNotTheOwner(address _caller) {
    vm.assume(_caller != testERC20.owner());
    vm.startPrank(_caller);
    _;
    vm.stopPrank();
  }

  function test_WhenTheCallerIsNotTheOwner(address _caller, address _minter)
    external
    whenTheCallerIsNotTheOwner(_caller)
  {
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    testERC20.removeMinter(_minter);
  }

  function test_WhenTheCallerIsTheOwner(address _minter) external whenTheCallerIsTheOwner {
    // it removes the minter
    // it emits a MinterRemoved event
    vm.expectEmit(true, true, true, true, address(testERC20));
    emit IMintableERC20.MinterRemoved(_minter);
    testERC20.removeMinter(_minter);
    assertEq(testERC20.minters(_minter), false);
  }
}
