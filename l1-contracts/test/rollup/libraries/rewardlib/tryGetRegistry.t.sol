// SPDX-License-Identifier: MIT
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {IATP, IATPStaker, RewardLib} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {MockATP, MockATPStaker, deployMockATPStaker} from "@test/mock/ATPMocks.sol";

contract RevertingAddressGetter is IATP, IATPStaker {
  function getRegistry() external pure override(IATP) returns (address) {
    _revert();
  }

  function getATP() external pure override(IATPStaker) returns (address) {
    _revert();
  }

  function _revert() internal pure {
    assembly ("memory-safe") {
      mstore(0x00, 0x42)
      revert(0x00, 0x20)
    }
  }
}

contract VariableReturnDataAddressGetter {
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

contract DirtyAddressGetter is IATP, IATPStaker {
  function getRegistry() external pure override(IATP) returns (address) {
    _returnDirty();
  }

  function getATP() external pure override(IATPStaker) returns (address) {
    _returnDirty();
  }

  function _returnDirty() internal pure {
    assembly ("memory-safe") {
      mstore(0x00, or(shl(160, 1), 0x42))
      return(0x00, 0x20)
    }
  }
}

contract GasBurningAddressGetter is IATP, IATPStaker {
  function getRegistry() external view override(IATP) returns (address) {
    _burn();
  }

  function getATP() external view override(IATPStaker) returns (address) {
    _burn();
  }

  function _burn() internal view {
    uint256 startingGas = gasleft();
    while (startingGas - gasleft() < 100_000) {}
    revert();
  }
}

contract TryGetRegistryTest is TestBase {
  function test_WhenStakerAndATPRespond() external {
    address expectedRegistry = makeAddr("registry");
    (MockATPStaker staker,) = deployMockATPStaker(expectedRegistry);

    (bool responded, address registry) = RewardLib.tryGetRegistry(address(staker));

    assertTrue(responded);
    assertEq(registry, expectedRegistry);
  }

  function test_WhenWithdrawerIsEOA() external {
    _assertInvalidRegistryResponse(makeAddr("eoa"));
  }

  function test_WhenWithdrawerExposesRegistryDirectly() external {
    // An ATP itself, or any contract that only answers getRegistry(), is not a staker and must not match.
    MockATP atp = new MockATP(makeAddr("registry"));
    _assertInvalidRegistryResponse(address(atp));
  }

  function test_WhenStakerReturnsZeroATP() external {
    MockATPStaker staker = new MockATPStaker(address(0));
    _assertInvalidRegistryResponse(address(staker));
  }

  function test_WhenStakerReturnsEOAAsATP() external {
    MockATPStaker staker = new MockATPStaker(makeAddr("eoa"));
    _assertInvalidRegistryResponse(address(staker));
  }

  function test_WhenATPReturnsZeroRegistry() external {
    (MockATPStaker staker,) = deployMockATPStaker(address(0));

    (bool responded, address registry) = RewardLib.tryGetRegistry(address(staker));

    assertTrue(responded);
    assertEq(registry, address(0));
  }

  function test_WhenStakerReverts() external {
    _assertInvalidRegistryResponse(address(new RevertingAddressGetter()));
  }

  function test_WhenATPReverts() external {
    _assertInvalidRegistryResponse(address(new MockATPStaker(address(new RevertingAddressGetter()))));
  }

  function test_WhenStakerReturnsTooLittleData() external {
    _assertInvalidRegistryResponse(address(new VariableReturnDataAddressGetter(31)));
  }

  function test_WhenATPReturnsTooLittleData() external {
    _assertInvalidRegistryResponse(address(new MockATPStaker(address(new VariableReturnDataAddressGetter(31)))));
  }

  function test_WhenStakerReturnsTooMuchData() external {
    _assertInvalidRegistryResponse(address(new VariableReturnDataAddressGetter(33)));
  }

  function test_WhenATPReturnsTooMuchData() external {
    _assertInvalidRegistryResponse(address(new MockATPStaker(address(new VariableReturnDataAddressGetter(33)))));
  }

  function test_WhenStakerReturnsDirtyAddress() external {
    _assertInvalidRegistryResponse(address(new DirtyAddressGetter()));
  }

  function test_WhenATPReturnsDirtyAddress() external {
    _assertInvalidRegistryResponse(address(new MockATPStaker(address(new DirtyAddressGetter()))));
  }

  function test_WhenStakerBurnsProbeGas() external {
    GasBurningAddressGetter staker = new GasBurningAddressGetter();

    uint256 gasBefore = gasleft();
    (bool responded, address registry) = RewardLib.tryGetRegistry(address(staker));
    uint256 gasUsed = gasBefore - gasleft();

    assertFalse(responded);
    assertEq(registry, address(0));
    assertLt(gasUsed, 75_000);
  }

  function test_WhenATPBurnsProbeGas() external {
    MockATPStaker staker = new MockATPStaker(address(new GasBurningAddressGetter()));

    uint256 gasBefore = gasleft();
    (bool responded, address registry) = RewardLib.tryGetRegistry(address(staker));
    uint256 gasUsed = gasBefore - gasleft();

    assertFalse(responded);
    assertEq(registry, address(0));
    assertLt(gasUsed, 100_000);
  }

  function test_WhenStakerReturnsLargeData() external {
    _assertInvalidRegistryResponse(address(new VariableReturnDataAddressGetter(65_536)));
  }

  function test_WhenATPReturnsLargeData() external {
    _assertInvalidRegistryResponse(address(new MockATPStaker(address(new VariableReturnDataAddressGetter(65_536)))));
  }

  function _assertInvalidRegistryResponse(address _withdrawer) internal view {
    (bool responded, address registry) = RewardLib.tryGetRegistry(_withdrawer);
    assertFalse(responded);
    assertEq(registry, address(0));
  }
}
