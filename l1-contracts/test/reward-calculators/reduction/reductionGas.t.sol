// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {
  SequencerRewardCalculatorLib,
  CALCULATOR_GAS_BASE,
  CALCULATOR_GAS_PER_CHECKPOINT
} from "@aztec/core/libraries/rollup/SequencerRewardCalculatorLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {RegistryReductionCalculator} from "@test/reward-calculators/reduction/RegistryReductionCalculator.sol";
import {FakeGSE} from "@test/reward-calculators/mocks/FakeGSE.sol";
import {
  MockATP,
  MockATPStakerImplementation,
  deployMainnetShapedATPStaker,
  GasBurningAddressGetter,
  ExpensiveAddressGetter,
  VariableReturnDataAddressGetter
} from "@test/reward-calculators/mocks/ATPMocks.sol";

/**
 * @notice Calls a sequencer reward calculator the way the rollup does, and measures it.
 */
contract CalculatorMeter {
  Epoch internal constant EPOCH = Epoch.wrap(3);

  /**
   * @notice Calls `_calculator` with exactly the rollup's stipend and measures the gas of the call, including its
   *         cold account access, without copying the return data until the call has returned.
   */
  function measure(address _calculator, address[] calldata _proposers, uint256 _defaultReward, uint256 _cr)
    external
    view
    returns (bool success, uint256[] memory rewards, uint256 gasUsed)
  {
    bytes memory data =
      abi.encodeCall(ISequencerRewardCalculator.getSequencerRewards, (EPOCH, _proposers, _defaultReward, _cr));
    uint256 stipend = CALCULATOR_GAS_BASE + CALCULATOR_GAS_PER_CHECKPOINT * _proposers.length;
    uint256 gasBefore = gasleft();
    assembly ("memory-safe") {
      success := staticcall(stipend, _calculator, add(data, 0x20), mload(data), 0, 0)
    }
    gasUsed = gasBefore - gasleft();
    if (success) {
      uint256 size;
      assembly ("memory-safe") {
        size := returndatasize()
      }
      bytes memory returned = new bytes(size);
      assembly ("memory-safe") {
        returndatacopy(add(returned, 0x20), 0, size)
      }
      rewards = abi.decode(returned, (uint256[]));
    }
  }

  /**
   * @notice Runs the rollup's own defensive call.
   */
  function tryGetSequencerRewards(
    address _calculator,
    address[] calldata _proposers,
    uint256 _defaultReward,
    uint256 _cr
  ) external view returns (bool accepted, uint256[] memory rewards) {
    (accepted, rewards,) = SequencerRewardCalculatorLib.tryGetSequencerRewards(
        _calculator, EPOCH, _proposers, _defaultReward, _cr
      );
  }
}

/**
 * @notice The reduction calculator fits the rollup's stipend at 1, 8, 16 and 32 distinct proposers, with mainnet
 *         shaped positions and with withdrawers that make every probe as expensive as it can be.
 *
 * @dev Isolation runs every external call as its own transaction, so every account and storage slot is cold when the
 *      meter calls the calculator, as in a proof submission. All proposers are distinct, the worst case: repeated
 *      proposers are served from the per-call cache.
 */
contract RegistryReductionCalculatorGasTest is Test {
  enum Scenario {
    MainnetShaped,
    ExpensiveSuccess,
    BurningWithdrawer,
    ExpensiveWithdrawerBurningATP,
    ExpensiveWithdrawerReturnBombATP
  }

  uint256 internal constant DEFAULT_REWARD = 50e18;
  uint256 internal constant CHECKPOINT_REWARD = 100e18;
  uint96 internal constant REWARD_A = 10e18;
  uint96 internal constant REWARD_B = 20e18;

  // The calculator must leave at least a quarter of the stipend unused in every scenario.
  uint256 internal constant MAX_STIPEND_USE_BPS = 7500;

  address internal owner = makeAddr("owner");
  address internal registryA = makeAddr("registry A");
  address internal registryB = makeAddr("registry B");

  FakeGSE internal gse;
  RegistryReductionCalculator internal calculator;
  CalculatorMeter internal meter;
  MockATP internal atpImplementationA;
  MockATP internal atpImplementationB;
  address internal stakerImplementation;

  function setUp() public {
    gse = new FakeGSE();
    calculator = new RegistryReductionCalculator(IGSE(address(gse)), owner);
    meter = new CalculatorMeter();
    atpImplementationA = new MockATP(registryA);
    atpImplementationB = new MockATP(registryB);
    stakerImplementation = address(new MockATPStakerImplementation());
    vm.startPrank(owner);
    calculator.setRegistryReward(registryA, REWARD_A);
    calculator.setRegistryReward(registryB, REWARD_B);
    vm.stopPrank();
  }

  /// forge-config: default.isolate = true
  function test_MainnetShapedPositionsFitTheStipend() external {
    _assertFitsTheStipend(Scenario.MainnetShaped);
  }

  /// forge-config: default.isolate = true
  function test_ExpensiveSuccessfulProbesFitTheStipend() external {
    _assertFitsTheStipend(Scenario.ExpensiveSuccess);
  }

  /// forge-config: default.isolate = true
  function test_GasBurningWithdrawersFitTheStipend() external {
    _assertFitsTheStipend(Scenario.BurningWithdrawer);
  }

  /// forge-config: default.isolate = true
  function test_ExpensiveWithdrawersWithGasBurningATPsFitTheStipend() external {
    _assertFitsTheStipend(Scenario.ExpensiveWithdrawerBurningATP);
  }

  /// forge-config: default.isolate = true
  function test_ExpensiveWithdrawersWithReturnBombATPsFitTheStipend() external {
    _assertFitsTheStipend(Scenario.ExpensiveWithdrawerReturnBombATP);
  }

  function _assertFitsTheStipend(Scenario _scenario) internal {
    uint256[4] memory sizes = [uint256(1), 8, 16, 32];
    for (uint256 s = 0; s < sizes.length; s++) {
      uint256 n = sizes[s];
      (address[] memory proposers, uint256[] memory expected) = _proposers(_scenario, n);
      uint256 stipend = CALCULATOR_GAS_BASE + CALCULATOR_GAS_PER_CHECKPOINT * n;

      (bool success, uint256[] memory rewards, uint256 gasUsed) =
        meter.measure(address(calculator), proposers, DEFAULT_REWARD, CHECKPOINT_REWARD);
      assertTrue(success, "the calculator ran out of the stipend");
      assertEq(rewards, expected, "rewards");
      emit log_named_uint(string.concat("n = ", vm.toString(n), ", gas"), gasUsed);
      emit log_named_uint(string.concat("n = ", vm.toString(n), ", stipend left"), stipend - gasUsed);
      assertLe(gasUsed * 10_000, stipend * MAX_STIPEND_USE_BPS, "too little headroom");

      (bool accepted, uint256[] memory accepteds) =
        meter.tryGetSequencerRewards(address(calculator), proposers, DEFAULT_REWARD, CHECKPOINT_REWARD);
      assertTrue(accepted, "the rollup rejected the response");
      assertEq(accepteds, expected, "accepted rewards");
    }
  }

  function _proposers(Scenario _scenario, uint256 _n)
    internal
    returns (address[] memory proposers, uint256[] memory expected)
  {
    proposers = new address[](_n);
    expected = new uint256[](_n);
    for (uint256 i = 0; i < _n; i++) {
      proposers[i] = address(uint160(uint256(keccak256(abi.encode("proposer", _scenario, _n, i)))));
      address withdrawer;
      if (_scenario == Scenario.MainnetShaped) {
        (withdrawer,) =
          deployMainnetShapedATPStaker(i % 2 == 0 ? atpImplementationA : atpImplementationB, stakerImplementation);
        expected[i] = i % 2 == 0 ? REWARD_A : REWARD_B;
      } else if (_scenario == Scenario.ExpensiveSuccess) {
        withdrawer = address(new ExpensiveAddressGetter(address(new ExpensiveAddressGetter(registryA))));
        expected[i] = REWARD_A;
      } else if (_scenario == Scenario.BurningWithdrawer) {
        withdrawer = address(new GasBurningAddressGetter());
        expected[i] = DEFAULT_REWARD;
      } else if (_scenario == Scenario.ExpensiveWithdrawerBurningATP) {
        withdrawer = address(new ExpensiveAddressGetter(address(new GasBurningAddressGetter())));
        expected[i] = DEFAULT_REWARD;
      } else {
        withdrawer = address(new ExpensiveAddressGetter(address(new VariableReturnDataAddressGetter(64 * 1024))));
        expected[i] = DEFAULT_REWARD;
      }
      gse.setWithdrawer(proposers[i], withdrawer);
    }
  }
}
