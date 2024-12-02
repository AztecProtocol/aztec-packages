// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RegistryBase} from "./Base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract GetVersionForTest is RegistryBase {
  address internal rollup;

  modifier givenNoAdditionalListedRollups() {
    _;
  }

  function test_When_rollupIs0xdead() external view givenNoAdditionalListedRollups {
    // it should return 0
    assertEq(registry.getVersionFor(address(0xdead)), 0);
  }

  function test_RevertWhen__rollupNot0xdead(address _rollup)
    external
    givenNoAdditionalListedRollups
  {
    // it should revert
    vm.assume(_rollup != address(0xdead));
    vm.expectRevert(abi.encodeWithSelector(Errors.Registry__RollupNotRegistered.selector, _rollup));
    registry.getVersionFor(_rollup);
  }

  modifier givenMultipleListedRollups() {
    rollup = address(0xbeef);
    registry.upgrade(rollup);
    _;
  }

  function test_When_rollupIsListed() external givenMultipleListedRollups {
    // it should return the rollup version
    assertEq(registry.getVersionFor(address(0xdead)), 0);
    assertEq(registry.getVersionFor(address(0xbeef)), 1);
  }

  function test_RevertWhen__rollupIsNotListed(address _rollup) external givenMultipleListedRollups {
    // it should revert
    vm.assume(_rollup != address(0xdead) && _rollup != address(0xbeef));
    vm.expectRevert(abi.encodeWithSelector(Errors.Registry__RollupNotRegistered.selector, _rollup));
    registry.getVersionFor(_rollup);
  }
}
