// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {GSE} from "@aztec/governance/GSE.sol";
import {TestBase} from "@test/base/Base.sol";
import {GSEBuilder} from "@test/builder/GseBuilder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Governance} from "@aztec/governance/Governance.sol";

contract WithGSE is TestBase {
  GSE internal gse;
  TestERC20 internal stakingAsset;
  Governance internal governance;

  function setUp() public virtual {
    GSEBuilder builder = new GSEBuilder().deploy();
    gse = builder.getConfig().gse;
    vm.label(address(gse), "GSE");
    stakingAsset = TestERC20(address(gse.STAKING_ASSET()));
    governance = Governance(address(gse.getGovernance()));
  }

  function cheat_deposit(
    address _instance,
    address _attester,
    address _withdrawer,
    bool _onCanonical
  ) public {
    uint256 depositAmount = gse.DEPOSIT_AMOUNT();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), depositAmount);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), depositAmount);
    gse.deposit(_attester, _withdrawer, _onCanonical);
    vm.stopPrank();
  }
}
