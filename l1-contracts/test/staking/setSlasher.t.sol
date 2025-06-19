// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  IStakingCore, Status, AttesterView, Exit, Timestamp
} from "@aztec/core/interfaces/IStaking.sol";
import {Ownable} from "@oz/access/Ownable.sol";

contract SetslasherTest is StakingBase {
  function test_setSlasher_whenNotOwner(address _caller) external {
    address owner = Ownable(address(staking)).owner();

    vm.assume(_caller != owner);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    staking.setSlasher(address(1));
  }

  function test_setSlasher(address _newSlasher) external {
    address owner = Ownable(address(staking)).owner();

    vm.expectEmit(true, true, true, true);
    emit IStakingCore.SlasherUpdated(SLASHER, _newSlasher);

    vm.prank(owner);
    staking.setSlasher(_newSlasher);

    assertEq(staking.getSlasher(), _newSlasher);
  }
}
