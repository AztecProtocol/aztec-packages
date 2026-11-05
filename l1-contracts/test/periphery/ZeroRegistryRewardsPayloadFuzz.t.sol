// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {ZeroRegistryRewardsPayload} from "@aztec/periphery/ZeroRegistryRewardsPayload.sol";

contract FuzzGSEStub {
  function getWithdrawer(address) external pure returns (address) {
    return address(0);
  }
}

contract FuzzRollupStub {
  address public owner;
  address public getGSE;

  constructor(address _owner, address _gse) {
    owner = _owner;
    getGSE = _gse;
  }
}

contract ZeroRegistryRewardsPayloadFuzz is Test {
  address internal rollup;
  address internal governance = makeAddr("governance");
  FuzzGSEStub internal gse;

  function setUp() public {
    gse = new FuzzGSEStub();
    rollup = address(new FuzzRollupStub(governance, address(gse)));
  }

  function testFuzz_revertsOnDuplicate(address reg1, address reg2) public {
    vm.assume(reg1 != address(0) && reg2 != address(0));
    vm.assume(reg1 != reg2);

    address[] memory regs = new address[](3);
    regs[0] = reg1;
    regs[1] = reg2;
    regs[2] = reg1; // duplicate

    vm.expectRevert(abi.encodeWithSelector(ZeroRegistryRewardsPayload.ZeroRegistryRewardsPayload__DuplicateRegistry.selector, reg1));
    new ZeroRegistryRewardsPayload(IInstance(rollup), regs);
  }

  function testFuzz_revertsOnZeroAddress(address validReg) public {
    vm.assume(validReg != address(0));

    address[] memory regs = new address[](2);
    regs[0] = validReg;
    regs[1] = address(0);

    vm.expectRevert(ZeroRegistryRewardsPayload.ZeroRegistryRewardsPayload__ZeroAddress.selector);
    new ZeroRegistryRewardsPayload(IInstance(rollup), regs);
  }

  function test_revertsOnEmptyRegistries() public {
    address[] memory empty = new address[](0);

    vm.expectRevert(ZeroRegistryRewardsPayload.ZeroRegistryRewardsPayload__NoRegistries.selector);
    new ZeroRegistryRewardsPayload(IInstance(rollup), empty);
  }

  function testFuzz_validRegistriesArray(uint8 count, uint256 seed) public {
    uint8 n = uint8(bound(count, 1, 50));
    address[] memory regs = new address[](n);
    for (uint8 i = 0; i < n; i++) {
      regs[i] = address(uint160(uint256(keccak256(abi.encode(seed, i))) % (type(uint160).max - 1) + 1));
      for (uint8 j = 0; j < i; j++) {
        if (regs[j] == regs[i]) regs[i] = address(uint160(regs[i]) + 1);
      }
    }

    ZeroRegistryRewardsPayload payload = new ZeroRegistryRewardsPayload(IInstance(rollup), regs);
    assertEq(payload.registryCount(), n);
    assertEq(payload.getActions().length, n + 1);
  }
}
