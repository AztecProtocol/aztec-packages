// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable ordering

pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Status, AttesterView, IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {GSE, IGSECore} from "@aztec/governance/GSE.sol";
import {StakingQueueLib} from "@aztec/core/libraries/StakingQueue.sol";
import {StakingQueueConfig, StakingQueueConfigLib} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";

contract Tmnt333Test is StakingBase {
  uint256 public constant FUSAKA_GAS_LIMIT = 16_000_000;

  function testGas() external {
    RollupBuilder builder = new RollupBuilder(address(this)).setSlashingQuorum(1).setSlashingRoundSize(1);
    builder.deploy();

    Rollup r = new Rollup(
      builder.getConfig().testERC20,
      builder.getConfig().testERC20,
      builder.getConfig().gse,
      new MockVerifier(),
      address(this),
      builder.getConfig().genesisState,
      builder.getConfig().rollupConfigInput
    );
  }

  function test_GivenBigBootstrap() external {
    StakingQueueConfig memory stakingQueueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: 1250,
      bootstrapFlushSize: 125,
      normalFlushSizeMin: 1,
      normalFlushSizeQuotient: 2048,
      maxQueueFlushSize: 8
    });
    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    vm.prank(rollup.owner());
    rollup.updateStakingQueueConfig(stakingQueueConfig);

    for (uint256 i = 1; i <= 1250; i++) {
      _help_deposit(address(uint160(i)), address(uint160(i)), true);
    }

    uint256 queueLength = staking.getEntryQueueLength();
    assertEq(queueLength, 1250, "invalid queue length");

    uint256 flushableValidators = staking.getAvailableValidatorFlushes();
    assertEq(flushableValidators, 125, "invalid flushable validators");

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__DepositOutOfGas.selector));
    staking.flushEntryQueue{gas: FUSAKA_GAS_LIMIT}();

    uint256 epochs = stakingQueueConfig.bootstrapValidatorSetSize / stakingQueueConfig.bootstrapFlushSize;

    assertFalse(staking.getIsBootstrapped(), "invalid bootstrapped");

    for (uint256 i = 0; i < epochs; i++) {
      vm.warp(block.timestamp + EPOCH_DURATION_SECONDS);
      while (staking.getAvailableValidatorFlushes() > 0) {
        staking.flushEntryQueue{gas: FUSAKA_GAS_LIMIT}(16);
      }
    }

    // We have spent all of the available flushes, will be 0 until next epoch.
    assertEq(staking.getAvailableValidatorFlushes(), 0, "invalid flushable validators");

    assertEq(staking.getActiveAttesterCount(), 1250, "invalid active attester count");
    assertTrue(staking.getIsBootstrapped(), "invalid bootstrapped");

    // At this point, only 1 can be added then.
    vm.warp(block.timestamp + EPOCH_DURATION_SECONDS);
    assertEq(staking.getAvailableValidatorFlushes(), 1, "invalid flushable validators");
    _help_deposit(address(uint160(1251)), address(uint160(1251)), true);

    staking.flushEntryQueue{gas: FUSAKA_GAS_LIMIT}(16);
    assertEq(staking.getAvailableValidatorFlushes(), 0, "invalid flushable validators");
    assertTrue(staking.getIsBootstrapped(), "invalid bootstrapped");

    for (uint256 i = 1; i <= 1251; i++) {
      address attester = address(uint160(i));
      vm.prank(attester);
      staking.initiateWithdraw(attester, attester);
    }

    assertEq(staking.getActiveAttesterCount(), 0, "invalid active attester count");
    assertEq(staking.getEntryQueueLength(), 0, "invalid entry queue length");
    assertTrue(staking.getIsBootstrapped(), "invalid bootstrapped");
  }

  function _help_deposit(address _attester, address _withdrawer, bool _moveWithLatestRollup) internal {
    mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);
    uint256 balance = stakingAsset.balanceOf(address(staking));

    staking.deposit({
      _attester: _attester,
      _withdrawer: _withdrawer,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: _moveWithLatestRollup
    });

    assertEq(stakingAsset.balanceOf(address(staking)), balance + ACTIVATION_THRESHOLD, "invalid balance");
  }
}
