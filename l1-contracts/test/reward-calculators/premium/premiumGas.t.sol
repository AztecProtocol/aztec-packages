// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {
  CALCULATOR_GAS_BASE,
  CALCULATOR_GAS_PER_CHECKPOINT
} from "@aztec/core/libraries/rollup/SequencerRewardCalculatorLib.sol";
import {IATP, IATPStaker} from "@test/reward-calculators/IATP.sol";
import {ProbeLib} from "@test/reward-calculators/ProbeLib.sol";
import {CalculatorMeter} from "@test/reward-calculators/reduction/reductionGas.t.sol";
import {IPremiumATP, IPremiumATPFactory, IPremiumATPStaker} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {ProbeTarget} from "@test/reward-calculators/premium/mocks/PremiumMocks.sol";
import {PremiumUnitBase} from "@test/reward-calculators/premium/PremiumUnitBase.sol";

/**
 * @notice Runs one probe the way the calculator does, so a test can find the smallest stipend a genuine contract
 *         needs.
 */
contract PremiumProbeMeter {
  function probeAddress(address _target, bytes4 _selector, uint256 _gas) external view returns (bool, address) {
    return ProbeLib.tryGetAddress(_target, _selector, _gas);
  }

  function probeBool(address _target, bytes4 _selector, address _arg, uint256 _gas) external view returns (bool, bool) {
    return ProbeLib.tryGetBool(_target, _selector, _arg, _gas);
  }
}

/**
 * @notice The premium calculator fits the rollup's stipend at 1, 8, 16 and 32 distinct proposers, for genuine
 *         positions and for the most expensive ways to fail that a proposer can build, and even when every probe
 *         target, including the provenance source, burns its whole stipend before answering wrongly at the last
 *         probe.
 *
 * @dev Isolation runs every external call as its own transaction, so every account and storage slot is cold when the
 *      meter calls the calculator, as in a proof submission. Every proposer has its own contracts, so none is warm
 *      from an earlier proposer except what genuinely is shared (implementations, the factory, the registry entry).
 */
contract PremiumRewardCalculatorGasTest is PremiumUnitBase {
  enum Scenario {
    // Five probes succeed on genuine positions: the premium.
    Genuine,
    // A withdrawer burns its stipend and points at a genuine position, which names another staker: fails at the
    // fourth probe. The latest failure a proposer can reach with contracts of its own.
    ExpensiveWithdrawerGenuinePosition,
    // A withdrawer and a forged position both burn their stipend; the genuine factory rejects the position: fails at
    // the third probe. The most stipend a proposer can make the calculator forward.
    ExpensiveWithdrawerExpensivePosition,
    // As above, but the forged position returns more data than a probe accepts (16 KiB), successfully within the
    // probe stipend.
    ExpensiveWithdrawerReturnBombPosition,
    // As above, but the forged position's return bomb is 64 KiB: it runs out of the probe stipend expanding memory.
    ExpensiveWithdrawerOutOfGasReturnBombPosition,
    // The withdrawer burns its stipend and returns nothing.
    BurningWithdrawer,
    // Not reachable without a hostile trust root: every one of the five probes burns its stipend, the first four
    // answer well, the last answers false, each proposer with its own registry entry and provenance source.
    AllProbesExpensiveLastFails,
    // As above, but the last probe answers true: shows that every expensive answer above is within its stipend, so
    // the failing variant really runs all five probes.
    AllProbesExpensiveAllPass
  }

  // The calculator must leave at least a quarter of the stipend unused in every scenario.
  uint256 internal constant MAX_STIPEND_USE_BPS = 7500;

  CalculatorMeter internal meter;
  PremiumProbeMeter internal probeMeter;

  function setUp() public override {
    super.setUp();
    meter = new CalculatorMeter();
    probeMeter = new PremiumProbeMeter();
  }

  /// forge-config: default.isolate = true
  function test_GenuinePositionsFitTheStipend() external {
    _assertFitsTheStipend(Scenario.Genuine);
  }

  /// forge-config: default.isolate = true
  function test_ExpensiveWithdrawersOfGenuinePositionsFitTheStipend() external {
    _assertFitsTheStipend(Scenario.ExpensiveWithdrawerGenuinePosition);
  }

  /// forge-config: default.isolate = true
  function test_ExpensiveWithdrawersOfExpensivePositionsFitTheStipend() external {
    _assertFitsTheStipend(Scenario.ExpensiveWithdrawerExpensivePosition);
  }

  /// forge-config: default.isolate = true
  function test_ExpensiveWithdrawersOfReturnBombPositionsFitTheStipend() external {
    _assertFitsTheStipend(Scenario.ExpensiveWithdrawerReturnBombPosition);
  }

  /// forge-config: default.isolate = true
  function test_ExpensiveWithdrawersOfOutOfGasReturnBombPositionsFitTheStipend() external {
    _assertFitsTheStipend(Scenario.ExpensiveWithdrawerOutOfGasReturnBombPosition);
  }

  /// forge-config: default.isolate = true
  function test_GasBurningWithdrawersFitTheStipend() external {
    _assertFitsTheStipend(Scenario.BurningWithdrawer);
  }

  /// forge-config: default.isolate = true
  function test_FiveExpensiveProbesWithALateFailureFitTheStipend() external {
    _assertFitsTheStipend(Scenario.AllProbesExpensiveLastFails);
  }

  /// forge-config: default.isolate = true
  function test_FiveExpensiveProbesThatAllPassFitTheStipend() external {
    _assertFitsTheStipend(Scenario.AllProbesExpensiveAllPass);
  }

  /// forge-config: default.isolate = true
  function test_GenuineProbesLeaveAtLeastFortyPercentOfTheProbeStipend() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position();
    address attester = _stake(staker);
    // Cold, the first position to touch each implementation: an EIP-1167 delegation to a cold implementation and
    // one cold storage read, about 5.3k gas, or about 5.7k at EIP-8038's cold account access price.
    uint256 limit = (calculator.PROBE_GAS() * 60) / 100;

    uint256 getATP = _smallestStipend(address(staker), IATPStaker.getATP.selector, address(0), false, address(atp));
    uint256 getRegistry =
      _smallestStipend(address(atp), IATP.getRegistry.selector, address(0), false, address(registry));
    uint256 isATP =
      _smallestStipend(address(factory), IPremiumATPFactory.isATP.selector, address(atp), true, address(1));
    uint256 getStaker =
      _smallestStipend(address(atp), IPremiumATP.getStaker.selector, address(0), false, address(staker));
    uint256 isAttester =
      _smallestStipend(address(staker), IPremiumATPStaker.isAttester.selector, attester, true, address(1));

    emit log_named_uint("staker.getATP()", getATP);
    emit log_named_uint("atp.getRegistry()", getRegistry);
    emit log_named_uint("factory.isATP(atp)", isATP);
    emit log_named_uint("atp.getStaker()", getStaker);
    emit log_named_uint("staker.isAttester(attester)", isAttester);
    assertLe(getATP, limit, "getATP");
    assertLe(getRegistry, limit, "getRegistry");
    assertLe(isATP, limit, "isATP");
    assertLe(getStaker, limit, "getStaker");
    assertLe(isAttester, limit, "isAttester");
  }

  /// @dev Binary-searches the smallest stipend for which the probe returns `_expected`. Each attempt is a separate
  ///      transaction under isolation, so every attempt starts cold.
  function _smallestStipend(address _target, bytes4 _selector, address _arg, bool _isBool, address _expected)
    internal
    view
    returns (uint256 low)
  {
    uint256 high = calculator.PROBE_GAS();
    assertTrue(_probeAnswers(_target, _selector, _arg, _isBool, _expected, high), "genuine probe fails at PROBE_GAS");
    low = 0;
    while (low + 1 < high) {
      uint256 mid = (low + high) / 2;
      if (_probeAnswers(_target, _selector, _arg, _isBool, _expected, mid)) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return high;
  }

  function _probeAnswers(
    address _target,
    bytes4 _selector,
    address _arg,
    bool _isBool,
    address _expected,
    uint256 _gas
  ) internal view returns (bool) {
    if (_isBool) {
      (bool ok, bool result) = probeMeter.probeBool(_target, _selector, _arg, _gas);
      return ok && result == (_expected != address(0));
    }
    (bool okAddress, address answer) = probeMeter.probeAddress(_target, _selector, _gas);
    return okAddress && answer == _expected;
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
      if (_scenario == Scenario.Genuine) {
        (, PremiumATPStaker staker) = _position();
        proposers[i] = _stake(staker);
        expected[i] = PREMIUM;
        continue;
      }

      proposers[i] = _newAttester();
      expected[i] = DEFAULT_REWARD;
      ProbeTarget withdrawer = new ProbeTarget();
      gse.setWithdrawer(proposers[i], address(withdrawer));

      if (_scenario == Scenario.ExpensiveWithdrawerGenuinePosition) {
        (PremiumATP atp,) = _position();
        withdrawer.expensive(IATPStaker.getATP.selector, uint256(uint160(address(atp))));
      } else if (_scenario == Scenario.ExpensiveWithdrawerExpensivePosition) {
        ProbeTarget atp = new ProbeTarget();
        withdrawer.expensive(IATPStaker.getATP.selector, uint256(uint160(address(atp))));
        atp.expensive(IATP.getRegistry.selector, uint256(uint160(address(registry))));
      } else if (
        _scenario == Scenario.ExpensiveWithdrawerReturnBombPosition
          || _scenario == Scenario.ExpensiveWithdrawerOutOfGasReturnBombPosition
      ) {
        ProbeTarget atp = new ProbeTarget();
        withdrawer.expensive(IATPStaker.getATP.selector, uint256(uint160(address(atp))));
        bool fits = _scenario == Scenario.ExpensiveWithdrawerReturnBombPosition;
        uint256 size = fits ? SUCCESSFUL_RETURN_BOMB_SIZE : 64 * 1024;
        atp.setResponse(
          IATP.getRegistry.selector, ProbeTarget.Mode.ReturnSize, uint256(uint160(address(registry))), size
        );
        // Under isolation this call is cold, as the calculator's probe is.
        (bool success, uint256 returned) = _rawProbe(address(atp), IATP.getRegistry.selector, calculator.PROBE_GAS());
        if (fits) {
          assertTrue(success, "the oversized return must fit the probe stipend");
          assertEq(returned, size, "oversized return data size");
        } else {
          assertFalse(success, "the return bomb must run out of the probe stipend");
        }
      } else if (_scenario == Scenario.BurningWithdrawer) {
        withdrawer.setResponse(IATPStaker.getATP.selector, ProbeTarget.Mode.Burn, 0, 0);
      } else {
        ProbeTarget atp = new ProbeTarget();
        ProbeTarget source = new ProbeTarget();
        source.answer(IPremiumATPFactory.getGSE.selector, address(gse));
        address ownRegistry = makeAddr(string.concat("registry of ", vm.toString(proposers[i])));
        vm.prank(governance);
        calculator.setRegistryReward(ownRegistry, PREMIUM, address(source));
        withdrawer.expensive(IATPStaker.getATP.selector, uint256(uint160(address(atp))));
        atp.expensive(IATP.getRegistry.selector, uint256(uint160(ownRegistry)));
        source.expensive(IPremiumATPFactory.isATP.selector, 1);
        atp.expensive(IPremiumATP.getStaker.selector, uint256(uint160(address(withdrawer))));
        bool passes = _scenario == Scenario.AllProbesExpensiveAllPass;
        withdrawer.expensive(IPremiumATPStaker.isAttester.selector, passes ? 1 : 0);
        expected[i] = passes ? PREMIUM : DEFAULT_REWARD;
      }
    }
  }
}
