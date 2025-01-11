// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Timestamp, Slot, Epoch, SlotLib, EpochLib} from "@aztec/core/libraries/TimeMath.sol";
import {Test} from "forge-std/Test.sol";

contract TestBase is Test {
  using SlotLib for Slot;
  using EpochLib for Epoch;

  function assertGt(Timestamp a, Timestamp b) internal {
    if (a <= b) {
      emit log("Error: a > b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", Timestamp.unwrap(b));
      fail();
    }
  }

  function assertGt(Timestamp a, uint256 b) internal {
    if (a <= Timestamp.wrap(b)) {
      emit log("Error: a > b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function assertGt(Timestamp a, Timestamp b, string memory err) internal {
    if (a <= b) {
      emit log_named_string("Error", err);
      assertGt(a, b);
    }
  }

  function assertGt(Timestamp a, uint256 b, string memory err) internal {
    if (a <= Timestamp.wrap(b)) {
      emit log_named_string("Error", err);
      assertGt(a, b);
    }
  }

  function assertLe(Timestamp a, Timestamp b) internal {
    if (a > b) {
      emit log("Error: a <= b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", Timestamp.unwrap(b));
      fail();
    }
  }

  function assertLe(Timestamp a, uint256 b) internal {
    if (a > Timestamp.wrap(b)) {
      emit log("Error: a <= b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function assertLe(Timestamp a, Timestamp b, string memory err) internal {
    if (a > b) {
      emit log_named_string("Error", err);
      assertLe(a, b);
    }
  }

  function assertLe(Timestamp a, uint256 b, string memory err) internal {
    if (a > Timestamp.wrap(b)) {
      emit log_named_string("Error", err);
      assertLe(a, b);
    }
  }

  function assertLt(Timestamp a, Timestamp b) internal {
    if (a >= b) {
      emit log("Error: a < b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", Timestamp.unwrap(b));
      fail();
    }
  }

  function assertLt(Timestamp a, uint256 b) internal {
    if (a >= Timestamp.wrap(b)) {
      emit log("Error: a < b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function assertLt(Timestamp a, Timestamp b, string memory err) internal {
    if (a >= b) {
      emit log_named_string("Error", err);
      assertLt(a, b);
    }
  }

  function assertLt(Timestamp a, uint256 b, string memory err) internal {
    if (a >= Timestamp.wrap(b)) {
      emit log_named_string("Error", err);
      assertLt(a, b);
    }
  }

  function assertEq(Timestamp a, Timestamp b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", Timestamp.unwrap(b));
      fail();
    }
  }

  function assertEq(Timestamp a, uint256 b) internal {
    if (a != Timestamp.wrap(b)) {
      emit log("Error: a == b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function assertEq(Timestamp a, Timestamp b, string memory err) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }

  function assertEq(Timestamp a, uint256 b, string memory err) internal {
    if (a != Timestamp.wrap(b)) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }

  // Slots

  function assertEq(Slot a, Slot b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [Slot]");
      emit log_named_uint("      Left", a.unwrap());
      emit log_named_uint("     Right", b.unwrap());
      fail();
    }
  }

  function assertEq(uint256 a, Slot b) internal {
    if (Slot.wrap(a) != b) {
      emit log("Error: a == b not satisfied [Slot]");
      emit log_named_uint("      Left", a);
      emit log_named_uint("     Right", b.unwrap());
      fail();
    }
  }

  function assertEq(Slot a, uint256 b) internal {
    if (a != Slot.wrap(b)) {
      emit log("Error: a == b not satisfied [Slot]");
      emit log_named_uint("      Left", a.unwrap());
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function assertEq(Slot a, Slot b, string memory err) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }

  function assertEq(uint256 a, Slot b, string memory err) internal {
    if (Slot.wrap(a) != b) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }

  function assertEq(Slot a, uint256 b, string memory err) internal {
    if (a != Slot.wrap(b)) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }

  // Epochs

  function assertEq(Epoch a, Epoch b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [Epoch]");
      emit log_named_uint("      Left", a.unwrap());
      emit log_named_uint("     Right", b.unwrap());
      fail();
    }
  }

  function assertEq(Epoch a, uint256 b) internal {
    if (a != Epoch.wrap(b)) {
      emit log("Error: a == b not satisfied [Epoch]");
      emit log_named_uint("      Left", a.unwrap());
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function assertEq(Epoch a, Epoch b, string memory err) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }

  function assertEq(Epoch a, uint256 b, string memory err) internal {
    if (a != Epoch.wrap(b)) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }

  // Blobs

  function skipBlobCheck(address rollup) internal {
    // 9 is the slot of checkBlob. We force it to be false (=0):
    // Slot number can be checked by running forge inspect src/core/Rollup.sol:Rollup storage
    vm.store(rollup, bytes32(uint256(9)), 0);
  }
}
