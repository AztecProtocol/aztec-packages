// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable comprehensive-interface

import {Rollup} from "@aztec/core/Rollup.sol";
import {Status} from "@aztec/core/interfaces/IStaking.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {GSE, IGSE} from "@aztec/governance/GSE.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {BN254Fixtures} from "@test/shared/BN254Fixtures.t.sol";
import {IStakingRegistry} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPFactory} from "@test/reward-calculators/premium/PremiumATPFactory.sol";
import {PremiumATPRegistry, UnlockSchedule} from "@test/reward-calculators/premium/PremiumATPRegistry.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {PremiumRewardCalculator} from "@test/reward-calculators/premium/PremiumRewardCalculator.sol";
import {MockSplitFactory, MockStakingRegistry} from "@test/reward-calculators/premium/mocks/MockStakingRegistry.sol";

/**
 * @notice Premium positions over a real rollup and a real `GSE` (not `GSEWithSkip`), so deposits need valid BLS
 *         proofs of possession and an attester address can never register twice on that GSE (it can on another).
 */
abstract contract PremiumRollupBase is BN254Fixtures {
  uint256 internal constant DEFAULT_REWARD = 50e18;
  uint256 internal constant CHECKPOINT_REWARD = 100e18;
  uint96 internal constant PREMIUM = 80e18;
  uint256 internal constant LOCK = 365 days;
  Epoch internal constant EPOCH = Epoch.wrap(3);

  address internal governance = makeAddr("governance");
  address internal foundation = makeAddr("foundation");
  address internal beneficiary = makeAddr("beneficiary");
  address internal operator = makeAddr("operator");
  address internal attacker = makeAddr("attacker");
  address internal providerAdmin = makeAddr("provider admin");

  TestERC20 internal token;
  GSE internal gse;
  Rollup internal rollup;
  IRegistry internal rollupRegistry;
  uint256 internal version;
  uint256 internal threshold;
  uint256 internal unlockStart;
  PremiumATPRegistry internal atpRegistry;
  MockStakingRegistry internal stakingRegistry;
  PremiumATPFactory internal factory;
  PremiumRewardCalculator internal calculator;

  uint256 internal nextKey;
  uint256 internal attesterCount;
  mapping(address attester => uint256 keyIndex) internal keyOf;

  function setUp() public virtual override {
    BN254Fixtures.setUp();

    RollupBuilder builder = new RollupBuilder(address(this));
    token = new TestERC20("staking", "STK", address(builder));
    vm.prank(address(builder));
    token.mint(address(builder), 1e18);
    gse = new GSE(address(this), token, TestConstants.ACTIVATION_THRESHOLD, TestConstants.EJECTION_THRESHOLD);
    builder.setTestERC20(token).setGSE(gse)
      .setStakingQueueConfig(
        StakingQueueConfig({
          bootstrapValidatorSetSize: 0,
          bootstrapFlushSize: 0,
          normalFlushSizeMin: 48,
          normalFlushSizeQuotient: 1,
          maxQueueFlushSize: 48
        })
      );
    _configureRollupBuilder(builder);
    builder.deploy();

    rollup = Rollup(address(builder.getConfig().rollup));
    rollupRegistry = IRegistry(address(builder.getConfig().registry));
    version = rollup.getVersion();
    threshold = rollup.getActivationThreshold();
    assertEq(address(rollup.getGSE()), address(gse));

    unlockStart = block.timestamp + 30 days;
    atpRegistry = new PremiumATPRegistry(
      foundation, UnlockSchedule({startTime: unlockStart, cliffDuration: 0, lockDuration: LOCK})
    );
    stakingRegistry = new MockStakingRegistry(token, new MockSplitFactory(), rollupRegistry);
    stakingRegistry.registerProvider(providerAdmin, 500, makeAddr("provider rewards"));
    factory = new PremiumATPFactory(
      foundation, token, atpRegistry, rollupRegistry, gse, IStakingRegistry(address(stakingRegistry))
    );
    calculator = new PremiumRewardCalculator(IGSE(address(gse)), governance);
    vm.prank(governance);
    calculator.setRegistryReward(address(atpRegistry), PREMIUM, address(factory));
  }

  /// @dev Hook to adjust the rollup configuration before it is deployed.
  function _configureRollupBuilder(RollupBuilder _builder) internal virtual {}

  function _mint(address _to, uint256 _amount) internal {
    deal(address(token), _to, token.balanceOf(_to) + _amount, true);
  }

  function _position(PremiumATPFactory _factory, uint256 _allocation)
    internal
    returns (PremiumATP atp, PremiumATPStaker staker)
  {
    _mint(address(_factory), _allocation);
    vm.prank(_factory.owner());
    atp = _factory.createATP(beneficiary, _allocation);
    vm.prank(beneficiary);
    atp.updateStakerOperator(operator);
    staker = PremiumATPStaker(atp.getStaker());
  }

  function _position(uint256 _thresholds) internal returns (PremiumATP atp, PremiumATPStaker staker) {
    return _position(factory, _thresholds * threshold);
  }

  /// @dev A fresh attester address with a fresh BLS key of the fixture.
  function _newAttester() internal returns (address attester) {
    attesterCount++;
    attester = makeAddr(string.concat("attester ", vm.toString(attesterCount)));
    keyOf[attester] = nextKey++;
    require(nextKey <= fixtureData.sampleKeys.length, "out of fixture keys");
  }

  function _keys(address _attester) internal view returns (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) {
    FixtureKey memory key = fixtureData.sampleKeys[keyOf[_attester]];
    return (key.pk1, key.pk2, signRegistrationDigest(key.sk));
  }

  function _stake(PremiumATPStaker _staker, address _attester) internal {
    (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) = _keys(_attester);
    vm.prank(operator);
    _staker.stake(version, _attester, pk1, pk2, pop, false);
  }

  function _stake(PremiumATPStaker _staker) internal returns (address attester) {
    attester = _newAttester();
    _stake(_staker, attester);
  }

  /// @dev A deposit of liquid tokens by `_depositor`, naming `_withdrawer`, with `_attester`'s key.
  function _liquidDeposit(address _depositor, address _attester, address _withdrawer) internal {
    (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) = _keys(_attester);
    _mint(_depositor, threshold);
    vm.startPrank(_depositor);
    token.approve(address(rollup), threshold);
    rollup.deposit(_attester, _withdrawer, pk1, pk2, pop, false);
    vm.stopPrank();
  }

  function _addProviderKey(address _attester) internal {
    (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) = _keys(_attester);
    MockStakingRegistry.KeyStore[] memory keyStores = new MockStakingRegistry.KeyStore[](1);
    keyStores[0] =
      MockStakingRegistry.KeyStore({attester: _attester, publicKeyG1: pk1, publicKeyG2: pk2, proofOfPossession: pop});
    vm.prank(providerAdmin);
    stakingRegistry.addKeysToProvider(0, keyStores);
  }

  function _flush() internal {
    vm.warp(block.timestamp + rollup.getEpochDuration() * rollup.getSlotDuration());
    rollup.flushEntryQueue();
    assertEq(rollup.getEntryQueueLength(), 0, "entry queue not flushed");
  }

  /// @dev Exits `_attester` through `_staker`, to its position, and finalizes the exit.
  function _exit(PremiumATPStaker _staker, address _attester) internal {
    vm.prank(operator);
    _staker.initiateWithdraw(version, _attester);
    assertTrue(rollup.getStatus(_attester) == Status.EXITING);
    vm.warp(block.timestamp + Timestamp.unwrap(rollup.getExitDelay()) + 1);
    _staker.finalizeWithdraw(version, _attester);
  }

  function _rewardOf(address _attester) internal view returns (uint256) {
    address[] memory proposers = new address[](1);
    proposers[0] = _attester;
    return calculator.getSequencerRewards(EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD)[0];
  }
}
