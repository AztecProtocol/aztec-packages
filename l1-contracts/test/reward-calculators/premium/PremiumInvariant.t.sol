// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {MockStakingRegistry} from "@test/reward-calculators/premium/mocks/MockStakingRegistry.sol";
import {PremiumRollupBase} from "@test/reward-calculators/premium/PremiumRollupBase.sol";

/**
 * @notice Drives one premium position and an attacker through random sequences of stake (directly and through a
 *         provider), front-run and liquid deposits, flushes, exits, releases, claims, top-ups and refund recovery,
 *         on a real rollup and GSE.
 */
contract PremiumPositionHandler is Test {
  struct Key {
    G1Point pk1;
    G2Point pk2;
    G1Point pop;
  }

  Rollup internal immutable ROLLUP;
  TestERC20 internal immutable TOKEN;
  PremiumATP internal immutable ATP;
  PremiumATPStaker internal immutable STAKER;
  MockStakingRegistry internal immutable STAKING_REGISTRY;
  uint256 internal immutable VERSION;
  uint256 internal immutable THRESHOLD;
  address internal immutable OPERATOR;
  address internal immutable BENEFICIARY;
  address internal immutable ATTACKER;
  address internal immutable PROVIDER_ADMIN;

  Key[] internal keys;
  uint256 internal nextKey;
  address[] internal attesters;
  mapping(bytes32 action => uint256 count) public calls;

  constructor(
    Rollup _rollup,
    PremiumATP _atp,
    MockStakingRegistry _stakingRegistry,
    address _providerAdmin,
    address _attacker,
    Key[] memory _keys
  ) {
    ROLLUP = _rollup;
    TOKEN = TestERC20(address(_rollup.getStakingAsset()));
    ATP = _atp;
    STAKER = PremiumATPStaker(_atp.getStaker());
    STAKING_REGISTRY = _stakingRegistry;
    VERSION = _rollup.getVersion();
    THRESHOLD = _rollup.getActivationThreshold();
    OPERATOR = _atp.getOperator();
    BENEFICIARY = _atp.getBeneficiary();
    ATTACKER = _attacker;
    PROVIDER_ADMIN = _providerAdmin;
    for (uint256 i = 0; i < _keys.length; i++) {
      keys.push(_keys[i]);
    }
  }

  function stake() external {
    if (nextKey == keys.length) {
      return;
    }
    address attester = _newAttester();
    _stake(attester);
  }

  function stakeWithProvider() external {
    if (nextKey == keys.length) {
      return;
    }
    address attester = _newAttester();
    Key memory key = keys[nextKey - 1];
    MockStakingRegistry.KeyStore[] memory keyStores = new MockStakingRegistry.KeyStore[](1);
    keyStores[0] = MockStakingRegistry.KeyStore({
      attester: attester, publicKeyG1: key.pk1, publicKeyG2: key.pk2, proofOfPossession: key.pop
    });
    vm.prank(PROVIDER_ADMIN);
    STAKING_REGISTRY.addKeysToProvider(0, keyStores);
    vm.prank(OPERATOR);
    try STAKER.stakeWithProvider(VERSION, 0, 500, BENEFICIARY, false) {
      calls["stakeWithProvider"]++;
    } catch {}
  }

  /// @dev A liquid deposit by the attacker of a new attester, naming the genuine staker or the attacker.
  function liquidDeposit(bool _namingTheStaker) external {
    if (nextKey == keys.length) {
      return;
    }
    address attester = _newAttester();
    _liquidDeposit(attester, _namingTheStaker ? address(STAKER) : ATTACKER);
    calls["liquidDeposit"]++;
  }

  /// @dev The attacker copies the staker's pending deposit and lands first, naming the staker or itself.
  function frontRun(bool _namingTheStaker) external {
    if (nextKey == keys.length) {
      return;
    }
    address attester = _newAttester();
    _liquidDeposit(attester, _namingTheStaker ? address(STAKER) : ATTACKER);
    _stake(attester);
    calls["frontRun"]++;
  }

  /// @dev The operator or the attacker tries to deposit an attester the handler already used.
  function redeposit(uint256 _index, bool _byTheStaker) external {
    if (attesters.length == 0) {
      return;
    }
    address attester = attesters[_index % attesters.length];
    if (_byTheStaker) {
      _stake(attester);
    } else {
      _liquidDeposit(attester, address(STAKER));
    }
    calls["redeposit"]++;
  }

  function flush() external {
    vm.warp(block.timestamp + ROLLUP.getEpochDuration() * ROLLUP.getSlotDuration());
    try ROLLUP.flushEntryQueue() {
      calls["flush"]++;
    } catch {}
  }

  function initiateWithdraw(uint256 _index) external {
    if (attesters.length == 0) {
      return;
    }
    vm.prank(OPERATOR);
    try STAKER.initiateWithdraw(VERSION, attesters[_index % attesters.length]) {
      calls["initiateWithdraw"]++;
    } catch {}
  }

  function finalizeWithdraw(uint256 _index) external {
    if (attesters.length == 0) {
      return;
    }
    vm.warp(block.timestamp + Timestamp.unwrap(ROLLUP.getExitDelay()) + 1);
    try ROLLUP.finalizeWithdraw(attesters[_index % attesters.length]) {
      calls["finalizeWithdraw"]++;
    } catch {}
  }

  function release(uint256 _index) external {
    if (attesters.length == 0) {
      return;
    }
    address attester = attesters[_index % attesters.length];
    if (!STAKER.isAttester(attester)) {
      return;
    }
    vm.prank(OPERATOR);
    STAKER.release(attester);
    calls["release"]++;
  }

  function claim(uint256 _elapsed) external {
    vm.warp(block.timestamp + bound(_elapsed, 0, 120 days));
    if (ATP.getClaimable() == 0) {
      return;
    }
    vm.prank(BENEFICIARY);
    ATP.claim();
    calls["claim"]++;
  }

  function topUp(uint256 _amount) external {
    _amount = bound(_amount, 1, 5 * THRESHOLD);
    deal(address(TOKEN), address(ATP), TOKEN.balanceOf(address(ATP)) + _amount, true);
    calls["topUp"]++;
  }

  function returnTokensToATP() external {
    STAKER.returnTokensToATP();
    calls["returnTokensToATP"]++;
  }

  function getAttesters() external view returns (address[] memory) {
    return attesters;
  }

  function _stake(address _attester) internal {
    Key memory key = keys[_keyIndex(_attester)];
    vm.prank(OPERATOR);
    try STAKER.stake(VERSION, _attester, key.pk1, key.pk2, key.pop, false) {
      calls["stake"]++;
    } catch {}
  }

  function _liquidDeposit(address _attester, address _withdrawer) internal {
    Key memory key = keys[_keyIndex(_attester)];
    deal(address(TOKEN), ATTACKER, TOKEN.balanceOf(ATTACKER) + THRESHOLD, true);
    vm.startPrank(ATTACKER);
    TOKEN.approve(address(ROLLUP), THRESHOLD);
    try ROLLUP.deposit(_attester, _withdrawer, key.pk1, key.pk2, key.pop, false) {} catch {}
    vm.stopPrank();
  }

  function _newAttester() internal returns (address attester) {
    attester = _attesterOf(nextKey);
    nextKey++;
    attesters.push(attester);
  }

  function _attesterOf(uint256 _keyIndex) internal pure returns (address) {
    return address(uint160(uint256(keccak256(abi.encode("invariant attester", _keyIndex)))));
  }

  function _keyIndex(address _attester) internal view returns (uint256) {
    for (uint256 i = 0; i < nextKey; i++) {
      if (_attesterOf(i) == _attester) {
        return i;
      }
    }
    revert("unknown attester");
  }
}

/**
 * @notice For every position, at all times: `claimed + reserved <= allocation`, the reservation is exactly the sum
 *         of the recorded attesters' stakes, every premium-earning attester is recorded by the position's staker and
 *         has it as GSE withdrawer, premium-earning attesters x threshold <= allocation - claimed, and the
 *         beneficiary has received exactly what was claimed.
 * @dev Runs on a real GSE, which never lets an attester address register twice. The invariants do not rely on that:
 *      a re-registered attester would still need a record, and every record holds a reservation.
 */
contract PremiumInvariantTest is PremiumRollupBase {
  uint256 internal constant ALLOCATION_THRESHOLDS = 6;

  PremiumATP internal atp;
  PremiumATPStaker internal staker;
  PremiumPositionHandler internal handler;

  function setUp() public override {
    super.setUp();
    (atp, staker) = _position(ALLOCATION_THRESHOLDS);

    uint256 keyCount = fixtureData.sampleKeys.length;
    PremiumPositionHandler.Key[] memory handlerKeys = new PremiumPositionHandler.Key[](keyCount);
    for (uint256 i = 0; i < keyCount; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];
      handlerKeys[i] = PremiumPositionHandler.Key({pk1: key.pk1, pk2: key.pk2, pop: signRegistrationDigest(key.sk)});
    }
    handler = new PremiumPositionHandler(rollup, atp, stakingRegistry, providerAdmin, attacker, handlerKeys);
    targetContract(address(handler));
  }

  /// forge-config: default.invariant.runs = 64
  /// forge-config: default.invariant.depth = 48
  function invariant_PositionAccounting() external view {
    _assertInvariants();
  }

  /// forge-config: default.fuzz.runs = 128
  function test_FuzzRandomSequences(uint256 _seed) external {
    for (uint256 step = 0; step < 32; step++) {
      uint256 word = uint256(keccak256(abi.encode(_seed, step)));
      uint256 action = word % 13;
      uint256 arg = word >> 8;
      bool flag = (word >> 4) & 1 == 1;
      if (action == 0 || action == 1) {
        handler.stake();
      } else if (action == 2) {
        handler.stakeWithProvider();
      } else if (action == 3) {
        handler.liquidDeposit(flag);
      } else if (action == 4) {
        handler.frontRun(flag);
      } else if (action == 5) {
        handler.redeposit(arg, flag);
      } else if (action == 6 || action == 7) {
        handler.flush();
      } else if (action == 8) {
        handler.initiateWithdraw(arg);
      } else if (action == 9) {
        handler.finalizeWithdraw(arg);
      } else if (action == 10) {
        handler.release(arg);
      } else if (action == 11) {
        handler.claim(arg);
      } else if (flag) {
        handler.topUp(arg);
      } else {
        handler.returnTokensToATP();
      }
      _assertInvariants();
    }
  }

  function test_HandlerActionsTakeEffect() external {
    // The handler swallows reverts, so check that each action does what it says, or the invariants could hold
    // vacuously.
    handler.stake();
    handler.stake();
    handler.frontRun(true);
    handler.frontRun(false);
    handler.liquidDeposit(true);
    handler.stakeWithProvider();
    handler.flush();
    address[] memory attesters = handler.getAttesters();
    assertEq(handler.calls("stake"), 4);
    assertEq(handler.calls("stakeWithProvider"), 1);
    assertEq(_premiumCount(attesters), 4);
    assertEq(atp.getReserved(), 5 * threshold);
    assertEq(token.balanceOf(address(staker)), 2 * threshold);
    _assertInvariants();

    handler.returnTokensToATP();
    handler.initiateWithdraw(0);
    handler.finalizeWithdraw(0);
    handler.release(0);
    handler.release(3);
    assertEq(handler.calls("initiateWithdraw"), 1);
    assertEq(handler.calls("finalizeWithdraw"), 1);
    assertEq(handler.calls("release"), 2);
    assertEq(_premiumCount(attesters), 3);
    assertEq(atp.getReserved(), 3 * threshold);
    _assertInvariants();

    handler.topUp(threshold);
    vm.warp(unlockStart + LOCK);
    handler.claim(0);
    assertEq(handler.calls("claim"), 1);
    assertEq(atp.getClaimed(), 3 * threshold);
    // Claimed plus reserved is the whole allocation now: the staker cannot record anyone else.
    handler.redeposit(1, true);
    assertEq(handler.calls("stake"), 4);
    assertEq(atp.getReserved(), 3 * threshold);
    _assertInvariants();
  }

  function _premiumCount(address[] memory _attesters) internal view returns (uint256 count) {
    for (uint256 i = 0; i < _attesters.length; i++) {
      count += _rewardOf(_attesters[i]) == PREMIUM ? 1 : 0;
    }
  }

  function _assertInvariants() internal view {
    uint256 allocation = atp.getAllocation();
    uint256 claimed = atp.getClaimed();
    uint256 reserved = atp.getReserved();
    assertLe(claimed + reserved, allocation, "claimed + reserved > allocation");
    assertEq(token.balanceOf(beneficiary), claimed, "beneficiary received more than it claimed");

    address[] memory attesters = handler.getAttesters();
    uint256 recordedStake = 0;
    uint256 premiumCount = 0;
    for (uint256 i = 0; i < attesters.length; i++) {
      address attester = attesters[i];
      recordedStake += staker.getStake(attester);
      if (_rewardOf(attester) == PREMIUM) {
        premiumCount++;
        assertTrue(staker.isAttester(attester), "premium without a record");
        assertEq(gse.getWithdrawer(attester), address(staker), "premium without the staker as withdrawer");
        assertEq(staker.getStake(attester), threshold, "premium without a full reservation");
      }
    }
    assertEq(recordedStake, reserved, "reservation is not the sum of the recorded stakes");
    assertLe(premiumCount * threshold, allocation - claimed, "premium stake above the unclaimed allocation");
  }
}
