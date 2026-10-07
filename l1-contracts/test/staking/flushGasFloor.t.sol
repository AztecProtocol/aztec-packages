// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable ordering

pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingLib} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {DepositArgs} from "@aztec/core/libraries/StakingQueue.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {RegistrationData, RegistrationDataLib} from "@test/shared/RegistrationData.sol";

/**
 * Checks the per-deposit gas floor in `flushEntryQueue`: whatever gas limit the flush caller picks, a valid queued
 * registration is either activated or the whole flush reverts. It is never refunded and removed because the
 * proof-of-possession check received less than the GSE's configured gas cap.
 *
 * Uses real BLS registrations (script/registration_data.json) and the real proof-of-possession check. The floor is
 * sized for the Glamsterdam gas schedule; the same tests run under the repo default (`prague`) and `osaka`, where the
 * floor is larger than needed: past it, honest flushes activate and no gas limit refunds a valid entry. Run them with
 * `--evm-version amsterdam` (Foundry >= 1.8, plus `--gas-limit 60000000000` for the sweeps) to exercise EIP-8037
 * state gas, where an unguarded flush can be gas-shaped into a refund.
 */
contract FlushGasFloorTest is TestBase {
  uint256 internal constant N = 8;
  uint256 internal constant AMPLE_GAS = 15_000_000;

  uint8 internal constant ACTIVATED = 0;
  uint8 internal constant FLOOR_REVERT = 1;
  uint8 internal constant DEPOSIT_OUT_OF_GAS = 2;
  uint8 internal constant OUT_OF_GAS = 3;

  IInstance internal INSTANCE;
  GSE internal GSE_;
  TestERC20 internal STAKING_ASSET;
  RegistrationData[] internal regs;
  address internal flusher = makeAddr("flusher");

  struct FlushState {
    uint256 queueLength;
    bytes32 queueContents;
    uint256 activeAttesters;
    uint256 availableFlushes;
    uint256 rollupBalance;
    uint256 gseAllowance;
    uint256 withdrawersBalance;
  }

  function setUp() public {
    RegistrationData[] memory r = RegistrationDataLib.load(vm, N);
    for (uint256 i = 0; i < N; i++) {
      regs.push(r[i]);
    }

    RollupBuilder b = new RollupBuilder(address(this)).setUpdateOwnerships(false).setCheckProofOfPossession(true)
      .setStakingQueueConfig(
        StakingQueueConfig({
          bootstrapValidatorSetSize: 0,
          bootstrapFlushSize: 0,
          normalFlushSizeMin: 4,
          normalFlushSizeQuotient: 400,
          maxQueueFlushSize: 4
        })
      ).deploy();
    INSTANCE = IInstance(address(b.getConfig().rollup));
    GSE_ = INSTANCE.getGSE();
    STAKING_ASSET = b.getConfig().testERC20;
    vm.prank(STAKING_ASSET.owner());
    STAKING_ASSET.addMinter(address(this));
  }

  function test_floorFormula() external pure {
    // The constants as derived for the `amsterdam` EVM: about 1.125M at the default cap and 1.9M at a 1M cap.
    assertEq(StakingLib.getFlushDepositGasFloor(250_000), 1_124_159);
    assertEq(StakingLib.getFlushDepositGasFloor(300_000), 1_175_759);
    assertEq(StakingLib.getFlushDepositGasFloor(1_000_000), 1_898_158);
    // A uint64 cap never overflows the uint256 arithmetic.
    assertGt(StakingLib.getFlushDepositGasFloor(type(uint64).max), uint256(type(uint64).max));
  }

  /// forge-config: default.isolate = true
  function test_RevertWhen_GasBelowFloor_flushN() external {
    _queue(0, 1);
    _assertFloorRevertLeavesStateUnchanged(_floor() - 1, false, 1);
  }

  /// forge-config: default.isolate = true
  function test_RevertWhen_GasBelowFloor_flushAll() external {
    _queue(0, 1);
    _assertFloorRevertLeavesStateUnchanged(_floor() - 1, true, 0);
  }

  /// The exact boundary: one gas less than the smallest limit that passes the check leaves exactly
  /// `required - 1` at the check, and no limit at or just above the boundary refunds the valid entry.
  /// forge-config: default.isolate = true
  function test_floorBoundary() external {
    _queue(0, 1);
    uint256 required = _floor();
    uint256 boundary = _findFloorBoundary(false, 1, required);

    (bool ok, bytes memory ret) = _probe(boundary - 1, false, 1);
    assertFalse(ok, "below boundary succeeds");
    (uint256 req, uint256 available) = _decodeFloorRevert(ret);
    assertEq(req, required, "required");
    assertEq(available, required - 1, "available at boundary - 1");

    for (uint256 g = boundary; g <= boundary + 3000; g += 7) {
      _assertActivatesOrReverts(g, false, 1, 1);
    }
  }

  /// forge-config: default.isolate = true
  function test_gasSweep_flushN() external {
    _queue(0, 1);
    _sweep(false, 1, 1);
  }

  /// forge-config: default.isolate = true
  function test_gasSweep_flushAll() external {
    _queue(0, 1);
    _sweep(true, 0, 1);
  }

  /// forge-config: default.isolate = true
  function test_gasSweep_eachKey() external {
    _queue(0, N);
    for (uint256 i = 0; i < N; i++) {
      // Coarser than the single-key sweeps; every key gets the same outcome guarantee.
      uint256 top = _minSuccessGas(false, 1);
      for (uint256 g = 200_000; g <= top + 50_000; g += 25_000) {
        _assertActivatesOrReverts(g, false, 1, 1);
      }
      _flushAndAdvance(1);
    }
    assertEq(INSTANCE.getActiveAttesterCount(), N, "all keys activated");
  }

  /// The tightest cap the head key's verification fits in: any shortfall in the floor would starve it.
  /// forge-config: default.isolate = true
  function test_tightCap_floorGuaranteesFullCap() external {
    _queue(0, 1);
    uint256 tightCap = _minCapThatActivates();
    _setCap(tightCap);
    uint256 required = _floor();
    uint256 boundary = _findFloorBoundary(false, 1, required);
    for (uint256 g = boundary; g <= boundary + 3000; g += 11) {
      _assertActivatesOrReverts(g, false, 1, 1);
    }
    uint256 top = _minSuccessGas(false, 1) + 20_000;
    for (uint256 g = boundary; g <= top; g += 10_000) {
      _assertActivatesOrReverts(g, false, 1, 1);
    }
    emit log_named_uint("tight cap", tightCap);
  }

  /// forge-config: default.isolate = true
  function test_RevertWhen_LaterEntryBelowFloor_flushN() external {
    _queue(0, 3);
    _assertLaterEntryHitsFloor(false, 2, 2);
    _assertLaterEntryHitsFloor(false, 3, 3);
  }

  /// forge-config: default.isolate = true
  function test_RevertWhen_LaterEntryBelowFloor_flushAll() external {
    _queue(0, 3);
    // flushEntryQueue() dequeues all three (flush size 4), so the third entry is the last to reach the check.
    _assertLaterEntryHitsFloor(true, 0, 3);
  }

  /// forge-config: default.isolate = true
  function test_gasSweep_multiEntry() external {
    _queue(0, 3);
    uint256 top = _minSuccessGas(false, 3);
    for (uint256 g = 200_000; g <= top + 50_000; g += 40_000) {
      _assertActivatesOrReverts(g, false, 3, 3);
    }
    for (uint256 g = 200_000; g <= top + 50_000; g += 40_000) {
      _assertActivatesOrReverts(g, true, 0, 3);
    }
  }

  /// A genuinely invalid entry ahead of valid ones in the same batch is refunded on the way to them. Whatever the
  /// gas limit, the valid entries are either all activated or the whole flush reverts: the refund of the invalid
  /// entry never cascades into a valid entry being refunded.
  /// forge-config: default.isolate = true
  function test_gasSweep_invalidHeadThenValid() external {
    RegistrationData memory bad = regs[0];
    bad.proofOfPossession = regs[1].proofOfPossession;
    _queueReg(bad, _withdrawer(0));
    _queue(1, 3);
    uint256 at = INSTANCE.getActivationThreshold();
    uint256 top = _minSuccessGas(true, 0) + 50_000;
    uint256 activated;
    for (uint256 g = 200_000; g <= top; g += 5000) {
      FlushState memory before = _state();
      uint256 snap = vm.snapshotState();
      (bool ok, bytes memory ret) = _tryFlush(g, true, 0);
      if (ok) {
        assertEq(INSTANCE.getActiveAttesterCount(), before.activeAttesters + 2, "both valid entries activated");
        assertEq(INSTANCE.getEntryQueueLength(), 0, "queue drained");
        assertEq(STAKING_ASSET.balanceOf(_withdrawer(0)), at, "invalid entry refunded");
        assertEq(
          STAKING_ASSET.balanceOf(_withdrawer(1)) + STAKING_ASSET.balanceOf(_withdrawer(2)), 0, "valid entry refunded"
        );
        activated++;
      } else {
        _assertStateEq(_state(), before);
        bool known =
          ret.length == 0 || bytes4(ret) == Errors.Staking__InsufficientFlushGas.selector
          || bytes4(ret) == Errors.Staking__DepositOutOfGas.selector;
        assertTrue(known, "unexpected revert data");
      }
      vm.revertToState(snap);
    }
    assertGt(activated, 0, "nothing activated");
  }

  /// forge-config: default.isolate = true
  function test_capRaised300k() external {
    _assertCapRaisedKeepsValidEntries(300_000);
  }

  /// forge-config: default.isolate = true
  function test_capRaised1M() external {
    _assertCapRaisedKeepsValidEntries(1_000_000);
  }

  /// forge-config: default.isolate = true
  function test_capLowered() external {
    _queue(0, 1);
    uint256 defaultFloor = _floor();
    uint256 defaultBoundary = _findFloorBoundary(false, 1, defaultFloor);
    _setCap(200_000);
    uint256 required = _floor();
    assertLt(required, defaultFloor, "lower cap, lower floor");
    _assertFloorRevertLeavesStateUnchanged(required - 1, false, 1);
    // The smallest gas limit that passes the check moves down with the floor. The flush runs in an external library
    // reached by delegatecall, so the transaction limit carries the floor change through one more 63/64 step.
    uint256 boundary = _findFloorBoundary(false, 1, required);
    assertApproxEqAbs(defaultBoundary - boundary, (defaultFloor - required) * 64 / 63, 2, "boundary follows the cap");
    _sweep(false, 1, 1);
  }

  /// forge-config: default.isolate = true
  function test_RevertWhen_CapAbsurdlyLarge() external {
    _queue(0, 2);
    _setCap(type(uint64).max);
    uint256 required = StakingLib.getFlushDepositGasFloor(type(uint64).max);
    assertEq(_floor(), required);

    for (uint256 k = 0; k < 2; k++) {
      FlushState memory before = _state();
      (bool ok, bytes memory ret) = _tryFlush(AMPLE_GAS, k == 1, 1);
      assertFalse(ok, "flush with an absurd cap succeeds");
      (uint256 req,) = _decodeFloorRevert(ret);
      assertEq(req, required, "required");
      _assertStateEq(_state(), before);
    }

    // Lowering the cap again unblocks the queue.
    _setCap(250_000);
    _flushAndAdvance(2);
    assertEq(INSTANCE.getActiveAttesterCount(), 2, "activated after the cap is lowered");
  }

  /// forge-config: default.isolate = true
  function test_invalidProofOfPossession_refundedAndQueueProgresses() external {
    RegistrationData memory bad = regs[0];
    bad.proofOfPossession = regs[1].proofOfPossession;
    _queueReg(bad, _withdrawer(0));
    _queue(1, 2);
    _assertRefundsHeadAndActivatesRest();
  }

  /// forge-config: default.isolate = true
  function test_alreadyRegisteredAttester_refundedAndQueueProgresses() external {
    _queue(0, 1);
    _flushAndAdvance(1);
    assertEq(INSTANCE.getActiveAttesterCount(), 1);
    // Same attester again, so the GSE rejects it as already registered.
    _queueReg(regs[0], _withdrawer(0));
    _queue(1, 2);
    _assertRefundsHeadAndActivatesRest();
    assertEq(INSTANCE.getActiveAttesterCount(), 2);
  }

  /// forge-config: default.isolate = true
  function test_reusedPublicKey_refundedAndQueueProgresses() external {
    _queue(0, 1);
    _flushAndAdvance(1);
    // A different attester presenting a key the GSE has already seen.
    RegistrationData memory reused = regs[0];
    reused.attester = makeAddr("reused");
    _queueReg(reused, _withdrawer(0));
    _queue(1, 2);
    _assertRefundsHeadAndActivatesRest();
  }

  function _withdrawer(uint256 _i) internal pure returns (address) {
    return address(uint160(0xF100D000 + _i));
  }

  function _queueReg(RegistrationData memory _r, address _w) internal {
    uint256 at = INSTANCE.getActivationThreshold();
    STAKING_ASSET.mint(address(this), at);
    STAKING_ASSET.approve(address(INSTANCE), at);
    INSTANCE.deposit(_r.attester, _w, _r.publicKeyInG1, _r.publicKeyInG2, _r.proofOfPossession, true);
  }

  function _queue(uint256 _from, uint256 _to) internal {
    for (uint256 i = _from; i < _to; i++) {
      _queueReg(regs[i], _withdrawer(i));
    }
  }

  function _floor() internal view returns (uint256) {
    return StakingLib.getFlushDepositGasFloor(GSE_.proofOfPossessionGasLimit());
  }

  function _setCap(uint256 _cap) internal {
    vm.prank(GSE_.owner());
    GSE_.setProofOfPossessionGasLimit(uint64(_cap));
  }

  function _flushAndAdvance(uint256 _n) internal {
    vm.prank(flusher);
    INSTANCE.flushEntryQueue{gas: AMPLE_GAS}(_n);
    vm.warp(block.timestamp + INSTANCE.getEpochDuration() * INSTANCE.getSlotDuration());
  }

  function _tryFlush(uint256 _gas, bool _all, uint256 _n) internal returns (bool ok, bytes memory ret) {
    bytes memory data =
      _all ? abi.encodeWithSignature("flushEntryQueue()") : abi.encodeWithSignature("flushEntryQueue(uint256)", _n);
    vm.prank(flusher);
    (ok, ret) = address(INSTANCE).call{gas: _gas}(data);
  }

  /// `_tryFlush` from a snapshot that is restored afterwards.
  function _probe(uint256 _gas, bool _all, uint256 _n) internal returns (bool ok, bytes memory ret) {
    uint256 snap = vm.snapshotState();
    (ok, ret) = _tryFlush(_gas, _all, _n);
    vm.revertToState(snap);
  }

  function _decodeFloorRevert(bytes memory _ret) internal pure returns (uint256 required, uint256 available) {
    require(_ret.length == 68, "not a floor revert");
    require(bytes4(_ret) == Errors.Staking__InsufficientFlushGas.selector, "not a floor revert");
    assembly {
      required := mload(add(_ret, 36))
      available := mload(add(_ret, 68))
    }
  }

  function _withdrawersBalance() internal view returns (uint256 sum) {
    for (uint256 i = 0; i < N; i++) {
      sum += STAKING_ASSET.balanceOf(_withdrawer(i));
    }
  }

  function _state() internal view returns (FlushState memory s) {
    s.queueLength = INSTANCE.getEntryQueueLength();
    bytes memory contents;
    for (uint256 i = 0; i < s.queueLength; i++) {
      contents = abi.encode(contents, INSTANCE.getEntryQueueAt(i));
    }
    s.queueContents = keccak256(contents);
    s.activeAttesters = INSTANCE.getActiveAttesterCount();
    s.availableFlushes = INSTANCE.getAvailableValidatorFlushes();
    s.rollupBalance = STAKING_ASSET.balanceOf(address(INSTANCE));
    s.gseAllowance = STAKING_ASSET.allowance(address(INSTANCE), address(GSE_));
    s.withdrawersBalance = _withdrawersBalance();
  }

  function _assertStateEq(FlushState memory _a, FlushState memory _b) internal pure {
    assertEq(_a.queueLength, _b.queueLength, "queue length");
    assertEq(_a.queueContents, _b.queueContents, "queue contents");
    assertEq(_a.activeAttesters, _b.activeAttesters, "active attesters");
    assertEq(_a.availableFlushes, _b.availableFlushes, "available flushes");
    assertEq(_a.rollupBalance, _b.rollupBalance, "rollup balance");
    assertEq(_a.gseAllowance, _b.gseAllowance, "gse allowance");
    assertEq(_a.withdrawersBalance, _b.withdrawersBalance, "withdrawer balances");
  }

  /// Runs one flush from a snapshot and classifies it. A success must activate exactly `_expected` entries and
  /// refund nobody; a failure must leave the state untouched and be the floor revert, the existing out-of-gas
  /// revert, or the transaction running out of gas.
  function _assertActivatesOrReverts(uint256 _gas, bool _all, uint256 _n, uint256 _expected)
    internal
    returns (uint8 kind)
  {
    FlushState memory before = _state();
    uint256 snap = vm.snapshotState();
    (bool ok, bytes memory ret) = _tryFlush(_gas, _all, _n);
    FlushState memory afterwards = _state();
    if (ok) {
      assertEq(afterwards.activeAttesters, before.activeAttesters + _expected, "success without activation");
      assertEq(afterwards.queueLength, before.queueLength - _expected, "dequeued");
      assertEq(afterwards.withdrawersBalance, before.withdrawersBalance, "valid entry refunded");
      kind = ACTIVATED;
    } else {
      _assertStateEq(afterwards, before);
      if (ret.length == 0) {
        kind = OUT_OF_GAS;
      } else if (bytes4(ret) == Errors.Staking__InsufficientFlushGas.selector) {
        kind = FLOOR_REVERT;
      } else if (bytes4(ret) == Errors.Staking__DepositOutOfGas.selector) {
        kind = DEPOSIT_OUT_OF_GAS;
      } else {
        emit log_named_bytes("unexpected revert", ret);
        assertTrue(false, "unexpected revert data");
      }
    }
    vm.revertToState(snap);
  }

  function _assertFloorRevertLeavesStateUnchanged(uint256 _gas, bool _all, uint256 _n) internal {
    FlushState memory before = _state();
    (bool ok, bytes memory ret) = _tryFlush(_gas, _all, _n);
    assertFalse(ok, "flush below the floor succeeds");
    (uint256 required, uint256 available) = _decodeFloorRevert(ret);
    assertEq(required, _floor(), "required");
    assertLt(available, required, "available");
    _assertStateEq(_state(), before);
  }

  /// Gas from the start of the flush to the first entry's check: a flush that fails at the first check.
  function _gasBeforeFirstCheck(bool _all, uint256 _n) internal returns (uint256) {
    uint256 g = _floor() - 1;
    (bool ok, bytes memory ret) = _tryFlush(g, _all, _n);
    assertFalse(ok);
    (, uint256 available) = _decodeFloorRevert(ret);
    return g - available;
  }

  /// Entry `_k` of a flush of `_k` entries hits the floor after entries `1.._k-1` were activated: at one gas below
  /// the smallest limit that gets entry `_k` past its check, exactly `required - 1` is left at that check, the
  /// whole flush reverts, and the earlier activations are rolled back with it.
  function _assertLaterEntryHitsFloor(bool _all, uint256 _n, uint256 _k) internal {
    uint256 required = _floor();
    uint256 prelude = _gasBeforeFirstCheck(_all, _n);
    // Walking down from a limit that activates all `_k` entries, the first floor revert is entry `_k`'s: the gas
    // left at a check only shrinks with the entry's position. Below a limit that reaches entry `_k` the outcome can
    // also be an earlier deposit running out of gas, so step down rather than bisect.
    uint256 hi = _minSuccessGas(_all, _n);
    uint256 lo = hi;
    while (true) {
      lo -= 10_000;
      (bool okLo, bytes memory retLo) = _probe(lo, _all, _n);
      if (!okLo && retLo.length == 68 && bytes4(retLo) == Errors.Staking__InsufficientFlushGas.selector) {
        break;
      }
      hi = lo;
    }
    uint256 boundary = _findFloorBoundaryIn(_all, _n, lo, hi);

    FlushState memory before = _state();
    (bool ok, bytes memory ret) = _tryFlush(boundary - 1, _all, _n);
    assertFalse(ok, "flush succeeds");
    (uint256 req, uint256 available) = _decodeFloorRevert(ret);
    assertEq(req, required, "required");
    assertEq(available, required - 1, "available");
    // More than the prelude plus a whole deposit was spent before the failing check: a later entry hit the floor.
    assertGt(boundary - 1 - available, prelude + 100_000, "first entry hit the floor");
    _assertStateEq(_state(), before);

    _assertActivatesOrReverts(boundary, _all, _n, _k);
  }

  /// Smallest gas limit that does not fail the first entry's floor check.
  function _findFloorBoundary(bool _all, uint256 _n, uint256 _required) internal returns (uint256) {
    // `_required - 1` fails the check, since the flush spends gas before reaching it.
    return _findFloorBoundaryIn(_all, _n, _required - 1, AMPLE_GAS);
  }

  /// Smallest limit in `(_lo, _hi]` that does not fail a floor check, given that `_lo` fails one, `_hi` does not,
  /// and only one entry's check can fail in between (so the outcome is monotonic in the limit).
  function _findFloorBoundaryIn(bool _all, uint256 _n, uint256 _lo, uint256 _hi) internal returns (uint256) {
    uint256 lo = _lo;
    uint256 hi = _hi;
    (bool okLo, bytes memory retLo) = _probe(lo, _all, _n);
    require(!okLo && bytes4(retLo) == Errors.Staking__InsufficientFlushGas.selector, "lower end passes the floor");
    (bool okHi, bytes memory retHi) = _probe(hi, _all, _n);
    require(okHi || bytes4(retHi) != Errors.Staking__InsufficientFlushGas.selector, "boundary above search range");
    while (hi - lo > 1) {
      uint256 mid = (lo + hi) / 2;
      (bool ok, bytes memory ret) = _probe(mid, _all, _n);
      if (!ok && ret.length >= 4 && bytes4(ret) == Errors.Staking__InsufficientFlushGas.selector) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return hi;
  }

  /// Smallest gas limit with which the flush succeeds (more gas never makes a successful flush fail).
  function _minSuccessGas(bool _all, uint256 _n) internal returns (uint256) {
    uint256 lo = 100_000;
    uint256 hi = AMPLE_GAS;
    while (hi - lo > 1000) {
      uint256 mid = (lo + hi) / 2;
      (bool ok,) = _probe(mid, _all, _n);
      if (ok) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return hi;
  }

  /// Smallest proof-of-possession cap with which the head entry activates given ample gas.
  function _minCapThatActivates() internal returns (uint256) {
    uint256 cap = GSE_.proofOfPossessionGasLimit();
    uint256 lo = 10_000;
    uint256 hi = 1_000_000;
    while (hi - lo > 1) {
      uint256 mid = (lo + hi) / 2;
      _setCap(mid);
      uint256 snap = vm.snapshotState();
      uint256 active = INSTANCE.getActiveAttesterCount();
      (bool ok,) = _tryFlush(AMPLE_GAS, false, 1);
      bool activated = ok && INSTANCE.getActiveAttesterCount() == active + 1;
      vm.revertToState(snap);
      if (activated) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    _setCap(cap);
    return hi;
  }

  function _assertCapRaisedKeepsValidEntries(uint256 _cap) internal {
    _queue(0, 1);
    _setCap(_cap);
    uint256 required = _floor();
    assertEq(required, StakingLib.getFlushDepositGasFloor(_cap));
    _assertFloorRevertLeavesStateUnchanged(required - 1, false, 1);
    _sweep(false, 1, 1);
  }

  function _sweep(bool _all, uint256 _n, uint256 _expected) internal {
    uint256 top = _minSuccessGas(_all, _n) + 50_000;
    uint256[4] memory counts;
    for (uint256 g = 200_000; g <= top; g += 2500) {
      counts[_assertActivatesOrReverts(g, _all, _n, _expected)]++;
    }
    emit log_named_uint("activated", counts[ACTIVATED]);
    emit log_named_uint("floor revert", counts[FLOOR_REVERT]);
    emit log_named_uint("deposit out of gas", counts[DEPOSIT_OUT_OF_GAS]);
    emit log_named_uint("out of gas", counts[OUT_OF_GAS]);
    assertGt(counts[ACTIVATED], 0, "nothing activated");
    assertGt(counts[FLOOR_REVERT], 0, "floor never hit");
  }

  /// With ample gas, the invalid head entry is refunded and removed and the valid ones behind it activate.
  function _assertRefundsHeadAndActivatesRest() internal {
    DepositArgs memory head = INSTANCE.getEntryQueueAt(0);
    uint256 queued = INSTANCE.getEntryQueueLength();
    uint256 active = INSTANCE.getActiveAttesterCount();
    uint256 headBalance = STAKING_ASSET.balanceOf(head.withdrawer);
    vm.prank(flusher);
    INSTANCE.flushEntryQueue{gas: AMPLE_GAS}();
    assertEq(INSTANCE.getEntryQueueLength(), 0, "queue progressed");
    assertEq(INSTANCE.getActiveAttesterCount(), active + queued - 1, "valid entries activated");
    assertEq(
      STAKING_ASSET.balanceOf(head.withdrawer), headBalance + INSTANCE.getActivationThreshold(), "invalid refunded"
    );
  }
}
