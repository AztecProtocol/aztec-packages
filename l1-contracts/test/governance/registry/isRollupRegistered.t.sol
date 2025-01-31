// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RegistryBase} from "./Base.t.sol";

contract IsRollupRegisteredTest is RegistryBase {
  address internal rollup;

  modifier givenNoAdditionalListedRollups() {
    _;
  }

  function test_When_rollupIs0xdead() external view givenNoAdditionalListedRollups {
    // it should return true
    assertTrue(registry.isRollupRegistered(address(0xdead)));
  }

  function test_When_rollupNot0xdead(address _rollup) external view givenNoAdditionalListedRollups {
    // it should return false
    vm.assume(_rollup != address(0xdead));
    assertFalse(registry.isRollupRegistered(_rollup));
  }

  modifier givenMultipleListedRollups() {
    rollup = address(0xbeef);
    registry.upgrade(rollup);
    _;
  }

  function test_When_rollupIsListed() external givenMultipleListedRollups {
    // it should return true
    assertTrue(registry.isRollupRegistered(address(0xdead)));
    assertTrue(registry.isRollupRegistered(address(0xbeef)));
  }

  function test_When_rollupIsNotListed(address _rollup) external givenMultipleListedRollups {
    // it should return false
    vm.assume(_rollup != address(0xdead) && _rollup != address(0xbeef));
    assertFalse(registry.isRollupRegistered(_rollup));
  }
}
