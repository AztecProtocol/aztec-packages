// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {EconomicsHarness} from "@test/harnesses/EconomicsHarness.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {EconomicsInitArgs, EpochSettlementPlan, RewardConfig} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";

contract MockRewardDistributor is IRewardDistributor {
  address public canonicalRollup;

  function setCanonicalRollup(address _canonicalRollup) external {
    canonicalRollup = _canonicalRollup;
  }

  function claim(address, uint256) external {}

  function recover(address, address, uint256) external {}
}

contract EpochSettlementPlanTest is TestBase {
  TestERC20 private feeAsset;
  MockRewardDistributor private rewardDistributor;
  EconomicsHarness private economics;

  function setUp() public {
    feeAsset = new TestERC20("FeeAsset", "FEE", address(this));
    rewardDistributor = new MockRewardDistributor();

    RewardConfig memory rewardConfig = TestConstants.getRewardConfig();
    rewardConfig.rewardDistributor = rewardDistributor;
    rewardConfig.checkpointReward = 100e18;

    economics = new EconomicsHarness(
      address(this),
      address(this),
      feeAsset,
      EconomicsInitArgs({
        manaTarget: TestConstants.AZTEC_MANA_TARGET,
        provingCostPerMana: TestConstants.AZTEC_PROVING_COST_PER_MANA,
        initialEthPerFeeAsset: TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET,
        rewardConfig: rewardConfig,
        rewardBoostConfig: TestConstants.getRewardBoostConfig(),
        genesisTime: block.timestamp,
        aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
        aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
        aztecProofSubmissionEpochs: TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
      })
    );
  }

  function test_getEpochSettlementPlanReturnsZeroWhenRollupIsNotCanonical() external view {
    EpochSettlementPlan memory plan = economics.getEpochSettlementPlan(3, _zeroFees(3), Epoch.wrap(0));

    assertEq(plan.checkpointRewardsToClaim, 0, "non-canonical rollup should not claim rewards");
    assertEq(plan.rewardRecipient, address(economics), "reward recipient");
    assertEq(address(plan.rewardDistributor), address(rewardDistributor), "reward distributor");
    assertEq(plan.portalFeesToDistribute, 0, "portal fees");
  }

  function test_getEpochSettlementPlanCapsClaimByDistributorBalance() external {
    rewardDistributor.setCanonicalRollup(address(this));
    feeAsset.mint(address(rewardDistributor), 250e18);

    EpochSettlementPlan memory plan = economics.getEpochSettlementPlan(3, _zeroFees(3), Epoch.wrap(0));

    assertEq(plan.checkpointRewardsToClaim, 250e18, "claim amount should be capped by distributor balance");
    assertEq(plan.rewardRecipient, address(economics), "reward recipient");
    assertEq(address(plan.rewardDistributor), address(rewardDistributor), "reward distributor");
    assertEq(plan.portalFeesToDistribute, 0, "portal fees");
  }

  function test_getEpochSettlementPlanReturnsZeroWhenRewardDistributorIsUnset() external {
    RewardConfig memory rewardConfig = TestConstants.getRewardConfig();
    EconomicsHarness noDistributorEconomics = new EconomicsHarness(
      address(this),
      address(this),
      feeAsset,
      EconomicsInitArgs({
        manaTarget: TestConstants.AZTEC_MANA_TARGET,
        provingCostPerMana: TestConstants.AZTEC_PROVING_COST_PER_MANA,
        initialEthPerFeeAsset: TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET,
        rewardConfig: rewardConfig,
        rewardBoostConfig: TestConstants.getRewardBoostConfig(),
        genesisTime: block.timestamp,
        aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
        aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
        aztecProofSubmissionEpochs: TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
      })
    );

    EpochSettlementPlan memory plan = noDistributorEconomics.getEpochSettlementPlan(3, _zeroFees(3), Epoch.wrap(0));

    assertEq(plan.checkpointRewardsToClaim, 0, "missing distributor should not claim rewards");
    assertEq(plan.rewardRecipient, address(noDistributorEconomics), "reward recipient");
    assertEq(address(plan.rewardDistributor), address(0), "reward distributor");
    assertEq(plan.portalFeesToDistribute, 0, "portal fees");
  }

  function _zeroFees(uint256 _count) internal pure returns (bytes32[] memory) {
    return new bytes32[](_count * 2);
  }
}
