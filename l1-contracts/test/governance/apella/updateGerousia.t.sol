// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {ApellaBase} from "./base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IApella} from "@aztec/governance/interfaces/IApella.sol";

contract UpdateGovernanceProposerTest is ApellaBase {
  function test_WhenCallerIsNotApella(address _caller, address _governanceProposer) external {
    // it revert
    vm.assume(_caller != address(apella));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Apella__CallerNotSelf.selector, _caller, address(apella))
    );
    vm.prank(_caller);
    apella.updateGovernanceProposer(_governanceProposer);
  }

  function test_WhenCallerIsApella(address _governanceProposer) external {
    // it updates the governanceProposer
    // it emit the {GovernanceProposerUpdated} event

    vm.assume(_governanceProposer != address(apella.governanceProposer()));

    vm.expectEmit(true, true, true, true, address(apella));
    emit IApella.GovernanceProposerUpdated(_governanceProposer);

    vm.prank(address(apella));
    apella.updateGovernanceProposer(_governanceProposer);

    assertEq(_governanceProposer, apella.governanceProposer());
  }
}
