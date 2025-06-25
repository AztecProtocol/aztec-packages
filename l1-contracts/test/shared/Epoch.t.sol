// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";

contract EpochTest is Test {
  function test_addEpoch(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max - a);

    uint256 expected = a + b;

    Epoch epochA = Epoch.wrap(a);
    Epoch epochB = Epoch.wrap(b);
    Epoch epochC = epochA + epochB;
    assertEq(Epoch.unwrap(epochC), expected);
  }

  function test_subEpoch(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, a); // Ensure b <= a to avoid underflow

    uint256 expected = a - b;

    Epoch epochA = Epoch.wrap(a);
    Epoch epochB = Epoch.wrap(b);
    Epoch epochC = epochA - epochB;
    assertEq(Epoch.unwrap(epochC), expected);
  }

  function test_ltEpoch(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a < b;

    Epoch epochA = Epoch.wrap(a);
    Epoch epochB = Epoch.wrap(b);
    bool result = epochA < epochB;
    assertEq(result, expected);
  }

  function test_lteEpoch(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a <= b;

    Epoch epochA = Epoch.wrap(a);
    Epoch epochB = Epoch.wrap(b);
    bool result = epochA <= epochB;
    assertEq(result, expected);
  }

  function test_gtEpoch(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a > b;

    Epoch epochA = Epoch.wrap(a);
    Epoch epochB = Epoch.wrap(b);
    bool result = epochA > epochB;
    assertEq(result, expected);
  }

  function test_gteEpoch(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a >= b;

    Epoch epochA = Epoch.wrap(a);
    Epoch epochB = Epoch.wrap(b);
    bool result = epochA >= epochB;
    assertEq(result, expected);
  }

  function test_neqEpoch(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a != b;

    Epoch epochA = Epoch.wrap(a);
    Epoch epochB = Epoch.wrap(b);
    bool result = epochA != epochB;
    assertEq(result, expected);
  }

  function test_eqEpoch(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a == b;

    Epoch epochA = Epoch.wrap(a);
    Epoch epochB = Epoch.wrap(b);
    bool result = epochA == epochB;
    assertEq(result, expected);
  }
}
