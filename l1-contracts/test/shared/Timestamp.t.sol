// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

contract TimestampTest is Test {
  function test_addTimestamp(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max - a);

    uint256 expected = a + b;

    Timestamp tsA = Timestamp.wrap(a);
    Timestamp tsB = Timestamp.wrap(b);
    Timestamp tsC = tsA + tsB;
    assertEq(Timestamp.unwrap(tsC), expected);
  }

  function test_subTimestamp(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, a); // Ensure b <= a to avoid underflow

    uint256 expected = a - b;

    Timestamp tsA = Timestamp.wrap(a);
    Timestamp tsB = Timestamp.wrap(b);
    Timestamp tsC = tsA - tsB;
    assertEq(Timestamp.unwrap(tsC), expected);
  }

  function test_ltTimestamp(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a < b;

    Timestamp tsA = Timestamp.wrap(a);
    Timestamp tsB = Timestamp.wrap(b);
    bool result = tsA < tsB;
    assertEq(result, expected);
  }

  function test_lteTimestamp(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a <= b;

    Timestamp tsA = Timestamp.wrap(a);
    Timestamp tsB = Timestamp.wrap(b);
    bool result = tsA <= tsB;
    assertEq(result, expected);
  }

  function test_gtTimestamp(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a > b;

    Timestamp tsA = Timestamp.wrap(a);
    Timestamp tsB = Timestamp.wrap(b);
    bool result = tsA > tsB;
    assertEq(result, expected);
  }

  function test_gteTimestamp(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a >= b;

    Timestamp tsA = Timestamp.wrap(a);
    Timestamp tsB = Timestamp.wrap(b);
    bool result = tsA >= tsB;
    assertEq(result, expected);
  }

  function test_neqTimestamp(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a != b;

    Timestamp tsA = Timestamp.wrap(a);
    Timestamp tsB = Timestamp.wrap(b);
    bool result = tsA != tsB;
    assertEq(result, expected);
  }

  function test_eqTimestamp(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a == b;

    Timestamp tsA = Timestamp.wrap(a);
    Timestamp tsB = Timestamp.wrap(b);
    bool result = tsA == tsB;
    assertEq(result, expected);
  }
}
