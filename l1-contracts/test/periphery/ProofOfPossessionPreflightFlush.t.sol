// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IStakingCore, IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IBn254LibWrapper} from "@aztec/governance/interfaces/IBn254LibWrapper.sol";
import {ProofOfPossessionPreflight} from "@aztec/periphery/ProofOfPossessionPreflight.sol";
import {PopPreflightStatus} from "@aztec/periphery/interfaces/IProofOfPossessionPreflight.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {GSEWithSkip} from "@test/GSEWithSkip.sol";
import {BN254Fixtures} from "@test/shared/BN254Fixtures.t.sol";
import {ProofOfPossessionPreflightBase} from "./ProofOfPossessionPreflight.t.sol";

// solhint-disable comprehensive-interface

/**
 * @notice What happens at `flushEntryQueue` to a key the preflight reports as `OverBudget`.
 *
 *         GSE propagates the wrapper's revert data, and the flush refunds a failed deposit only when that data is
 *         non-empty; empty revert data is taken as the flush running out of gas and reverts it. A key just over the
 *         cap runs out of gas in the final pairing precompile, which `BN254Lib` reports with a non-empty error, so the
 *         deposit is refunded. A key needing more than about one pairing's worth of gas above the cap can run out of
 *         gas outside a precompile, and then the whole flush reverts.
 */
contract ProofOfPossessionPreflightFlushTest is ProofOfPossessionPreflightBase {
  /**
   * Below this distance from a key's minimal cap, the wrapper only runs out of gas in the pairing precompile. The
   * pairing check costs about 113k gas; the margin leaves room for gas schedule changes.
   */
  uint256 internal constant PAIRING_MARGIN = 100_000;

  IStaking internal staking;
  uint256 internal epochSeconds;

  function setUp() public override(ProofOfPossessionPreflightBase) {
    BN254Fixtures.setUp();

    RollupBuilder builder = new RollupBuilder(address(this)).setSlashingQuorum(1).setSlashingRoundSize(1);
    builder.deploy();
    Rollup rollup = builder.getConfig().rollup;

    staking = IStaking(address(rollup));
    stakingAsset = builder.getConfig().testERC20;
    gse = staking.getGSE();
    instance = address(rollup);
    GSEWithSkip(address(gse)).setCheckProofOfPossession(true);
    preflight = new ProofOfPossessionPreflight();

    vm.prank(rollup.owner());
    rollup.updateStakingQueueConfig(
      StakingQueueConfig({
        bootstrapValidatorSetSize: 0,
        bootstrapFlushSize: 0,
        normalFlushSizeMin: 1,
        normalFlushSizeQuotient: 1,
        maxQueueFlushSize: 1
      })
    );
    epochSeconds = rollup.getEpochDuration() * rollup.getSlotDuration();
  }

  /// @notice A key that needs up to `PAIRING_MARGIN` gas more than the cap is refunded, and the flush goes through.
  function testFuzz_OverBudgetKeyIsRefundedAtFlush(uint256 _below) external {
    RegistrationTuple memory t = _sampleKeyTuple(0);
    _below = bound(_below, 1, PAIRING_MARGIN);
    _setCap(_minimalCap(t) - _below);
    assertEq(uint8(_preflight(t).status), uint8(PopPreflightStatus.OverBudget), "status");

    address attester = _enqueue(t);
    uint256 withdrawerBalance = stakingAsset.balanceOf(attester);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.FailedDeposit(attester, attester, t.pk1, t.pk2, t.sig);
    staking.flushEntryQueue{gas: 15_000_000}();

    assertEq(stakingAsset.balanceOf(attester), withdrawerBalance + gse.ACTIVATION_THRESHOLD(), "not refunded");
    assertEq(staking.getEntryQueueLength(), 0, "still queued");
    assertEq(staking.getActiveAttesterCount(), 0, "attester active");
  }

  /**
   * @notice A key that needs far more gas than the cap can make the wrapper run out of gas outside a precompile. GSE
   *         then reverts with empty data and the flush reverts instead of refunding, blocking the queue until the cap
   *         is raised. The preflight still reports `OverBudget`.
   */
  function test_FarOverBudgetKeyRevertsTheFlush() external {
    RegistrationTuple memory t = _sampleKeyTuple(0);
    uint256 cap = _emptyRevertCapBelow(t, _minimalCap(t) - PAIRING_MARGIN);
    _setCap(cap);
    assertEq(uint8(_preflight(t).status), uint8(PopPreflightStatus.OverBudget), "status");

    _enqueue(t);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__DepositOutOfGas.selector));
    staking.flushEntryQueue{gas: 15_000_000}();

    _setCap(_minimalCap(t));
    vm.warp(block.timestamp + epochSeconds);
    staking.flushEntryQueue{gas: 15_000_000}();
    assertEq(staking.getActiveAttesterCount(), 1, "not active after raising the cap");
  }

  /// @notice Queues a deposit for a fresh attester that is also its withdrawer.
  function _enqueue(RegistrationTuple memory _t) internal returns (address attester) {
    attester = address(uint160(uint256(keccak256(abi.encode("attester", attesterNonce++)))));
    uint256 amount = gse.ACTIVATION_THRESHOLD();
    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(this), amount);
    stakingAsset.approve(address(staking), amount);
    staking.deposit(attester, attester, _t.pk1, _t.pk2, _t.sig, true);
  }

  /// @notice The largest cap at or below `_from` at which the wrapper reverts with empty data.
  function _emptyRevertCapBelow(RegistrationTuple memory _t, uint256 _from) internal view returns (uint256) {
    bytes memory data = abi.encodeCall(IBn254LibWrapper.proofOfPossession, (_t.pk1, _t.pk2, _t.sig));
    for (uint256 cap = _from; cap > 0; cap--) {
      (bool success, bytes memory ret) = address(_wrapper()).staticcall{gas: cap}(data);
      if (!success && ret.length == 0) {
        return cap;
      }
    }
    return 0;
  }
}
