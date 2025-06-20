// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

contract AddRollupTest is WithGSE {
  address internal caller;

  function test_WhenCallerNeqOwner(address _caller) external {
    // it reverts

    vm.assume(_caller != gse.owner());

    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    gse.addRollup(address(0));
  }

  modifier whenCallerEqOwner() {
    caller = gse.owner();
    _;
  }

  function test_GivenRollupEq0() external whenCallerEqOwner {
    // it reverts
    vm.prank(caller);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__InvalidRollupAddress.selector, address(0)));
    gse.addRollup(address(0));
  }

  modifier givenRollupNeq0(address _rollup) {
    vm.assume(_rollup != address(0));
    vm.assume(!gse.isRollupRegistered(_rollup));
    _;
  }

  function test_GivenRollupAlreadyRegistered(address _rollup)
    external
    whenCallerEqOwner
    givenRollupNeq0(_rollup)
  {
    // it reverts

    // We add it once
    vm.prank(caller);
    gse.addRollup(_rollup);

    // We try to add it again
    vm.prank(caller);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__RollupAlreadyRegistered.selector, _rollup));
    gse.addRollup(_rollup);
  }

  function test_GivenRollupNotRegistered(
    address _rollup,
    address _rollup2,
    uint256 _ts1,
    uint256 _ts2
  ) external whenCallerEqOwner givenRollupNeq0(_rollup) givenRollupNeq0(_rollup2) {
    // it adds rollup to instances
    // it sets rollup exists to true
    // it pushes rollup to canonical with timestamp

    vm.assume(_rollup != _rollup2);

    vm.label(_rollup, "Rollup1");
    vm.label(_rollup2, "Rollup2");

    uint256 ts1 = bound(_ts1, 1000, 2000);
    uint256 ts2 = bound(_ts2, ts1 + 1, ts1 + 2000);

    assertEq(gse.isRollupRegistered(_rollup), false);
    assertEq(gse.isRollupRegistered(_rollup2), false);

    vm.warp(ts1);

    vm.prank(caller);
    gse.addRollup(_rollup);

    assertEq(gse.isRollupRegistered(_rollup), true);
    assertEq(gse.getCanonical(), _rollup);

    vm.warp(ts2);

    vm.prank(caller);
    gse.addRollup(_rollup2);

    assertEq(gse.isRollupRegistered(_rollup2), true);
    assertEq(gse.getCanonical(), _rollup2);

    emit log_named_address("canonical", address(gse.getCanonical()));
    emit log_named_address("canonicalAt", address(gse.getCanonicalAt(Timestamp.wrap(ts1))));
    emit log_named_address("canonicalAt2", address(gse.getCanonicalAt(Timestamp.wrap(ts2))));

    assertEq(gse.getCanonicalAt(Timestamp.wrap(ts1)), _rollup);
    assertEq(gse.getCanonicalAt(Timestamp.wrap(ts2)), _rollup2);
  }
}
