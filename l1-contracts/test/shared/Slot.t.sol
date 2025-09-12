// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Slot} from "@aztec/shared/libraries/TimeMath.sol";

contract SlotTest is Test {
  function test_addSlot(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max - a);

    uint256 expected = a + b;

    Slot slotA = Slot.wrap(a);
    Slot slotB = Slot.wrap(b);
    Slot slotC = slotA + slotB;
    assertEq(Slot.unwrap(slotC), expected);
  }

  function test_subSlot(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, a); // Ensure b <= a to avoid underflow

    uint256 expected = a - b;

    Slot slotA = Slot.wrap(a);
    Slot slotB = Slot.wrap(b);
    Slot slotC = slotA - slotB;
    assertEq(Slot.unwrap(slotC), expected);
  }

  function test_ltSlot(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a < b;

    Slot slotA = Slot.wrap(a);
    Slot slotB = Slot.wrap(b);
    bool result = slotA < slotB;
    assertEq(result, expected);
  }

  function test_lteSlot(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a <= b;

    Slot slotA = Slot.wrap(a);
    Slot slotB = Slot.wrap(b);
    bool result = slotA <= slotB;
    assertEq(result, expected);
  }

  function test_gtSlot(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a > b;

    Slot slotA = Slot.wrap(a);
    Slot slotB = Slot.wrap(b);
    bool result = slotA > slotB;
    assertEq(result, expected);
  }

  function test_gteSlot(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a >= b;

    Slot slotA = Slot.wrap(a);
    Slot slotB = Slot.wrap(b);
    bool result = slotA >= slotB;
    assertEq(result, expected);
  }

  function test_neqSlot(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a != b;

    Slot slotA = Slot.wrap(a);
    Slot slotB = Slot.wrap(b);
    bool result = slotA != slotB;
    assertEq(result, expected);
  }

  function test_eqSlot(uint256 _a, uint256 _b) public pure {
    uint256 a = bound(_a, 0, type(uint256).max);
    uint256 b = bound(_b, 0, type(uint256).max);

    bool expected = a == b;

    Slot slotA = Slot.wrap(a);
    Slot slotB = Slot.wrap(b);
    bool result = slotA == slotB;
    assertEq(result, expected);
  }
}
