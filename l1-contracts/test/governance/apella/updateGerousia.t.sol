// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {ApellaBase} from "./base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IApella} from "@aztec/governance/interfaces/IApella.sol";

contract UpdateGerousiaTest is ApellaBase {
  function test_WhenCallerIsNotApella(address _caller, address _gerousia) external {
    // it revert
    vm.assume(_caller != address(apella));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Apella__CallerNotSelf.selector, _caller, address(apella))
    );
    vm.prank(_caller);
    apella.updateGerousia(_gerousia);
  }

  function test_WhenCallerIsApella(address _gerousia) external {
    // it updates the gerousia
    // it emit the {GerousiaUpdated} event

    vm.assume(_gerousia != address(apella.gerousia()));

    vm.expectEmit(true, true, true, true, address(apella));
    emit IApella.GerousiaUpdated(_gerousia);

    vm.prank(address(apella));
    apella.updateGerousia(_gerousia);

    assertEq(_gerousia, apella.gerousia());
  }
}
