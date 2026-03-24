// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {EconomicsHarness} from "@test/harnesses/EconomicsHarness.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IEconomics} from "@aztec/core/interfaces/IEconomics.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {
  FeeAssetValue,
  FeeConfig,
  EthPerFeeAssetE12,
  EthValue,
  PriceLib
} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {FeeHeader, FeeStructsLib, L1GasOracleValues} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {
  Bps,
  EconomicsInitArgs,
  EpochSettlementPlan,
  RewardConfig,
  RewardBoostConfig
} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

contract MockCoverageRewardDistributor is IRewardDistributor {
  address public canonicalRollup;
  IERC20 public immutable feeAsset;

  constructor(IERC20 _feeAsset) {
    feeAsset = _feeAsset;
  }

  function setCanonicalRollup(address _canonicalRollup) external {
    canonicalRollup = _canonicalRollup;
  }

  function claim(address _to, uint256 _amount) external override {
    require(feeAsset.transfer(_to, _amount), "reward transfer failed");
  }

  function recover(address, address, uint256) external pure override {
    revert("unused");
  }
}

contract EconomicsRewardsTest is TestBase {
  using PriceLib for EthValue;
  using SafeCast for uint256;

  Epoch internal constant EPOCH_ZERO = Epoch.wrap(0);
  uint256 internal constant CHECKPOINT_REWARD = 101;
  uint256 internal constant SEQUENCER_BPS = 3333;

  TestERC20 internal feeAsset;
  MockCoverageRewardDistributor internal rewardDistributor;
  EconomicsHarness internal economics;

  address internal prover = makeAddr("prover");
  address internal otherProver = makeAddr("other-prover");
  address internal sequencer = makeAddr("sequencer");
  address internal notOwner = makeAddr("not-owner");

  function setUp() public {
    feeAsset = new TestERC20("FeeAsset", "FEE", address(this));
    rewardDistributor = new MockCoverageRewardDistributor(feeAsset);
    economics = new EconomicsHarness(address(this), address(this), feeAsset, _initArgs());
  }

  function test_metadataViewsExposeCurrentModel() external view {
    assertEq(economics.getRollup(), address(this), "rollup");
    assertEq(address(economics.getFeeAsset()), address(feeAsset), "fee asset");
    assertEq(address(economics.getRewardConfig().rewardDistributor), address(rewardDistributor), "reward distributor");

    FeeConfig memory feeConfig = economics.getFeeConfig();
    assertEq(feeConfig.manaTarget, TestConstants.AZTEC_MANA_TARGET, "mana target");
    assertEq(
      EthValue.unwrap(feeConfig.provingCostPerMana),
      EthValue.unwrap(TestConstants.AZTEC_PROVING_COST_PER_MANA),
      "proving cost"
    );
    assertEq(economics.getManaLimit(), TestConstants.AZTEC_MANA_TARGET * 2, "mana limit");
    assertEq(
      EthPerFeeAssetE12.unwrap(economics.getEthPerFeeAsset(0)),
      EthPerFeeAssetE12.unwrap(TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET),
      "pricing eth per fee asset"
    );
    assertEq(
      FeeAssetValue.unwrap(economics.getProvingCostPerManaInFeeAsset(0)),
      FeeAssetValue.unwrap(
        TestConstants.AZTEC_PROVING_COST_PER_MANA.toFeeAsset(TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET)
      ),
      "proving cost per mana in fee asset"
    );

    L1GasOracleValues memory oracleValues = economics.getL1GasOracleValues();
    assertEq(FeeStructsLib.decompress(oracleValues.pre).baseFee, 1 gwei, "pre base fee");
    assertEq(FeeStructsLib.decompress(oracleValues.pre).blobFee, 1, "pre blob fee");

    RewardBoostConfig memory config = economics.getRewardBoostConfig();
    RewardBoostConfig memory expected = TestConstants.getRewardBoostConfig();
    assertEq(config.increment, expected.increment, "increment");
    assertEq(config.maxScore, expected.maxScore, "max score");
    assertEq(config.a, expected.a, "a");
    assertEq(config.k, expected.k, "k");
    assertEq(config.minimum, expected.minimum, "minimum");

    assertEq(economics.clampedAdd(5, 2), 7, "positive clamped add");
  }

  function test_settlementPlanIsPublicButRecordCheckpointRejectsNonRollupCaller() external {
    address boundRollup = makeAddr("bound-rollup");
    EconomicsHarness boundEconomics = new EconomicsHarness(address(this), boundRollup, feeAsset, _initArgs());

    assertEq(boundEconomics.getRollup(), boundRollup, "rollup");
    assertEq(
      boundEconomics.getEpochSettlementPlan(1, _singleFee(0), EPOCH_ZERO).checkpointRewardsToClaim, 0, "public view"
    );

    vm.expectRevert(abi.encodeWithSelector(Errors.Economics__OnlyRollup.selector, address(this)));
    boundEconomics.recordCheckpoint({
      _checkpointNumber: 1, _feeAssetPriceModifier: 0, _manaUsed: 0, _congestionCost: 0, _proverCost: 0
    });
  }

  function test_updateL1GasFeeOracleIsPublic() external {
    uint256 updatedBaseFee = 7 gwei;
    uint256 updatedBlobFee = 9;
    uint256 warpBy = 8 * TestConstants.AZTEC_SLOT_DURATION;
    vm.fee(updatedBaseFee);
    vm.blobBaseFee(updatedBlobFee);
    vm.warp(block.timestamp + warpBy);
    economics.updateL1GasFeeOracle();

    L1GasOracleValues memory afterValues = economics.getL1GasOracleValues();
    assertEq(FeeStructsLib.decompress(afterValues.post).baseFee, updatedBaseFee, "post base fee updated");
    assertEq(FeeStructsLib.decompress(afterValues.post).blobFee, updatedBlobFee, "post blob fee updated");
  }

  function test_setRewardConfigRevertsWhenSequencerBpsExceedsOneHundredPercent() external {
    RewardConfig memory rewardConfig = economics.getRewardConfig();
    rewardConfig.sequencerBps = Bps.wrap(10_001);

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardLib__InvalidSequencerBps.selector));
    economics.setRewardConfig(rewardConfig);
  }

  function test_setRewardConfigRevertsWhenCallerIsNotOwner() external {
    RewardConfig memory updated = economics.getRewardConfig();
    updated.checkpointReward += 1;

    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, notOwner));
    vm.prank(notOwner);
    economics.setRewardConfig(updated);
  }

  function test_setRewardBoostConfigUpdatesConfigAndEmitsEvent() external {
    RewardBoostConfig memory updated =
      RewardBoostConfig({increment: 123_456, maxScore: 7_000_000, a: 4321, minimum: 200_000, k: 900_000});

    vm.expectEmit(false, false, false, true);
    emit IEconomics.RewardBoostConfigUpdated(updated);
    economics.setRewardBoostConfig(updated);

    RewardBoostConfig memory config = economics.getRewardBoostConfig();
    assertEq(config.increment, updated.increment, "increment");
    assertEq(config.maxScore, updated.maxScore, "max score");
    assertEq(config.a, updated.a, "a");
    assertEq(config.minimum, updated.minimum, "minimum");
    assertEq(config.k, updated.k, "k");
  }

  function test_setRewardBoostConfigRevertsWhenKIsBelowMinimum() external {
    RewardBoostConfig memory invalid = economics.getRewardBoostConfig();
    invalid.minimum = 200_000;
    invalid.k = 199_999;

    vm.expectRevert(
      abi.encodeWithSelector(Errors.RewardLib__InvalidRewardBoostConfig.selector, invalid.minimum, invalid.k)
    );
    economics.setRewardBoostConfig(invalid);
  }

  function test_setRewardBoostConfigRevertsWhenCallerIsNotOwner() external {
    RewardBoostConfig memory updated = economics.getRewardBoostConfig();
    updated.increment += 1;

    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, notOwner));
    vm.prank(notOwner);
    economics.setRewardBoostConfig(updated);
  }

  function test_updateManaTargetRevertsWhenCallerIsNotOwner() external {
    uint256 updatedManaTarget = economics.getFeeConfig().manaTarget + 1;

    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, notOwner));
    vm.prank(notOwner);
    economics.updateManaTarget(updatedManaTarget);
  }

  function test_updateProvingCostPerManaRevertsWhenCallerIsNotOwner() external {
    EthValue updatedProvingCostPerMana = EthValue.wrap(EthValue.unwrap(economics.getFeeConfig().provingCostPerMana) + 1);

    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, notOwner));
    vm.prank(notOwner);
    economics.updateProvingCostPerMana(updatedProvingCostPerMana);
  }

  function test_finalizeEpochSettlementCreditsRewardsFeesAndBurn() external {
    rewardDistributor.setCanonicalRollup(address(this));

    _setFeeHeader(1, 10, 2, 3);
    _setFeeHeader(2, 4, 1, 4);

    feeAsset.mint(address(rewardDistributor), 202);
    bytes32[] memory fees = _fees(60, 30);
    EpochSettlementPlan memory plan = economics.getEpochSettlementPlan(2, fees, EPOCH_ZERO);
    feeAsset.mint(address(economics), plan.portalFeesToDistribute);
    uint256 checkpointRewards = plan.checkpointRewardsToClaim;
    rewardDistributor.claim(address(economics), checkpointRewards);

    economics.finalizeEpochSettlement(1, 2, prover, fees, EPOCH_ZERO, checkpointRewards);

    assertEq(economics.getLongestProvenLength(EPOCH_ZERO), 2, "longest proven length");
    assertTrue(economics.getHasSubmitted(EPOCH_ZERO, 2, prover), "submission recorded");
    assertEq(economics.getSequencerRewards(sequencer), 86, "sequencer rewards");
    assertEq(economics.getCollectiveProverRewardsForEpoch(EPOCH_ZERO), 182, "prover rewards");
    assertEq(economics.getSpecificProverRewardsForEpoch(EPOCH_ZERO, prover), 182, "specific prover rewards");
    assertEq(feeAsset.balanceOf(economics.getBurnAddress()), 24, "burn");
    assertEq(plan.portalFeesToDistribute, 90, "portal distribution plan");
  }

  function test_finalizeEpochSettlementSharesLongestPrefixRewardsAcrossProvers() external {
    rewardDistributor.setCanonicalRollup(address(this));

    _setFeeHeader(1, 0, 0, 0);
    _setFeeHeader(2, 0, 0, 0);

    RewardBoostConfig memory config = economics.getRewardBoostConfig();
    economics.setActivityScore(prover, config.maxScore);
    economics.setActivityScore(otherProver, 0);

    uint256 proverShares = economics.getSharesFor(prover);
    uint256 otherProverShares = economics.getSharesFor(otherProver);

    feeAsset.mint(address(rewardDistributor), 202);
    bytes32[] memory fees = _fees(0, 0);
    EpochSettlementPlan memory plan = economics.getEpochSettlementPlan(2, fees, EPOCH_ZERO);
    feeAsset.mint(address(economics), plan.portalFeesToDistribute);
    uint256 checkpointRewards = plan.checkpointRewardsToClaim;
    rewardDistributor.claim(address(economics), checkpointRewards);

    economics.finalizeEpochSettlement(1, 2, prover, fees, EPOCH_ZERO, checkpointRewards);
    economics.finalizeEpochSettlement(1, 2, otherProver, fees, EPOCH_ZERO, 0);

    uint256 collectiveRewards = economics.getCollectiveProverRewardsForEpoch(EPOCH_ZERO);
    uint256 totalShares = proverShares + otherProverShares;
    assertEq(collectiveRewards, 136, "collective rewards");
    assertEq(
      economics.getSpecificProverRewardsForEpoch(EPOCH_ZERO, prover),
      proverShares * collectiveRewards / totalShares,
      "prover rewards"
    );
    assertEq(
      economics.getSpecificProverRewardsForEpoch(EPOCH_ZERO, otherProver),
      otherProverShares * collectiveRewards / totalShares,
      "other prover rewards"
    );
  }

  function test_finalizeEpochSettlementLongerReproofOnlySettlesNewCheckpointDelta() external {
    rewardDistributor.setCanonicalRollup(address(this));

    _setFeeHeader(1, 10, 2, 3);
    _setFeeHeader(2, 4, 1, 4);
    _setFeeHeader(3, 5, 3, 4);

    feeAsset.mint(address(rewardDistributor), 303);
    bytes32[] memory firstFees = _fees(60, 30);
    EpochSettlementPlan memory firstPlan = economics.getEpochSettlementPlan(2, firstFees, EPOCH_ZERO);
    feeAsset.mint(address(economics), firstPlan.portalFeesToDistribute);
    uint256 firstCheckpointRewards = firstPlan.checkpointRewardsToClaim;
    rewardDistributor.claim(address(economics), firstCheckpointRewards);
    economics.finalizeEpochSettlement(1, 2, prover, firstFees, EPOCH_ZERO, firstCheckpointRewards);

    assertEq(firstPlan.portalFeesToDistribute, 90, "first portal distribution");
    assertEq(economics.getCollectiveProverRewardsForEpoch(EPOCH_ZERO), 182, "first prover rewards");

    bytes32[] memory secondFees = _fees(60, 30, 50);
    EpochSettlementPlan memory secondPlan = economics.getEpochSettlementPlan(3, secondFees, EPOCH_ZERO);
    feeAsset.mint(address(economics), secondPlan.portalFeesToDistribute);
    uint256 secondCheckpointRewards = secondPlan.checkpointRewardsToClaim;
    rewardDistributor.claim(address(economics), secondCheckpointRewards);
    economics.finalizeEpochSettlement(1, 3, otherProver, secondFees, EPOCH_ZERO, secondCheckpointRewards);

    assertEq(economics.getLongestProvenLength(EPOCH_ZERO), 3, "longest proven length");
    assertEq(secondPlan.portalFeesToDistribute, 50, "second portal distribution delta");
    assertEq(economics.getSequencerRewards(sequencer), 134, "sequencer rewards");
    assertEq(economics.getCollectiveProverRewardsForEpoch(EPOCH_ZERO), 270, "prover rewards");
    assertEq(feeAsset.balanceOf(economics.getBurnAddress()), 39, "burn");
  }

  function test_finalizeEpochSettlementShorterProofOnlyRecordsSubmission() external {
    _setFeeHeader(1, 0, 0, 0);
    _setFeeHeader(2, 0, 0, 0);

    economics.finalizeEpochSettlement(1, 2, prover, _fees(0, 0), EPOCH_ZERO, 0);
    economics.finalizeEpochSettlement(1, 1, otherProver, _singleFee(0), EPOCH_ZERO, 0);

    assertEq(economics.getLongestProvenLength(EPOCH_ZERO), 2, "longest proven length");
    assertTrue(economics.getHasSubmitted(EPOCH_ZERO, 1, otherProver), "shorter proof recorded");
    assertGt(economics.getProverShares(EPOCH_ZERO, 1, otherProver), 0, "shorter proof shares");
    assertGt(economics.getSummedShares(EPOCH_ZERO, 1), 0, "shorter proof summed shares");
  }

  function test_storageGettersExposeStoredBoosterState() external {
    economics.setActivityScore(prover, 123);

    assertEq(economics.getStoredActivityScore(prover).value, 123, "stored score");
    assertEq(economics.getStoredActivityScore(prover).time, EPOCH_ZERO, "stored score epoch");
  }

  function test_finalizeEpochSettlementRevertsWhenProverSubmitsTwice() external {
    _setFeeHeader(1, 0, 0, 0);

    economics.finalizeEpochSettlement(1, 1, prover, _singleFee(0), EPOCH_ZERO, 0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__ProverHaveAlreadySubmitted.selector, prover, EPOCH_ZERO));
    economics.finalizeEpochSettlement(1, 1, prover, _singleFee(0), EPOCH_ZERO, 0);
  }

  function test_finalizeEpochSettlementRevertsWhenFeeIsBelowBurn() external {
    _setFeeHeader(1, 10, 2, 3);

    vm.expectRevert(abi.encodeWithSelector(Errors.Economics__FeeBelowCongestionBurn.selector, 19, 20));
    economics.finalizeEpochSettlement(1, 1, prover, _singleFee(19), EPOCH_ZERO, 0);
  }

  function test_getFeeHeaderRevertsAfterRoundaboutWrap() external {
    uint256 roundaboutSize = _roundaboutSize(economics);

    for (uint256 checkpointNumber = 1; checkpointNumber <= roundaboutSize + 1; checkpointNumber++) {
      _recordCheckpoint({
        _economics: economics,
        _checkpointNumber: checkpointNumber,
        _manaUsed: checkpointNumber * 1000 + 7,
        _congestionCost: 2,
        _proverCost: 3
      });
    }

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Economics__UnavailableFeeHeader.selector, 1, 1, roundaboutSize + 1, roundaboutSize + 1
      )
    );
    economics.getFeeHeader(1);
  }

  function test_settleCheckpointFeesRevertsWhenCheckpointBelongsToAnotherEconomics() external {
    EconomicsHarness replacement = new EconomicsHarness(address(this), address(this), feeAsset, _initArgs());
    uint256 roundaboutSize = _roundaboutSize(replacement);

    _recordCheckpoint({_economics: economics, _checkpointNumber: 1, _manaUsed: 5, _congestionCost: 2, _proverCost: 3});

    for (uint256 checkpointNumber = 2; checkpointNumber <= roundaboutSize + 1; checkpointNumber++) {
      _recordCheckpoint({
        _economics: replacement,
        _checkpointNumber: checkpointNumber,
        _manaUsed: 10 + checkpointNumber,
        _congestionCost: 20 + checkpointNumber,
        _proverCost: 30 + checkpointNumber
      });
    }

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Economics__UnavailableFeeHeader.selector, 1, 2, roundaboutSize + 1, roundaboutSize + 1
      )
    );
    replacement.settleCheckpointFees({_checkpointNumber: 1, _feeField: bytes32(uint256(100_000))});
  }

  function test_claimRewardsMarksClaimsAndClearsBalances() external {
    rewardDistributor.setCanonicalRollup(address(this));

    _setFeeHeader(1, 10, 2, 3);
    _setFeeHeader(2, 4, 1, 4);

    feeAsset.mint(address(rewardDistributor), 202);
    bytes32[] memory fees = _fees(60, 30);
    EpochSettlementPlan memory plan = economics.getEpochSettlementPlan(2, fees, EPOCH_ZERO);
    feeAsset.mint(address(economics), plan.portalFeesToDistribute);
    uint256 checkpointRewards = plan.checkpointRewardsToClaim;
    rewardDistributor.claim(address(economics), checkpointRewards);
    economics.finalizeEpochSettlement(1, 2, prover, fees, EPOCH_ZERO, checkpointRewards);

    uint256 sequencerRewards = economics.claimSequencerRewards(sequencer);
    assertEq(sequencerRewards, 86, "sequencer rewards claimed");
    assertEq(feeAsset.balanceOf(sequencer), 86, "sequencer balance");
    assertEq(economics.claimSequencerRewards(sequencer), 0, "sequencer rewards cleared");

    assertFalse(economics.getHasClaimed(prover, EPOCH_ZERO), "claim status before");
    vm.warp(block.timestamp + _claimDelay());

    Epoch[] memory epochs = new Epoch[](1);
    epochs[0] = EPOCH_ZERO;
    uint256 proverRewards = economics.claimProverRewards(prover, epochs);

    assertEq(proverRewards, 182, "prover rewards claimed");
    assertEq(feeAsset.balanceOf(prover), 182, "prover balance");
    assertTrue(economics.getHasClaimed(prover, EPOCH_ZERO), "claim status after");
    assertEq(economics.claimProverRewards(prover, epochs), 0, "prover rewards cleared");
  }

  function _initArgs() internal view returns (EconomicsInitArgs memory) {
    RewardConfig memory rewardConfig = TestConstants.getRewardConfig();
    rewardConfig.rewardDistributor = rewardDistributor;
    rewardConfig.checkpointReward = CHECKPOINT_REWARD.toUint96();
    rewardConfig.sequencerBps = Bps.wrap(SEQUENCER_BPS.toUint32());

    return EconomicsInitArgs({
      manaTarget: TestConstants.AZTEC_MANA_TARGET,
      provingCostPerMana: TestConstants.AZTEC_PROVING_COST_PER_MANA,
      initialEthPerFeeAsset: TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET,
      rewardConfig: rewardConfig,
      rewardBoostConfig: TestConstants.getRewardBoostConfig(),
      genesisTime: block.timestamp,
      aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
      aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
      aztecProofSubmissionEpochs: TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    });
  }

  function _setFeeHeader(uint256 _checkpointNumber, uint256 _manaUsed, uint256 _congestionCost, uint256 _proverCost)
    internal
  {
    economics.setFeeHeader(
      _checkpointNumber,
      FeeHeader({
        excessMana: 0,
        manaUsed: _manaUsed,
        ethPerFeeAsset: EthPerFeeAssetE12.unwrap(TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET),
        congestionCost: _congestionCost,
        proverCost: _proverCost
      })
    );
  }

  function _recordCheckpoint(
    EconomicsHarness _economics,
    uint256 _checkpointNumber,
    uint256 _manaUsed,
    uint256 _congestionCost,
    uint256 _proverCost
  ) internal {
    _economics.recordCheckpoint({
      _checkpointNumber: _checkpointNumber,
      _feeAssetPriceModifier: 0,
      _manaUsed: _manaUsed,
      _congestionCost: _congestionCost,
      _proverCost: _proverCost
    });
  }

  function _roundaboutSize(EconomicsHarness _economics) internal view returns (uint256) {
    return _economics.getEpochDuration() * (_economics.getProofSubmissionEpochs() + 1) + 1;
  }

  function _fees(uint256 _firstFee, uint256 _secondFee) internal view returns (bytes32[] memory) {
    bytes32[] memory fees = new bytes32[](4);
    fees[0] = _sequencerField();
    fees[1] = bytes32(_firstFee);
    fees[2] = _sequencerField();
    fees[3] = bytes32(_secondFee);
    return fees;
  }

  function _fees(uint256 _firstFee, uint256 _secondFee, uint256 _thirdFee) internal view returns (bytes32[] memory) {
    bytes32[] memory fees = new bytes32[](6);
    fees[0] = _sequencerField();
    fees[1] = bytes32(_firstFee);
    fees[2] = _sequencerField();
    fees[3] = bytes32(_secondFee);
    fees[4] = _sequencerField();
    fees[5] = bytes32(_thirdFee);
    return fees;
  }

  function _singleFee(uint256 _amount) internal view returns (bytes32[] memory) {
    bytes32[] memory fees = new bytes32[](2);
    fees[0] = _sequencerField();
    fees[1] = bytes32(_amount);
    return fees;
  }

  function _sequencerField() internal view returns (bytes32) {
    return bytes32(uint256(uint160(sequencer)));
  }

  function _claimDelay() internal pure returns (uint256) {
    uint256 epochs = TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS + 1;
    return epochs * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION;
  }
}
