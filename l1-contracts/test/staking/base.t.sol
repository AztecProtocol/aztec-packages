// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";

contract StakingBase is TestBase {
  IStaking internal staking;
  Registry internal registry;
  TestERC20 internal stakingAsset;

  address internal constant ATTESTER = address(bytes20("ATTESTER"));
  address internal constant WITHDRAWER = address(bytes20("WITHDRAWER"));
  address internal constant RECIPIENT = address(bytes20("RECIPIENT"));

  uint256 internal DEPOSIT_AMOUNT;
  uint256 internal MINIMUM_STAKE;

  uint256 internal EPOCH_DURATION_SECONDS;

  address internal SLASHER;

  function setUp() public virtual {
    RollupBuilder builder =
      new RollupBuilder(address(this)).setSlashingQuorum(1).setSlashingRoundSize(1);
    builder.deploy();

    registry = builder.getConfig().registry;

    RollupConfigInput memory rollupConfig = builder.getConfig().rollupConfigInput;

    EPOCH_DURATION_SECONDS = rollupConfig.aztecEpochDuration * rollupConfig.aztecSlotDuration;

    staking = IStaking(address(builder.getConfig().rollup));
    stakingAsset = builder.getConfig().testERC20;

    DEPOSIT_AMOUNT = staking.getDepositAmount();
    MINIMUM_STAKE = staking.getMinimumStake();
    SLASHER = staking.getSlasher();
  }

  function mint(address _to, uint256 _amount) internal {
    vm.prank(stakingAsset.owner());
    stakingAsset.mint(_to, _amount);
  }
}
