// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {FakeGSE} from "@test/reward-calculators/mocks/FakeGSE.sol";
import {IStakingRegistry} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPFactory} from "@test/reward-calculators/premium/PremiumATPFactory.sol";
import {PremiumATPRegistry, UnlockSchedule} from "@test/reward-calculators/premium/PremiumATPRegistry.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {PremiumRewardCalculator} from "@test/reward-calculators/premium/PremiumRewardCalculator.sol";
import {MockRollupRegistry, MockStakingRollup} from "@test/reward-calculators/premium/mocks/PremiumMocks.sol";

/**
 * @notice Genuine positions, factories and the premium calculator over a fake GSE and a rollup stand-in that only
 *         queues deposits, for unit tests that need any withdrawer they like.
 */
abstract contract PremiumUnitBase is Test {
  uint256 internal constant DEFAULT_REWARD = 50e18;
  uint256 internal constant CHECKPOINT_REWARD = 100e18;
  uint96 internal constant PREMIUM = 80e18;
  uint96 internal constant REDUCED = 10e18;
  uint256 internal constant THRESHOLD = 100e18;
  uint256 internal constant ALLOCATION = 4 * THRESHOLD;
  uint256 internal constant UNLOCK_START = 1_000_000;
  uint256 internal constant CLIFF = 100_000;
  uint256 internal constant LOCK = 1_000_000;
  Epoch internal constant EPOCH = Epoch.wrap(3);
  // Return data larger than any probe accepts, yet small enough that returning it fits the probe stipend. Larger
  // return bombs (64 KiB and up) run out of gas expanding memory inside the probe instead of returning.
  uint256 internal constant SUCCESSFUL_RETURN_BOMB_SIZE = 16 * 1024;

  address internal governance = makeAddr("governance");
  address internal foundation = makeAddr("foundation");
  address internal beneficiary = makeAddr("beneficiary");
  address internal operator = makeAddr("operator");
  address internal attacker = makeAddr("attacker");

  TestERC20 internal token;
  MockStakingRollup internal rollup;
  MockRollupRegistry internal rollupRegistry;
  FakeGSE internal gse;
  PremiumATPRegistry internal registry;
  PremiumATPFactory internal factory;
  PremiumRewardCalculator internal calculator;

  uint256 internal positionCount;

  function setUp() public virtual {
    token = new TestERC20("staking", "STK", address(this));
    gse = new FakeGSE();
    rollup = new MockStakingRollup(token, THRESHOLD, address(gse));
    rollupRegistry = new MockRollupRegistry(rollup);
    (registry, factory) = _deployFactory(foundation);
    calculator = new PremiumRewardCalculator(IGSE(address(gse)), governance);
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), PREMIUM, address(factory));
  }

  function _deployFactory(address _owner)
    internal
    returns (PremiumATPRegistry atpRegistry, PremiumATPFactory atpFactory)
  {
    return _deployFactoryOn(_owner, rollupRegistry);
  }

  /// @dev A registry and a factory bound to the shared GSE whose stakers deposit into `_rollupRegistry`'s rollup.
  function _deployFactoryOn(address _owner, MockRollupRegistry _rollupRegistry)
    internal
    returns (PremiumATPRegistry atpRegistry, PremiumATPFactory atpFactory)
  {
    atpRegistry = new PremiumATPRegistry(
      _owner, UnlockSchedule({startTime: UNLOCK_START, cliffDuration: CLIFF, lockDuration: LOCK})
    );
    atpFactory = new PremiumATPFactory(
      _owner, token, atpRegistry, IRegistry(address(_rollupRegistry)), IGSE(address(gse)), IStakingRegistry(address(0))
    );
  }

  /// @dev Creates a position of `_factory` with `_allocation`, for the shared beneficiary and operator.
  function _position(PremiumATPFactory _factory, uint256 _allocation)
    internal
    returns (PremiumATP atp, PremiumATPStaker staker)
  {
    token.mint(address(_factory), _allocation);
    vm.prank(_factory.owner());
    atp = _factory.createATP(beneficiary, _allocation);
    vm.prank(beneficiary);
    atp.updateStakerOperator(operator);
    staker = PremiumATPStaker(atp.getStaker());
  }

  function _position() internal returns (PremiumATP atp, PremiumATPStaker staker) {
    return _position(factory, ALLOCATION);
  }

  /// @dev Stakes a fresh attester through `_staker` and registers it in the fake GSE with the staker as withdrawer,
  ///      as a flushed deposit would.
  function _stake(PremiumATPStaker _staker) internal returns (address attester) {
    attester = _newAttester();
    _stake(_staker, attester);
  }

  function _stake(PremiumATPStaker _staker, address _attester) internal {
    vm.prank(operator);
    _staker.stake(1, _attester, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
    gse.setWithdrawer(_attester, address(_staker));
  }

  function _newAttester() internal returns (address) {
    positionCount++;
    return makeAddr(string.concat("attester ", vm.toString(positionCount)));
  }

  function _rewardOf(address _attester) internal view returns (uint256) {
    return _rewardOf(_attester, DEFAULT_REWARD);
  }

  function _rewardOf(address _attester, uint256 _defaultReward) internal view returns (uint256) {
    address[] memory proposers = new address[](1);
    proposers[0] = _attester;
    uint256[] memory rewards = calculator.getSequencerRewards(EPOCH, proposers, _defaultReward, CHECKPOINT_REWARD);
    assertEq(rewards.length, 1);
    return rewards[0];
  }

  function _rewardsOf(address[] memory _proposers) internal view returns (uint256[] memory) {
    return calculator.getSequencerRewards(EPOCH, _proposers, DEFAULT_REWARD, CHECKPOINT_REWARD);
  }

  /// @dev Calls `_selector` on `_target` with `_gas`, like a probe, without copying the return data, and returns
  ///      whether the call succeeded and how much data it returned.
  function _rawProbe(address _target, bytes4 _selector, uint256 _gas)
    internal
    view
    returns (bool success, uint256 size)
  {
    bytes memory data = abi.encodeWithSelector(_selector);
    assembly {
      success := staticcall(_gas, _target, add(data, 0x20), mload(data), 0, 0)
      size := returndatasize()
    }
  }
}
