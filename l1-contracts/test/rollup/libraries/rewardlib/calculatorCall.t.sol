// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  SequencerRewardCalculatorLib,
  MAX_SEQUENCER_REWARD_PER_CHECKPOINT,
  CALCULATOR_GAS_BASE,
  CALCULATOR_GAS_PER_CHECKPOINT,
  CALCULATOR_CALL_GAS_RESERVE
} from "@aztec/core/libraries/rollup/SequencerRewardCalculatorLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {
  ListCalculator,
  RawReturnCalculator,
  RevertingCalculator,
  GasBurningCalculator,
  ReturnBombCalculator,
  StateModifyingCalculator,
  GasReportingCalculator,
  TableCalculator
} from "@test/mock/SequencerRewardCalculatorMocks.sol";

contract CalculatorCallHarness {
  function tryGetSequencerRewards(
    address _calculator,
    Epoch _epoch,
    address[] memory _proposers,
    uint256 _defaultReward,
    uint256 _checkpointReward
  ) external view returns (bool, uint256[] memory, uint256) {
    return SequencerRewardCalculatorLib.tryGetSequencerRewards(
      _calculator, _epoch, _proposers, _defaultReward, _checkpointReward
    );
  }
}

/// @notice Unit tests of the defensive sequencer reward calculator call.
contract CalculatorCallTest is Test {
  uint256 internal constant DEFAULT_REWARD = 50e18;
  uint256 internal constant CHECKPOINT_REWARD = 100e18;
  Epoch internal constant EPOCH = Epoch.wrap(7);
  // Caller-side cost of one harness call around the staticcall: account accesses, calldata, encoding and the bounded
  // copy. At n = 32 it is about 15k, and about 23k under isolation (the default in recent forge versions), where each
  // top-level call is its own transaction and starts with cold accounts.
  uint256 internal constant CALLER_OVERHEAD = 30_000;

  CalculatorCallHarness internal harness;

  function setUp() public {
    harness = new CalculatorCallHarness();
  }

  function test_AcceptsWellFormedResponses() external {
    uint256[4] memory sizes = [uint256(1), 8, 16, 32];
    for (uint256 s = 0; s < sizes.length; s++) {
      uint256 n = sizes[s];
      uint256[] memory values = new uint256[](n);
      uint256 sum = 0;
      for (uint256 i = 0; i < n; i++) {
        values[i] = uint256(keccak256(abi.encode(n, i))) % (MAX_SEQUENCER_REWARD_PER_CHECKPOINT + 1);
        sum += values[i];
      }
      (bool accepted, uint256[] memory rewards, uint256 total) = _call(address(new ListCalculator(values)), n);
      assertTrue(accepted, "accepted");
      assertEq(rewards, values, "rewards");
      assertEq(total, sum, "total");
    }
  }

  function test_PassesTheArgumentsThrough() external {
    address[] memory proposers = _proposers(3);
    TableCalculator calculator = new TableCalculator();
    vm.expectCall(
      address(calculator),
      abi.encodeCall(
        ISequencerRewardCalculator.getSequencerRewards, (EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD)
      ),
      1
    );
    (bool accepted, uint256[] memory rewards,) =
      harness.tryGetSequencerRewards(address(calculator), EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD);
    assertTrue(accepted);
    assertEq(rewards.length, 3);
    for (uint256 i = 0; i < 3; i++) {
      assertEq(rewards[i], DEFAULT_REWARD);
    }
  }

  function test_AcceptsValueEqualToMax() external {
    uint256[] memory values = new uint256[](3);
    values[1] = MAX_SEQUENCER_REWARD_PER_CHECKPOINT;
    (bool accepted, uint256[] memory rewards, uint256 total) = _call(address(new ListCalculator(values)), 3);
    assertTrue(accepted);
    assertEq(rewards, values);
    assertEq(total, MAX_SEQUENCER_REWARD_PER_CHECKPOINT);
  }

  function test_RejectsValueAboveMax(uint256 _position, uint256 _value) external {
    uint256 n = 4;
    uint256 position = bound(_position, 0, n - 1);
    uint256[] memory values = new uint256[](n);
    values[position] = bound(_value, MAX_SEQUENCER_REWARD_PER_CHECKPOINT + 1, type(uint256).max);
    _assertRejected(address(new ListCalculator(values)), n);
  }

  function test_RejectsMaxPlusOneAtEveryPosition() external {
    uint256 n = 32;
    for (uint256 position = 0; position < n; position++) {
      uint256[] memory values = new uint256[](n);
      values[position] = MAX_SEQUENCER_REWARD_PER_CHECKPOINT + 1;
      _assertRejected(address(new ListCalculator(values)), n);
    }
  }

  function test_RejectsWrongLength() external {
    _assertRejected(address(new ListCalculator(new uint256[](3))), 4);
    _assertRejected(address(new ListCalculator(new uint256[](5))), 4);
    _assertRejected(address(new ListCalculator(new uint256[](0))), 1);
  }

  function test_RejectsTooLittleData() external {
    bytes memory response = abi.encode(new uint256[](4));
    _assertRejected(address(new RawReturnCalculator(_truncate(response, response.length - 1))), 4);
    _assertRejected(address(new RawReturnCalculator(_truncate(response, response.length - 32))), 4);
    _assertRejected(address(new RawReturnCalculator("")), 4);
  }

  function test_RejectsTooMuchData() external {
    bytes memory response = abi.encode(new uint256[](4));
    _assertRejected(address(new RawReturnCalculator(bytes.concat(response, hex"00"))), 4);
    _assertRejected(address(new RawReturnCalculator(bytes.concat(response, bytes32(0)))), 4);
  }

  function test_RejectsWrongOffset() external {
    uint256 n = 4;
    bytes memory response = abi.encode(new uint256[](n));
    for (uint256 offset = 0; offset < 0x80; offset += 0x10) {
      if (offset == 0x20) {
        continue;
      }
      assembly {
        mstore(add(response, 0x20), offset)
      }
      _assertRejected(address(new RawReturnCalculator(response)), n);
    }
  }

  function test_RejectsWrongLengthWordWithRightSize() external {
    uint256 n = 4;
    bytes memory response = abi.encode(new uint256[](n));
    uint256[3] memory lengths = [n - 1, n + 1, type(uint256).max];
    for (uint256 i = 0; i < lengths.length; i++) {
      uint256 length = lengths[i];
      assembly {
        mstore(add(response, 0x40), length)
      }
      _assertRejected(address(new RawReturnCalculator(response)), n);
    }
  }

  function test_RejectsRevert() external {
    _assertRejected(address(new RevertingCalculator(0)), 1);
    _assertRejected(address(new RevertingCalculator(64 + 32 * 1)), 1);
  }

  function test_RevertDataIsNotCopied() external {
    uint256 n = 32;
    uint256 used = _rejectedCallGas(address(new RevertingCalculator(1 << 20)), n);
    assertLe(used, _stipend(n) + CALLER_OVERHEAD, "revert data copied");
  }

  function test_RejectsStateChange() external {
    _assertRejected(address(new StateModifyingCalculator()), 2);
  }

  function test_RejectsAccountWithoutCode() external {
    _assertRejected(makeAddr("eoa"), 1);
    _assertRejected(address(0), 1);
    // The identity precompile echoes the calldata, which is never the size of a well-formed response.
    _assertRejected(address(4), 1);
  }

  function test_GasBurnIsBoundedByTheStipend() external {
    uint256[2] memory sizes = [uint256(1), 32];
    for (uint256 s = 0; s < sizes.length; s++) {
      uint256 n = sizes[s];
      uint256 used = _rejectedCallGas(address(new GasBurningCalculator()), n);
      assertGe(used, _stipend(n), "the calculator ran with the full stipend");
      assertLe(used, _stipend(n) + CALLER_OVERHEAD, "caller gas above stipend plus overhead");
    }
  }

  function test_ReturnBombIsNotCopied() external {
    // Each bomb is sized so that its memory expansion fits in the stipend, so the call itself succeeds. Copying the
    // response would cost the caller about as much again, which would break the bound below.
    _assertReturnBombBounded(1, 320 * 1024);
    _assertReturnBombBounded(32, 1024 * 1024);
  }

  function test_ForwardsExactlyTheStipend() external {
    uint256[4] memory sizes = [uint256(1), 8, 16, 32];
    for (uint256 s = 0; s < sizes.length; s++) {
      uint256 n = sizes[s];
      uint256 observed = _observedStipend(n, gasleft());
      assertLe(observed, _stipend(n), "above the stipend");
      // A bare fallback reads `gas()` a handful of opcodes after the call starts.
      assertGe(observed, _stipend(n) - 100, "below the stipend");
    }
  }

  function test_StipendDoesNotDependOnTheGasLeft(uint256 _gas) external {
    uint256 n = 4;
    uint256 full = _observedStipend(n, gasleft());
    uint256 gasLimit = bound(_gas, _stipend(n), 2 * _stipend(n));
    address calculator = address(new GasReportingCalculator());
    // Either the call is refused for lack of gas, or the transaction runs out of gas after it, or the calculator
    // ran with the full stipend. It never runs with less.
    try harness.tryGetSequencerRewards{
      gas: gasLimit
    }(
      calculator, EPOCH, _proposers(n), DEFAULT_REWARD, CHECKPOINT_REWARD
    ) returns (bool accepted, uint256[] memory rewards, uint256) {
      assertTrue(accepted);
      assertEq(rewards[0], full, "the calculator ran with less than the stipend");
    } catch (bytes memory reason) {
      if (reason.length > 0) {
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(bytes4(reason), Errors.SequencerRewardCalculatorLib__InsufficientGas.selector);
      }
    }
  }

  // Isolation runs every external call as its own transaction, so the calculator account is cold on each probe, as
  // it is in a proof submission.
  /// forge-config: default.isolate = true
  function test_SmallestSufficientGasForwardsTheFullStipend() external {
    address calculator = address(new GasReportingCalculator());
    _assertSmallestSufficientGasForwardsTheFullStipend(calculator, 1);
    _assertSmallestSufficientGasForwardsTheFullStipend(calculator, 32);
  }

  /// forge-config: default.isolate = true
  function test_SmallestSufficientGasForwardsTheFullStipendToADelegatedAccount() external {
    // An EIP-7702 delegated account costs the call a second cold account access, for the delegation target.
    address delegated = makeAddr("delegated");
    address implementation = address(new GasReportingCalculator());
    vm.etch(delegated, abi.encodePacked(hex"ef0100", implementation));
    _assertSmallestSufficientGasForwardsTheFullStipend(delegated, 1);
    _assertSmallestSufficientGasForwardsTheFullStipend(delegated, 32);
  }

  function test_RevertsWhenTheStipendCannotBeForwarded() external {
    uint256 n = 32;
    address calculator = address(new GasReportingCalculator());
    address[] memory proposers = _proposers(n);
    vm.expectPartialRevert(Errors.SequencerRewardCalculatorLib__InsufficientGas.selector);
    harness.tryGetSequencerRewards{gas: _stipend(n)}(calculator, EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD);
  }

  function test_ProtocolConstants() external pure {
    assertEq(MAX_SEQUENCER_REWARD_PER_CHECKPOINT, 1_000_000e18);
    assertEq(CALCULATOR_GAS_BASE, 200_000);
    assertEq(CALCULATOR_GAS_PER_CHECKPOINT, 100_000);
    // The worst case is an EIP-7702 delegated calculator: two cold account accesses at the EIP-8038 price of 3_000
    // (2_600 before it). The SmallestSufficientGas tests check by measurement that the reserve also covers the
    // opcodes between the gas check and the call.
    assertGe(CALCULATOR_CALL_GAS_RESERVE, 2 * 3000);
  }

  function test_FuzzRandomResponse(bytes memory _response, uint8 _count) external {
    uint256 n = bound(_count, 1, 32);
    _assertOracle(_response, n);
  }

  function test_FuzzStructuredResponse(uint256[] memory _values, uint8 _count, bool _shift) external {
    uint256 n = bound(_count, 1, 32);
    if (_values.length > 33) {
      assembly {
        mstore(_values, 33)
      }
    }
    for (uint256 i = 0; i < _values.length; i++) {
      // Mostly in range, sometimes above the bound.
      if (_shift || i % 3 != 0) {
        _values[i] = _values[i] % (MAX_SEQUENCER_REWARD_PER_CHECKPOINT + 2);
      }
    }
    _assertOracle(abi.encode(_values), n);
  }

  function _assertOracle(bytes memory _response, uint256 _n) internal {
    bool wellFormed = _response.length == 64 + 32 * _n;
    uint256[] memory expected = new uint256[](_n);
    uint256 expectedTotal = 0;
    if (wellFormed) {
      (uint256 offset, uint256 length) = abi.decode(_truncate(_response, 64), (uint256, uint256));
      wellFormed = offset == 32 && length == _n;
    }
    if (wellFormed) {
      expected = abi.decode(_response, (uint256[]));
      for (uint256 i = 0; i < _n; i++) {
        if (expected[i] > MAX_SEQUENCER_REWARD_PER_CHECKPOINT) {
          wellFormed = false;
        }
        expectedTotal += expected[i] > MAX_SEQUENCER_REWARD_PER_CHECKPOINT ? 0 : expected[i];
      }
    }

    (bool accepted, uint256[] memory rewards, uint256 total) = _call(address(new RawReturnCalculator(_response)), _n);
    assertEq(accepted, wellFormed, "accepted iff well formed");
    if (wellFormed) {
      assertEq(rewards, expected, "rewards");
      assertEq(total, expectedTotal, "total");
    }
  }

  function _assertReturnBombBounded(uint256 _n, uint256 _size) internal {
    uint256 used = _rejectedCallGas(address(new ReturnBombCalculator(_size)), _n);
    assertLe(used, _stipend(_n) + CALLER_OVERHEAD, "return data copied");
  }

  function _assertSmallestSufficientGasForwardsTheFullStipend(address _calculator, uint256 _n) internal {
    uint256 full = _observedStipend(_n, gasleft());
    address[] memory proposers = _proposers(_n);

    // Binary search the smallest gas limit with which the call completes.
    uint256 low = _stipend(_n);
    uint256 high = 2 * _stipend(_n);
    while (low < high) {
      uint256 mid = (low + high) / 2;
      try harness.tryGetSequencerRewards{
        gas: mid
      }(_calculator, EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD) returns (bool, uint256[] memory, uint256) {
        high = mid;
      } catch {
        low = mid + 1;
      }
    }

    (bool accepted, uint256[] memory rewards,) =
      harness.tryGetSequencerRewards{gas: low}(_calculator, EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD);
    assertTrue(accepted);
    assertEq(rewards[0], full, "the calculator ran with less than the stipend");
    emit log_named_uint("smallest sufficient gas limit above the stipend", low - _stipend(_n));
  }

  function _observedStipend(uint256 _n, uint256 _gas) internal returns (uint256) {
    address calculator = address(new GasReportingCalculator());
    (bool accepted, uint256[] memory rewards,) =
      harness.tryGetSequencerRewards{gas: _gas}(calculator, EPOCH, _proposers(_n), DEFAULT_REWARD, CHECKPOINT_REWARD);
    assertTrue(accepted, "gas reporter rejected");
    for (uint256 i = 1; i < _n; i++) {
      assertEq(rewards[i], rewards[0]);
    }
    return rewards[0];
  }

  function _assertRejected(address _calculator, uint256 _n) internal view {
    (bool accepted,,) = _call(_calculator, _n);
    assertFalse(accepted, "malformed response accepted");
  }

  /// @dev Gas of one rejected harness call, excluding the derivation of the proposers.
  function _rejectedCallGas(address _calculator, uint256 _n) internal view returns (uint256 used) {
    address[] memory proposers = _proposers(_n);
    uint256 gasBefore = gasleft();
    (bool accepted,,) = harness.tryGetSequencerRewards(_calculator, EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD);
    used = gasBefore - gasleft();
    assertFalse(accepted, "malformed response accepted");
  }

  function _call(address _calculator, uint256 _n) internal view returns (bool, uint256[] memory, uint256) {
    return harness.tryGetSequencerRewards(_calculator, EPOCH, _proposers(_n), DEFAULT_REWARD, CHECKPOINT_REWARD);
  }

  function _proposers(uint256 _n) internal pure returns (address[] memory proposers) {
    proposers = new address[](_n);
    for (uint256 i = 0; i < _n; i++) {
      proposers[i] = address(uint160(uint256(keccak256(abi.encode("proposer", i)))));
    }
  }

  function _stipend(uint256 _n) internal pure returns (uint256) {
    return CALCULATOR_GAS_BASE + CALCULATOR_GAS_PER_CHECKPOINT * _n;
  }

  function _truncate(bytes memory _data, uint256 _length) internal pure returns (bytes memory out) {
    out = new bytes(_length);
    for (uint256 i = 0; i < _length; i++) {
      out[i] = _data[i];
    }
  }
}
