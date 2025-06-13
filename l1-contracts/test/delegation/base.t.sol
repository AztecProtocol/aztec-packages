// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Rollup, GSE, RollupBuilder} from "../builder/RollupBuilder.sol";
import {Governance} from "@aztec/governance/Governance.sol";

contract GSEBase is TestBase {
  Rollup internal ROLLUP;
  Registry internal registry;
  TestERC20 internal stakingAsset;
  GSE internal gse;
  Governance internal governance;

  address internal constant ATTESTER1 = address(bytes20("ATTESTER1"));
  address internal constant ATTESTER2 = address(bytes20("ATTESTER2"));
  address internal constant WITHDRAWER = address(bytes20("WITHDRAWER"));
  address internal constant RECIPIENT = address(bytes20("RECIPIENT"));

  function setUp() public virtual {
    RollupBuilder builder =
      new RollupBuilder(address(this)).setSlashingQuorum(1).setSlashingRoundSize(1);
    builder.deploy();

    registry = builder.getConfig().registry;
    ROLLUP = builder.getConfig().rollup;
    stakingAsset = builder.getConfig().testERC20;
    gse = builder.getConfig().gse;
    governance = builder.getConfig().governance;

    vm.label(address(governance), "governance");
    vm.label(address(governance.governanceProposer()), "governance proposer");
    vm.label(address(gse), "gse");
    vm.label(address(stakingAsset), "staking asset");
    vm.label(address(ROLLUP), "rollup");
    vm.label(address(registry), "registry");
  }

  function help__deposit(address _attester, address _withdrawer, bool _onCanonical) internal {
    uint256 depositAmount = ROLLUP.getDepositAmount();
    stakingAsset.mint(address(this), depositAmount);
    stakingAsset.approve(address(ROLLUP), depositAmount);

    uint256 balance = stakingAsset.balanceOf(address(governance));

    ROLLUP.deposit({_attester: _attester, _withdrawer: _withdrawer, _onCanonical: _onCanonical});

    assertEq(
      stakingAsset.balanceOf(address(governance)), balance + depositAmount, "invalid gov balance"
    );
    assertEq(stakingAsset.balanceOf(address(ROLLUP)), 0, "invalid rollup balance");
  }
}
