// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Rollup, GSE, RollupBuilder} from "../builder/RollupBuilder.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

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

  uint256 internal EPOCH_DURATION_SECONDS;

  function setUp() public virtual {
    RollupBuilder builder = new RollupBuilder(address(this)).setSlashingQuorum(1).setSlashingRoundSize(1)
      .setEpochDuration(1).setSlotDuration(1);
    builder.deploy();

    registry = builder.getConfig().registry;
    ROLLUP = builder.getConfig().rollup;
    stakingAsset = builder.getConfig().testERC20;
    gse = builder.getConfig().gse;
    governance = builder.getConfig().governance;

    EPOCH_DURATION_SECONDS =
      builder.getConfig().rollupConfigInput.aztecEpochDuration * builder.getConfig().rollupConfigInput.aztecSlotDuration;

    vm.label(address(governance), "governance");
    vm.label(address(governance.governanceProposer()), "governance proposer");
    vm.label(address(gse), "gse");
    vm.label(address(stakingAsset), "staking asset");
    vm.label(address(ROLLUP), "rollup");
    vm.label(address(registry), "registry");
  }

  function help__deposit(
    address _attester,
    address _withdrawer,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) internal {
    uint256 activationThreshold = ROLLUP.getActivationThreshold();
    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(this), activationThreshold);
    stakingAsset.approve(address(ROLLUP), activationThreshold);

    uint256 balance = stakingAsset.balanceOf(address(governance));

    ROLLUP.deposit({
      _attester: _attester,
      _withdrawer: _withdrawer,
      _publicKeyInG1: _publicKeyInG1,
      _publicKeyInG2: _publicKeyInG2,
      _proofOfPossession: _proofOfPossession,
      _moveWithLatestRollup: _moveWithLatestRollup
    });
    ROLLUP.flushEntryQueue();

    assertEq(stakingAsset.balanceOf(address(governance)), balance + activationThreshold, "invalid gov balance");
    assertEq(stakingAsset.balanceOf(address(ROLLUP)), 0, "invalid rollup balance");
  }
}
