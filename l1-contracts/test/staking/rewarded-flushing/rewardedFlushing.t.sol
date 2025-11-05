// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable ordering

pragma solidity >=0.8.27;

import {StakingBase} from "../base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Status, AttesterView, IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {GSE, IGSECore} from "@aztec/governance/GSE.sol";
import {StakingQueueLib, DepositArgs} from "@aztec/core/libraries/StakingQueue.sol";
import {StakingQueueConfig, StakingQueueConfigLib} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {FlushRewarder, IFlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";

contract RewardedFlushingTest is StakingBase {
  uint256 public constant MAX_QUEUE_FLUSH_SIZE = 48;
  FlushRewarder public flushRewarder;

  function setUp() public override {
    super.setUp();
    flushRewarder = new FlushRewarder(address(this), IInstance(address(staking)), stakingAsset, 50e18);

    StakingQueueConfig memory stakingQueueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: 0,
      bootstrapFlushSize: 0,
      normalFlushSizeMin: 8,
      normalFlushSizeQuotient: 1,
      maxQueueFlushSize: MAX_QUEUE_FLUSH_SIZE
    });
    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    vm.prank(rollup.owner());
    rollup.updateStakingQueueConfig(stakingQueueConfig);

    for (uint256 i = 1; i <= 10; i++) {
      _help_deposit(address(uint160(i)), address(uint160(i)), true);
    }
  }

  function test_givenNoFunding() external {
    uint256 attestersBefore = staking.getActiveAttesterCount();
    flushRewarder.flushEntryQueue();

    assertEq(staking.getActiveAttesterCount(), attestersBefore + 8, "invalid active attester count");
    assertEq(stakingAsset.balanceOf(address(flushRewarder)), 0, "invalid balance");
    assertEq(flushRewarder.rewardsOf(address(this)), 0, "invalid rewards");
  }

  modifier givenFunding() {
    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(flushRewarder), 1_000_000e18);
    _;
  }

  function test_givenRewardsNotClaimable() external givenFunding {
    uint256 attestersBefore = staking.getActiveAttesterCount();
    flushRewarder.flushEntryQueue();

    assertEq(staking.getActiveAttesterCount(), attestersBefore + 8, "invalid active attester count");
    assertEq(stakingAsset.balanceOf(address(flushRewarder)), 1_000_000e18, "invalid balance");
    assertEq(flushRewarder.rewardsOf(address(this)), 8 * flushRewarder.rewardPerInsertion(), "invalid rewards");

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__RewardsNotClaimable.selector));
    flushRewarder.claimRewards();

    vm.expectRevert(abi.encodeWithSelector(IFlushRewarder.InsufficientRewardsAvailable.selector));
    flushRewarder.recover(address(stakingAsset), address(this), 1_000_000e18);
  }

  modifier givenRewardsClaimable() {
    vm.prank(address(staking.getGSE().getGovernance()));
    Rollup(address(staking)).setRewardsClaimable(true);
    _;
  }

  function test_givenFundingGivenRewardsClaimable() external givenFunding givenRewardsClaimable {
    uint256 attestersBefore = staking.getActiveAttesterCount();
    flushRewarder.flushEntryQueue();

    assertEq(staking.getActiveAttesterCount(), attestersBefore + 8, "invalid active attester count");
    assertEq(stakingAsset.balanceOf(address(flushRewarder)), 1_000_000e18, "invalid balance");
    uint256 rewards = flushRewarder.rewardsOf(address(this));
    assertEq(rewards, 8 * flushRewarder.rewardPerInsertion(), "invalid rewards");

    flushRewarder.claimRewards();
    assertEq(stakingAsset.balanceOf(address(flushRewarder)), 1_000_000e18 - rewards, "invalid balance");
    assertEq(flushRewarder.rewardsOf(address(this)), 0, "invalid rewards");
    assertEq(stakingAsset.balanceOf(address(this)), rewards, "invalid balance");
  }

  function test_revertWhen_setRewardsClaimableCalledTooSoon() external {
    // Set up a specific unlock timestamp (e.g., 30 days from now)
    uint256 unlockTimestamp = block.timestamp + 30 days;

    // Use the existing rollup setup from StakingBase but create a new one with unlock timestamp
    Rollup existingRollup = Rollup(address(staking));

    // Get the config and modify the earliestRewardsClaimableTimestamp
    RollupConfigInput memory config = TestConstants.getRollupConfigInput();
    config.earliestRewardsClaimableTimestamp = Timestamp.wrap(unlockTimestamp);

    // Deploy a new rollup with the unlock timestamp
    Rollup testRollup = new Rollup(
      existingRollup.getFeeAsset(),
      existingRollup.getFeeAsset(),
      staking.getGSE(),
      new MockVerifier(),
      address(this),
      TestConstants.getGenesisState(),
      config
    );

    // Verify the unlock timestamp was set correctly
    assertEq(
      Timestamp.unwrap(testRollup.getEarliestRewardsClaimableTimestamp()),
      unlockTimestamp,
      "unlock timestamp not set correctly"
    );

    // Warp to before the unlock timestamp
    vm.warp(unlockTimestamp - 1);

    // Try to set rewards claimable and expect revert
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__TooSoonToSetRewardsClaimable.selector, unlockTimestamp, unlockTimestamp - 1)
    );
    testRollup.setRewardsClaimable(true);

    // Warp to exactly the unlock timestamp
    vm.warp(unlockTimestamp);

    // Now it should succeed
    testRollup.setRewardsClaimable(true);

    assertTrue(testRollup.isRewardsClaimable(), "rewards should be claimable");
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

    DepositArgs memory validator = staking.getEntryQueueAt(staking.getEntryQueueLength() - 1);
    assertEq(validator.attester, _attester, "invalid attester");
    assertEq(validator.withdrawer, _withdrawer, "invalid withdrawer");
    assertTrue(BN254Lib.isZero(validator.publicKeyInG1), "invalid public key in G1");
    assertTrue(BN254Lib.isZero(validator.publicKeyInG2), "invalid public key in G2");
    assertTrue(BN254Lib.isZero(validator.proofOfPossession), "invalid proof of possession");
    assertEq(validator.moveWithLatestRollup, _moveWithLatestRollup, "invalid move with latest rollup");
  }
}
