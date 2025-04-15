// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "./base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";

contract UpdateGovernanceProposerTest is GovernanceBase {
  function test_WhenCallerIsNotGovernance(address _caller, address _governanceProposer) external {
    // it revert
    vm.assume(_caller != address(governance));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__CallerNotSelf.selector, _caller, address(governance)
      )
    );
    vm.prank(_caller);
    governance.updateGovernanceProposer(_governanceProposer);
  }

  function test_WhenCallerIsGovernance(address _governanceProposer) external {
    // it updates the governanceProposer
    // it emit the {GovernanceProposerUpdated} event

    vm.assume(_governanceProposer != address(governance.governanceProposer()));

    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.GovernanceProposerUpdated(_governanceProposer);

    vm.prank(address(governance));
    governance.updateGovernanceProposer(_governanceProposer);

    assertEq(_governanceProposer, governance.governanceProposer());
  }
}
