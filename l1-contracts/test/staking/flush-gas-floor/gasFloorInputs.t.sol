// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Bn254LibWrapper} from "@aztec/governance/Bn254LibWrapper.sol";
import {RegistrationData, RegistrationDataLib} from "@test/shared/RegistrationData.sol";
import {console} from "forge-std/console.sol";

/**
 * Measures the inputs of the per-entry gas floor in StakingLib.flushEntryQueue that come from the
 * BN254 proof-of-possession verifier (Bn254LibWrapper) and from the Rollup's flush and refund branch.
 * See README.md and RESULTS.md in this folder.
 *
 * Measurement only: the tests print numbers and run only when FLUSH_GAS_FLOOR_MEASURE is set, under the EVM
 * version the floor is sized for (--evm-version amsterdam) or a control (osaka, prague). Run with -vv.
 *
 *  (a) full proof-of-possession verification gas inside the wrapper frame, per key;
 *  (b) the minimum stipend for which verification succeeds, per key (binary search);
 *  (d) full activation cost (a successful GSE.deposit frame, from the trace / gas diff);
 *
 * The GSE pre-verification path (c) and the Rollup refund path (e) are read from the
 * -vvvv traces produced by trace_* below and gsePreVerificationGas.t.sol.
 */
contract FlushGasFloorInputsTest is TestBase {
  uint256 internal constant N = 6;

  IInstance public INSTANCE;
  TestERC20 public STAKING_ASSET;
  RegistrationData[] public regs;
  Bn254LibWrapper public wrapper;
  address internal flusher = makeAddr("flusher");

  function setUp() public {
    vm.skip(!vm.envOr("FLUSH_GAS_FLOOR_MEASURE", false));

    RegistrationData[] memory r = RegistrationDataLib.load(vm, N);
    for (uint256 i = 0; i < N; i++) {
      regs.push(r[i]);
    }
    RollupBuilder b = new RollupBuilder(address(this))
      .setUpdateOwnerships(false)
      .setCheckProofOfPossession(true)
      .setStakingQueueConfig(
        StakingQueueConfig({
          bootstrapValidatorSetSize: 0,
          bootstrapFlushSize: 0,
          normalFlushSizeMin: 4,
          normalFlushSizeQuotient: 400,
          maxQueueFlushSize: 4
        })
      )
      .deploy();
    INSTANCE = IInstance(address(b.getConfig().rollup));
    STAKING_ASSET = b.getConfig().testERC20;

    // The live wrapper is GSE's CREATE address at nonce 1; a fresh deploy is byte-identical
    // and lets us drive it directly with an arbitrary gas stipend.
    wrapper = new Bn254LibWrapper();
    address gse = address(INSTANCE.getGSE());
    address derived = vm.computeCreateAddress(gse, 1);
    console.log("GSE address", gse);
    console.log("derived live wrapper address (CREATE(GSE,1))", derived);
    assertEq(derived.codehash, address(wrapper).codehash, "fresh wrapper is not the GSE's wrapper bytecode");

    vm.prank(STAKING_ASSET.owner());
    STAKING_ASSET.addMinter(address(this));
    uint256 at = INSTANCE.getActivationThreshold();
    STAKING_ASSET.mint(address(this), at * N);
    STAKING_ASSET.approve(address(INSTANCE), at * N);
    for (uint256 i = 0; i < N; i++) {
      INSTANCE.deposit(
        regs[i].attester, _withdrawer(i), regs[i].publicKeyInG1, regs[i].publicKeyInG2, regs[i].proofOfPossession, true
      );
    }
  }

  function _withdrawer(uint256 i) internal pure returns (address) {
    return address(uint160(0xA11CE000 + i));
  }

  /// (a) Full PoP verification gas, measured as the gas consumed by an external call to the
  /// wrapper given an effectively-unbounded stipend.
  function test_measure_popVerificationGas() public view {
    for (uint256 i = 0; i < N; i++) {
      uint256 g0 = gasleft();
      bool ok = wrapper.proofOfPossession(regs[i].publicKeyInG1, regs[i].publicKeyInG2, regs[i].proofOfPossession);
      uint256 used = g0 - gasleft();
      require(ok, "pop should verify");
      console.log("popVerificationGas (call-inclusive) entry", i, used);
    }
  }

  /// (b) Minimum stipend for which the PoP verification succeeds, per key.
  /// Binary search over the explicit gas forwarded to the wrapper call.
  function test_measure_minStipend() public {
    for (uint256 i = 0; i < N; i++) {
      uint256 lo = 50_000;
      uint256 hi = 400_000;
      require(_popSucceedsWith(i, hi), "hi must succeed");
      require(!_popSucceedsWith(i, lo), "lo must fail");
      while (hi - lo > 250) {
        uint256 mid = (lo + hi) / 2;
        if (_popSucceedsWith(i, mid)) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      console.log("minStipend (forwarded gas) entry", i, hi);
    }
  }

  function _popSucceedsWith(uint256 i, uint256 stipend) internal returns (bool) {
    try this.extCallPop{gas: stipend + 60_000}(i, stipend) returns (bool ok) {
      return ok;
    } catch {
      return false;
    }
  }

  function extCallPop(uint256 i, uint256 stipend) external view returns (bool) {
    // Forward exactly `stipend` to the wrapper, mirroring GSE's `{gas: cap}` call.
    return
      wrapper.proofOfPossession{gas: stipend}(regs[i].publicKeyInG1, regs[i].publicKeyInG2, regs[i].proofOfPossession);
  }

  /// (d) Full successful activation: trace a single-entry honest flush.
  /// Run with -vvvv to read the GSE.deposit and Bn254LibWrapper frame gas.
  function test_trace_singleSuccessfulFlush() public {
    INSTANCE.flushEntryQueue(1);
    console.log("active after honest flush", INSTANCE.getActiveAttesterCount());
  }

  /// (e) Trace a single-entry flush whose deposit has an invalid proof of possession (another key's signature) and a
  /// fresh zero-balance withdrawer, to read the Rollup -> GSE forwarded gas and the refund-branch cost. The branch is
  /// the one a starved valid entry takes on a flush without the gas floor.
  function test_trace_invalidDepositRefundFlush() public {
    while (INSTANCE.getEntryQueueLength() > 0) {
      INSTANCE.flushEntryQueue();
      vm.warp(block.timestamp + INSTANCE.getEpochDuration() * INSTANCE.getSlotDuration());
    }
    uint256 at = INSTANCE.getActivationThreshold();
    STAKING_ASSET.mint(address(this), at);
    STAKING_ASSET.approve(address(INSTANCE), at);
    // An unused key, so the GSE gets as far as verifying the proof of possession.
    RegistrationData[] memory r = RegistrationDataLib.load(vm, N + 2);
    RegistrationData memory bad = r[N];
    bad.proofOfPossession = r[N + 1].proofOfPossession;
    address withdrawer = makeAddr("fresh withdrawer");
    INSTANCE.deposit(bad.attester, withdrawer, bad.publicKeyInG1, bad.publicKeyInG2, bad.proofOfPossession, true);

    vm.prank(flusher);
    INSTANCE.flushEntryQueue(1);
    console.log("queue after", INSTANCE.getEntryQueueLength());
    console.log("withdrawer refunded", STAKING_ASSET.balanceOf(withdrawer));
  }
}
