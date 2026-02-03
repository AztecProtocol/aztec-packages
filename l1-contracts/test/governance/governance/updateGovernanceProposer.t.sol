// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "./base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";

contract UpdateGovernanceProposerTest is GovernanceBase {
  function test_WhenCallerIsNotGovernance(address _caller, address _governanceProposer) external {
    // it revert
    vm.assume(_caller != address(governance));
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__CallerNotSelf.selector, _caller, address(governance)));
    vm.prank(_caller);
    governance.updateGovernanceProposer(_governanceProposer);
  }

  modifier whenCallerIsGovernance() {
    vm.startPrank(address(governance));
    _;
    vm.stopPrank();
  }

  function test_WhenNewGovernanceProposerIsGovernance() external whenCallerIsGovernance {
    // it revert
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__GovernanceProposerCannotBeSelf.selector));
    governance.updateGovernanceProposer(address(governance));
  }

  function test_WhenNewGovernanceProposerIsNotGovernance(address _governanceProposer) external whenCallerIsGovernance {
    // it updates the governanceProposer
    // it emit the {GovernanceProposerUpdated} event

    vm.assume(_governanceProposer != address(governance.governanceProposer()));
    vm.assume(_governanceProposer != address(governance));

    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.GovernanceProposerUpdated(_governanceProposer);

    governance.updateGovernanceProposer(_governanceProposer);

    assertEq(_governanceProposer, governance.governanceProposer());
  }
}
