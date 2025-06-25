// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IGSE} from "@aztec/governance/GSE.sol";

contract FakeRegistry {
  function getGovernance() external pure returns (address) {
    return address(0x01);
  }

  function getCanonicalRollup() external pure returns (address) {
    return address(0x02);
  }
}

contract ConstructorTest is Test {
  IRegistry internal REGISTRY = IRegistry(address(new FakeRegistry()));
  IGSE internal GSE = IGSE(address(0x03));

  function test_WhenNIsLessThanOrEqualHalfOfM(uint256 _n, uint256 _m) external {
    // it revert

    uint256 n = bound(_n, 0, _m / 2);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__InvalidNAndMValues.selector, n, _m)
    );
    new GovernanceProposer(REGISTRY, GSE, n, _m);
  }

  function test_WhenNLargerThanM(uint256 _n, uint256 _m) external {
    // it revert
    uint256 m = bound(_m, 0, type(uint256).max - 1);
    uint256 n = bound(_n, m + 1, type(uint256).max);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.GovernanceProposer__NCannotBeLargerTHanM.selector, n, m)
    );
    new GovernanceProposer(REGISTRY, GSE, n, m);
  }

  function test_WhenNIsGreatherThanHalfOfM(uint256 _n, uint256 _m) external {
    // it deploys

    uint256 m = bound(_m, 1, type(uint256).max);
    uint256 n = bound(_n, m / 2 + 1, m);

    GovernanceProposer g = new GovernanceProposer(REGISTRY, GSE, n, m);

    assertEq(address(g.REGISTRY()), address(REGISTRY));
    assertEq(g.N(), n);
    assertEq(g.M(), m);
    assertEq(g.getExecutor(), address(REGISTRY.getGovernance()), "executor");
    assertEq(g.getInstance(), address(REGISTRY.getCanonicalRollup()), "instance");
  }
}
