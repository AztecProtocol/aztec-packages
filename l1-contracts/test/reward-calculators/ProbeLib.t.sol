// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {IATP, IATPStaker} from "@test/reward-calculators/IATP.sol";
import {ProbeLib} from "@test/reward-calculators/ProbeLib.sol";
import {
  MockATP,
  MockATPStaker,
  RevertingAddressGetter,
  VariableReturnDataAddressGetter,
  DirtyAddressGetter,
  GasBurningAddressGetter,
  ExpensiveAddressGetter,
  RawReturnGetter
} from "@test/reward-calculators/mocks/ATPMocks.sol";

interface IMembership {
  function isMember(address _account) external view returns (bool);
}

contract Membership is IMembership {
  mapping(address account => bool member) internal members;

  function setMember(address _account, bool _member) external {
    members[_account] = _member;
  }

  function isMember(address _account) external view override(IMembership) returns (bool) {
    return members[_account];
  }
}

/// @notice Unit tests of the bounded probes used by sequencer reward calculators.
contract ProbeLibTest is Test {
  uint256 internal constant PROBE_GAS = 20_000;
  // Caller-side cost of a probe around the stipend: EXTCODESIZE (cold at most), the call and a few opcodes.
  uint256 internal constant PROBE_OVERHEAD = 3500;

  function test_ReturnsTheAddress() external {
    address answer = makeAddr("atp");
    MockATPStaker staker = new MockATPStaker(answer);
    (bool responded, address result) = ProbeLib.tryGetAddress(address(staker), IATPStaker.getATP.selector, PROBE_GAS);
    assertTrue(responded);
    assertEq(result, answer);
  }

  function test_ReturnsTheZeroAddress() external {
    MockATPStaker staker = new MockATPStaker(address(0));
    (bool responded, address result) = ProbeLib.tryGetAddress(address(staker), IATPStaker.getATP.selector, PROBE_GAS);
    assertTrue(responded);
    assertEq(result, address(0));
  }

  function test_RejectsAccountsWithoutCode() external {
    _assertAddressProbeFails(makeAddr("eoa"));
    _assertAddressProbeFails(address(0));
    // RIPEMD-160 answers any input with a 32-byte word whose upper 96 bits are clean.
    (bool ok, bytes memory data) = address(3).staticcall(abi.encodeWithSelector(IATPStaker.getATP.selector));
    assertTrue(ok && data.length == 32 && uint256(bytes32(data)) >> 160 == 0, "precompile answers like a contract");
    _assertAddressProbeFails(address(3));
  }

  function test_RejectsAMissingFunction() external {
    // A contract that only answers `getRegistry()` (an ATP) does not answer `getATP()`.
    _assertAddressProbeFails(address(new MockATP(makeAddr("registry"))));
  }

  function test_RejectsARevertWithAWellFormedPayload() external {
    _assertAddressProbeFails(address(new RevertingAddressGetter()));
  }

  function test_RejectsTooLittleData() external {
    _assertAddressProbeFails(address(new VariableReturnDataAddressGetter(0)));
    _assertAddressProbeFails(address(new VariableReturnDataAddressGetter(31)));
  }

  function test_RejectsTooMuchData() external {
    _assertAddressProbeFails(address(new VariableReturnDataAddressGetter(33)));
    _assertAddressProbeFails(address(new VariableReturnDataAddressGetter(64)));
  }

  function test_RejectsDirtyUpperBits() external {
    _assertAddressProbeFails(address(new DirtyAddressGetter()));
  }

  function test_GasBurnIsBoundedByTheStipend() external {
    _assertAddressProbeFailsWithin(address(new GasBurningAddressGetter()));
  }

  function test_ReturnBombIsNotCopied() external {
    // 64 KiB fits the stipend, so the call succeeds; copying it would cost the caller about as much again.
    address target = address(new VariableReturnDataAddressGetter(64 * 1024));
    (bool ok, bytes memory data) = target.staticcall{gas: PROBE_GAS}("");
    assertTrue(ok && data.length == 64 * 1024, "bomb did not fit the stipend");

    _assertAddressProbeFailsWithin(address(new VariableReturnDataAddressGetter(64 * 1024)));
  }

  function test_ReturnBombBeyondTheStipendFails() external {
    _assertAddressProbeFailsWithin(address(new VariableReturnDataAddressGetter(1024 * 1024)));
  }

  function test_ForwardsTheStipend() external {
    // A target that spends all but a few hundred gas of the stipend still answers.
    address answer = makeAddr("answer");
    address target = address(new ExpensiveAddressGetter(answer));
    (bool responded, address result) = ProbeLib.tryGetAddress(target, IATPStaker.getATP.selector, PROBE_GAS);
    assertTrue(responded);
    assertEq(result, answer);
  }

  function test_SendsOnlyTheSelector() external {
    MockATP atp = new MockATP(makeAddr("registry"));
    vm.expectCall(address(atp), abi.encodeWithSelector(IATP.getRegistry.selector), 1);
    ProbeLib.tryGetAddress(address(atp), IATP.getRegistry.selector, PROBE_GAS);
  }

  function test_FuzzAddressProbe(bytes memory _response, bool _reverts) external {
    address target = address(new RawReturnGetter(_response, _reverts));
    bool wellFormed = !_reverts && _response.length == 32 && uint256(bytes32(_response)) >> 160 == 0;
    (bool responded, address result) = ProbeLib.tryGetAddress(target, IATPStaker.getATP.selector, PROBE_GAS);
    assertEq(responded, wellFormed);
    // forge-lint: disable-next-line(unsafe-typecast)
    assertEq(result, wellFormed ? address(uint160(uint256(bytes32(_response)))) : address(0));
  }

  function test_FuzzAddressProbeWord(uint256 _word) external {
    address target = address(new RawReturnGetter(abi.encode(_word), false));
    (bool responded, address result) = ProbeLib.tryGetAddress(target, IATPStaker.getATP.selector, PROBE_GAS);
    assertEq(responded, _word >> 160 == 0);
    // forge-lint: disable-next-line(unsafe-typecast)
    assertEq(result, _word >> 160 == 0 ? address(uint160(_word)) : address(0));
  }

  function test_BoolProbePassesTheArgument() external {
    Membership membership = new Membership();
    address member = makeAddr("member");
    membership.setMember(member, true);

    vm.expectCall(address(membership), abi.encodeCall(IMembership.isMember, (member)), 1);
    (bool responded, bool result) =
      ProbeLib.tryGetBool(address(membership), IMembership.isMember.selector, member, PROBE_GAS);
    assertTrue(responded);
    assertTrue(result);

    (responded, result) =
      ProbeLib.tryGetBool(address(membership), IMembership.isMember.selector, makeAddr("other"), PROBE_GAS);
    assertTrue(responded);
    assertFalse(result);
  }

  function test_BoolProbeRejectsMalformedAnswers() external {
    _assertBoolProbeFails(makeAddr("eoa"));
    _assertBoolProbeFails(address(new RawReturnGetter(abi.encode(uint256(2)), false)));
    _assertBoolProbeFails(address(new RawReturnGetter(abi.encode(true), true)));
    _assertBoolProbeFails(address(new VariableReturnDataAddressGetter(31)));
    _assertBoolProbeFails(address(new VariableReturnDataAddressGetter(33)));
    _assertBoolProbeFails(address(new VariableReturnDataAddressGetter(64 * 1024)));
    _assertBoolProbeFails(address(new GasBurningAddressGetter()));
  }

  function test_FuzzBoolProbeWord(uint256 _word) external {
    address target = address(new RawReturnGetter(abi.encode(_word), false));
    (bool responded, bool result) =
      ProbeLib.tryGetBool(target, IMembership.isMember.selector, makeAddr("account"), PROBE_GAS);
    assertEq(responded, _word <= 1);
    assertEq(result, _word == 1);
  }

  function _assertAddressProbeFails(address _target) internal view {
    (bool responded, address result) = ProbeLib.tryGetAddress(_target, IATPStaker.getATP.selector, PROBE_GAS);
    assertFalse(responded, "malformed answer accepted");
    assertEq(result, address(0));
  }

  function _assertAddressProbeFailsWithin(address _target) internal view {
    uint256 gasBefore = gasleft();
    (bool responded, address result) = ProbeLib.tryGetAddress(_target, IATPStaker.getATP.selector, PROBE_GAS);
    uint256 gasUsed = gasBefore - gasleft();
    assertFalse(responded, "malformed answer accepted");
    assertEq(result, address(0));
    assertLe(gasUsed, PROBE_GAS + PROBE_OVERHEAD, "probe cost above its stipend");
  }

  function _assertBoolProbeFails(address _target) internal {
    (bool responded, bool result) =
      ProbeLib.tryGetBool(_target, IMembership.isMember.selector, makeAddr("account"), PROBE_GAS);
    assertFalse(responded, "malformed answer accepted");
    assertFalse(result);
  }
}
