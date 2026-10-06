// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {GSEMeasureProbe} from "@test/staking/flush-gas-floor/GSEMeasureProbe.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {RegistrationData, RegistrationDataLib} from "@test/shared/RegistrationData.sol";
import {console} from "forge-std/console.sol";

interface IGSEDeposit {
  function deposit(address, address, G1Point memory, G2Point memory, G1Point memory, bool) external;
  function addRollup(address) external;
}

/**
 * Measures the GSE pre-verification path: gas consumed from GSE.deposit entry up to the
 * instant before the proof-of-possession wrapper call, via a verbatim-body probe GSE.
 *
 * Measurement only: prints numbers and runs only when FLUSH_GAS_FLOOR_MEASURE is set. Run under several EVM
 * versions (-vv) to show how much of the path is EIP-8037 state gas.
 *
 * The probe prints `gasleft()` at two points (after the cheap checks + attesters.add, and
 * immediately before the wrapper call). We call gse.deposit directly as the registered
 * Rollup with a KNOWN stipend X, so that
 *   P = X - (gasleft immediately before wrapper call)
 * is the pre-verification consumption the flush gas floor (StakingLib.getFlushDepositGasFloor)
 * must budget for. The deposit reverts after the wrapper call (no governance / token funding),
 * which is irrelevant: both probes fire before the wrapper call.
 *
 * Each deposit runs in its own (isolated) transaction, so every GSE/precompile access is
 * cold — the worst case for the floor. We exercise:
 *   - bonus instance, first vs subsequent attester (moveWithLatestRollup=true);
 *   - specific instance, first vs subsequent attester (moveWithLatestRollup=false).
 */
contract GSEPreVerificationGasTest is TestBase {
  GSEMeasureProbe public PROBE;
  address internal rollup = makeAddr("rollupInstance");
  RegistrationData[] public regs;

  function setUp() public {
    vm.skip(!vm.envOr("FLUSH_GAS_FLOOR_MEASURE", false));

    RegistrationData[] memory r = RegistrationDataLib.load(vm, 8);
    for (uint256 i = 0; i < 8; i++) {
      regs.push(r[i]);
    }
    TestERC20 asset = new TestERC20("test", "TEST", address(this));
    PROBE =
      new GSEMeasureProbe(address(this), asset, TestConstants.ACTIVATION_THRESHOLD, TestConstants.EJECTION_THRESHOLD);
    PROBE.addRollup(rollup); // rollup becomes the latest instance -> bonus deposits allowed
  }

  function _deposit(uint256 i, address withdrawer, bool moveWithLatest, uint256 stipend) internal {
    // Advance the block so each attester's size/history checkpoints append a fresh slot
    // (the production worst case), rather than overwriting a same-timestamp checkpoint.
    vm.warp(block.timestamp + 12);
    vm.roll(block.number + 1);
    vm.prank(rollup);
    // Reverts after the wrapper call (no governance); both gas probes have already printed.
    try IGSEDeposit(address(PROBE))
    .deposit{
      gas: stipend
    }(
      regs[i].attester,
      withdrawer,
      regs[i].publicKeyInG1,
      regs[i].publicKeyInG2,
      regs[i].proofOfPossession,
      moveWithLatest
    ) {}
      catch {}
  }

  function test_measure_gsePreVerificationPath() public {
    uint256 X = 3_000_000;
    console.log("stipend X", X);
    console.log("P = X - (gasleft immediately before wrapper call); X =", X);

    console.log("--- entry 0: bonus instance, FIRST attester on bonus (move=true)");
    _deposit(0, address(0xBEEF0), true, X);
    console.log("--- entry 1: bonus instance, subsequent attester (move=true)");
    _deposit(1, address(0xBEEF1), true, X);
    console.log("--- entry 2: specific instance, FIRST attester on instance (move=false)");
    _deposit(2, address(0xBEEF2), false, X);
    console.log("--- entry 3: specific instance, subsequent attester (move=false)");
    _deposit(3, address(0xBEEF3), false, X);
  }
}
