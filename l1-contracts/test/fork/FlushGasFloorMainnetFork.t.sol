// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {RegistrationData, RegistrationDataLib} from "@test/shared/RegistrationData.sol";

/**
 * The flush gas floor against the dependencies the local suite stubs: a Rollup built from this source is deployed
 * on a mainnet fork and registered on the live GSE, so its flushes run through the deployed GSE, proof-of-possession
 * wrapper, AZTEC token and Governance. Whatever gas limit the flush caller picks, a valid queued entry is either
 * activated or the whole flush reverts; it is never refunded.
 *
 * Needs an archive RPC. Skips when MAINNET_FORK_RPC is unset. Run under the schedule the floor is sized for and
 * under the current one (both must pass); amsterdam needs Foundry >= 1.8. `--disable-block-gas-limit` lifts the
 * forked block's 60M limit, which the Rollup deployment in setUp exceeds under EIP-8037 state gas:
 *
 *   MAINNET_FORK_RPC=<archive rpc> forge test --isolate --gas-limit 60000000000 --disable-block-gas-limit \
 *     --evm-version amsterdam --match-path test/fork/FlushGasFloorMainnetFork.t.sol -vv
 *   MAINNET_FORK_RPC=<archive rpc> forge test --isolate --gas-limit 60000000000 --disable-block-gas-limit \
 *     --evm-version osaka --match-path test/fork/FlushGasFloorMainnetFork.t.sol -vv
 */
contract FlushGasFloorMainnetForkTest is TestBase {
  uint256 internal constant FORK_BLOCK = 26_121_859;
  GSE internal constant LIVE_GSE = GSE(0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f);
  address internal constant LIVE_WRAPPER = 0x656F9140B9e2d3769D47b575512d46039dCab4D3; // CREATE(GSE, nonce 1)
  IERC20 internal constant AZTEC = IERC20(0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2);

  // Code hashes at FORK_BLOCK: the test runs against this exact deployed bytecode.
  bytes32 internal constant GSE_CODEHASH = 0xee35ed287bbe5006fbf9a03627f7fc71abfafa493cbebb63420106eea3fce156;
  bytes32 internal constant WRAPPER_CODEHASH = 0x5688ca9a3c77c37384863590322e440b09eb7dd5c2a4226b52c8edd2e0d3f2c1;
  bytes32 internal constant AZTEC_CODEHASH = 0xa228fcc86603d5da2978230b582b03903aedf29d7657a2795d8ba930528e919f;

  uint256 internal constant N = 3;
  uint256 internal constant AMPLE_GAS = 30_000_000;

  IInstance internal rollup;
  // Attesters already on the GSE's bonus instance count for the latest rollup, so this is not zero.
  uint256 internal baseActive;
  RegistrationData[] internal regs;
  address internal depositor = makeAddr("depositor");
  address internal flusher = makeAddr("flusher");

  function setUp() public {
    string memory rpc = vm.envOr("MAINNET_FORK_RPC", string(""));
    vm.skip(bytes(rpc).length == 0);
    vm.createSelectFork(rpc, FORK_BLOCK);
    assertEq(address(LIVE_GSE).codehash, GSE_CODEHASH, "live GSE codehash");
    assertEq(LIVE_WRAPPER.codehash, WRAPPER_CODEHASH, "live wrapper codehash");
    assertEq(address(AZTEC).codehash, AZTEC_CODEHASH, "live AZTEC codehash");

    // A Rollup from this source on top of the live GSE and token. No test governance or registry wiring: the GSE
    // keeps its live owner and Governance, and only gains this Rollup as its latest instance.
    RollupBuilder b = new RollupBuilder(address(this))
      .setTestERC20(TestERC20(address(AZTEC)))
      .setGSE(LIVE_GSE)
      .setMakeCanonical(false)
      .setMakeGovernance(false)
      .setUpdateOwnerships(false)
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
    rollup = IInstance(address(b.getConfig().rollup));
    vm.prank(LIVE_GSE.owner());
    LIVE_GSE.addRollup(address(rollup));
    assertEq(LIVE_GSE.getLatestRollup(), address(rollup), "new rollup is the latest instance");
    baseActive = rollup.getActiveAttesterCount();
    emit log_named_uint("attesters inherited from the bonus instance", baseActive);

    RegistrationData[] memory r = RegistrationDataLib.load(vm, N);
    uint256 at = rollup.getActivationThreshold();
    deal(address(AZTEC), depositor, at * N);
    vm.startPrank(depositor);
    AZTEC.approve(address(rollup), at * N);
    for (uint256 i = 0; i < N; i++) {
      regs.push(r[i]);
      rollup.deposit(
        r[i].attester, _withdrawer(i), r[i].publicKeyInG1, r[i].publicKeyInG2, r[i].proofOfPossession, true
      );
    }
    vm.stopPrank();
    assertEq(rollup.getEntryQueueLength(), N, "queued");
  }

  /// For each queued entry in turn: sweep the gas limit of `flushEntryQueue(1)` from well below the floor to past
  /// the smallest limit that activates it. Every limit either activates the entry and refunds nobody, or reverts
  /// and changes nothing. Then activate it for real and move to the next epoch.
  function test_fork_noGasLimitRefundsAValidEntry() public {
    for (uint256 i = 0; i < N; i++) {
      uint256 top = _minSuccessGas() + 50_000;
      uint256 activatedRuns;
      uint256 revertedRuns;
      for (uint256 g = 200_000; g <= top; g += 5000) {
        uint256 queued = rollup.getEntryQueueLength();
        uint256 active = rollup.getActiveAttesterCount();
        uint256 snap = vm.snapshotState();
        (bool ok, bytes memory ret) = _tryFlush(g);
        if (ok) {
          assertEq(rollup.getActiveAttesterCount(), active + 1, "success without activation");
          assertEq(rollup.getEntryQueueLength(), queued - 1, "dequeued");
          activatedRuns++;
        } else {
          assertEq(rollup.getActiveAttesterCount(), active, "active count changed on revert");
          assertEq(rollup.getEntryQueueLength(), queued, "queue changed on revert");
          bool known = ret.length == 0 || bytes4(ret) == Errors.Staking__InsufficientFlushGas.selector
            || bytes4(ret) == Errors.Staking__DepositOutOfGas.selector;
          assertTrue(known, "unexpected revert data");
          revertedRuns++;
        }
        assertEq(AZTEC.balanceOf(_withdrawer(i)), 0, "valid entry refunded");
        vm.revertToState(snap);
      }
      assertGt(activatedRuns, 0, "nothing activated");
      assertGt(revertedRuns, 0, "nothing reverted");
      emit log_named_uint("entry", i);
      emit log_named_uint("  activated runs", activatedRuns);
      emit log_named_uint("  reverted runs", revertedRuns);

      vm.prank(flusher);
      rollup.flushEntryQueue{gas: AMPLE_GAS}(1);
      assertEq(rollup.getActiveAttesterCount(), baseActive + i + 1, "activated");
      vm.warp(block.timestamp + rollup.getEpochDuration() * rollup.getSlotDuration());
    }
    assertEq(rollup.getEntryQueueLength(), 0, "queue drained by activation");
    for (uint256 i = 0; i < N; i++) {
      assertEq(AZTEC.balanceOf(_withdrawer(i)), 0, "no refunds");
    }
    assertEq(AZTEC.balanceOf(flusher), 0, "flusher gained nothing");
    assertEq(AZTEC.balanceOf(address(rollup)), 0, "stake of activated entries is in the GSE, not the rollup");
  }

  function _withdrawer(uint256 _i) internal pure returns (address) {
    return address(uint160(0xF0A4000 + _i));
  }

  function _tryFlush(uint256 _gas) internal returns (bool ok, bytes memory ret) {
    vm.prank(flusher);
    (ok, ret) = address(rollup).call{gas: _gas}(abi.encodeWithSignature("flushEntryQueue(uint256)", uint256(1)));
  }

  /// Smallest gas limit with which `flushEntryQueue(1)` succeeds (more gas never makes a successful flush fail).
  function _minSuccessGas() internal returns (uint256) {
    uint256 lo = 100_000;
    uint256 hi = AMPLE_GAS;
    while (hi - lo > 1000) {
      uint256 mid = (lo + hi) / 2;
      uint256 snap = vm.snapshotState();
      (bool ok,) = _tryFlush(mid);
      vm.revertToState(snap);
      if (ok) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return hi;
  }
}
