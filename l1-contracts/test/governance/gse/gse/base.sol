// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {GSE} from "@aztec/governance/GSE.sol";
import {TestBase} from "@test/base/Base.sol";
import {GSEBuilder} from "@test/builder/GseBuilder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

contract WithGSE is TestBase {
  GSE internal gse;
  TestERC20 internal stakingAsset;
  Governance internal governance;

  function setUp() public virtual {
    GSEBuilder builder = new GSEBuilder().deploy();
    gse = builder.getConfig().gse;
    vm.label(address(gse), "GSE");
    stakingAsset = TestERC20(address(gse.ASSET()));
    governance = Governance(address(gse.getGovernance()));
  }

  function cheat_deposit(address _instance, address _attester, address _withdrawer, bool _onBonus) public {
    vm.assume(_attester != address(0));

    uint256 activationThreshold = gse.ACTIVATION_THRESHOLD();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), activationThreshold);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), activationThreshold);
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), _onBonus);
    vm.stopPrank();
  }
}
