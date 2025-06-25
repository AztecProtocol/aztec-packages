// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract SetGovernanceTest is WithGSE {
  address internal caller;

  function setUp() public override(WithGSE) {
    gse = new GSE(address(this), IERC20(address(0)));
  }

  function test_WhenCallerNeqOwner(address _caller) external {
    // it reverts

    vm.assume(_caller != gse.owner());

    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    gse.setGovernance(Governance(address(0)));
  }

  modifier whenCallerEqOwner() {
    caller = gse.owner();
    _;
  }

  function test_GivenGovernanceNeq0() external whenCallerEqOwner {
    // it reverts

    gse.setGovernance(Governance(address(1)));

    vm.prank(caller);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__GovernanceAlreadySet.selector));
    gse.setGovernance(Governance(address(2)));
  }

  function test_GivenGovernanceEq0(address _governance) external whenCallerEqOwner {
    // it updates the governance

    vm.assume(_governance != address(0));

    vm.prank(caller);
    gse.setGovernance(Governance(_governance));

    assertEq(address(gse.getGovernance()), _governance);
  }
}
