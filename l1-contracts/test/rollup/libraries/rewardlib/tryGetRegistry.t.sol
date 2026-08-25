// SPDX-License-Identifier: MIT
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {IRegistryProvider, RewardLib} from "@aztec/core/libraries/rollup/RewardLib.sol";

contract RegistryProvider is IRegistryProvider {
  address private immutable registry;

  constructor(address _registry) {
    registry = _registry;
  }

  function getRegistry() external view override returns (address) {
    return registry;
  }
}

contract RevertingRegistryProvider is IRegistryProvider {
  function getRegistry() external pure override returns (address) {
    assembly ("memory-safe") {
      mstore(0x00, 0x42)
      revert(0x00, 0x20)
    }
  }
}

contract VariableReturnDataRegistryProvider {
  uint256 private immutable returnDataSize;

  constructor(uint256 _returnDataSize) {
    returnDataSize = _returnDataSize;
  }

  fallback() external {
    uint256 size = returnDataSize;

    assembly {
      mstore(0x00, 0x42)
      return(0x00, size)
    }
  }
}

contract DirtyAddressRegistryProvider is IRegistryProvider {
  function getRegistry() external pure override returns (address) {
    assembly ("memory-safe") {
      mstore(0x00, or(shl(160, 1), 0x42))
      return(0x00, 0x20)
    }
  }
}

contract GasBurningRegistryProvider is IRegistryProvider {
  function getRegistry() external view override returns (address) {
    uint256 startingGas = gasleft();
    while (startingGas - gasleft() < 100_000) {}
    revert();
  }
}

contract TryGetRegistryTest is TestBase {
  function test_WhenWithdrawerReturnsRegistry() external {
    address expectedRegistry = makeAddr("registry");
    RegistryProvider provider = new RegistryProvider(expectedRegistry);

    (bool responded, address registry) = RewardLib.tryGetRegistry(address(provider));

    assertTrue(responded);
    assertEq(registry, expectedRegistry);
  }

  function test_WhenWithdrawerIsEOA() external {
    (bool responded, address registry) = RewardLib.tryGetRegistry(makeAddr("eoa"));
    assertFalse(responded);
    assertEq(registry, address(0));
  }

  function test_WhenWithdrawerReturnsZeroRegistry() external {
    RegistryProvider provider = new RegistryProvider(address(0));

    (bool responded, address registry) = RewardLib.tryGetRegistry(address(provider));

    assertTrue(responded);
    assertEq(registry, address(0));
  }

  function test_WhenWithdrawerReverts() external {
    RevertingRegistryProvider provider = new RevertingRegistryProvider();
    _assertInvalidRegistryResponse(address(provider));
  }

  function test_WhenWithdrawerReturnsTooLittleData() external {
    VariableReturnDataRegistryProvider provider = new VariableReturnDataRegistryProvider(31);
    _assertInvalidRegistryResponse(address(provider));
  }

  function test_WhenWithdrawerReturnsTooMuchData() external {
    VariableReturnDataRegistryProvider provider = new VariableReturnDataRegistryProvider(33);
    _assertInvalidRegistryResponse(address(provider));
  }

  function test_WhenWithdrawerReturnsDirtyAddress() external {
    DirtyAddressRegistryProvider provider = new DirtyAddressRegistryProvider();
    _assertInvalidRegistryResponse(address(provider));
  }

  function test_WhenWithdrawerBurnsProbeGas() external {
    GasBurningRegistryProvider provider = new GasBurningRegistryProvider();

    uint256 gasBefore = gasleft();
    (bool responded, address registry) = RewardLib.tryGetRegistry(address(provider));
    uint256 gasUsed = gasBefore - gasleft();

    assertFalse(responded);
    assertEq(registry, address(0));
    assertLt(gasUsed, 75_000);
  }

  function test_WhenWithdrawerReturnsLargeData() external {
    VariableReturnDataRegistryProvider provider = new VariableReturnDataRegistryProvider(65_536);
    _assertInvalidRegistryResponse(address(provider));
  }

  function _assertInvalidRegistryResponse(address _withdrawer) internal view {
    (bool responded, address registry) = RewardLib.tryGetRegistry(_withdrawer);
    assertFalse(responded);
    assertEq(registry, address(0));
  }
}
