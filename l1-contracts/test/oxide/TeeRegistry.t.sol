// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {TeeRegistry} from "@aztec/oxide/TeeRegistry.sol";

contract TeeRegistryTest is Test {
  TeeRegistry internal registry;

  address internal constant OWNER = address(0x0FFE);
  address internal constant OUTSIDER = address(0xDEAD);
  address internal constant TEE_A = address(0xA);
  address internal constant TEE_B = address(0xB);

  event TeeAdded(address indexed tee);
  event TeeRemoved(address indexed tee);

  function setUp() public {
    registry = new TeeRegistry(OWNER);
  }

  function test_addTee_registersAndEmits() public {
    vm.expectEmit(true, false, false, false, address(registry));
    emit TeeAdded(TEE_A);

    vm.prank(OWNER);
    registry.addTee(TEE_A);

    assertTrue(registry.isRegisteredTee(TEE_A));
    assertFalse(registry.isRegisteredTee(TEE_B));
  }

  function test_addTee_revertsWhenNotOwner() public {
    vm.prank(OUTSIDER);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OUTSIDER));
    registry.addTee(TEE_A);
  }

  function test_addTee_revertsOnZeroAddress() public {
    vm.prank(OWNER);
    vm.expectRevert(TeeRegistry.ZeroAddress.selector);
    registry.addTee(address(0));
  }

  function test_addTee_revertsIfAlreadyRegistered() public {
    vm.prank(OWNER);
    registry.addTee(TEE_A);

    vm.prank(OWNER);
    vm.expectRevert(TeeRegistry.AlreadyRegistered.selector);
    registry.addTee(TEE_A);
  }

  function test_removeTee_unregistersAndEmits() public {
    vm.prank(OWNER);
    registry.addTee(TEE_A);

    vm.expectEmit(true, false, false, false, address(registry));
    emit TeeRemoved(TEE_A);

    vm.prank(OWNER);
    registry.removeTee(TEE_A);

    assertFalse(registry.isRegisteredTee(TEE_A));
  }

  function test_removeTee_revertsWhenNotOwner() public {
    vm.prank(OWNER);
    registry.addTee(TEE_A);

    vm.prank(OUTSIDER);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OUTSIDER));
    registry.removeTee(TEE_A);
  }

  function test_removeTee_revertsIfNotRegistered() public {
    vm.prank(OWNER);
    vm.expectRevert(TeeRegistry.NotRegistered.selector);
    registry.removeTee(TEE_A);
  }
}
