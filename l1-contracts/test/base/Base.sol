// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Test} from "forge-std/Test.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {
  AttesterView, Exit, Status, AttesterConfig
} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {
  AppendOnlyTreeSnapshot,
  PartialStateReference,
  StateReference
} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";

contract TestBase is Test {
  using stdStorage for StdStorage;

  // Empty values
  AppendOnlyTreeSnapshot EMPTY_APPENDONLY_TREE_SNAPSHOT =
    AppendOnlyTreeSnapshot({root: bytes32(0), nextAvailableLeafIndex: 0});

  PartialStateReference EMPTY_PARTIALSTATE_REFERENCE = PartialStateReference({
    noteHashTree: EMPTY_APPENDONLY_TREE_SNAPSHOT,
    nullifierTree: EMPTY_APPENDONLY_TREE_SNAPSHOT,
    publicDataTree: EMPTY_APPENDONLY_TREE_SNAPSHOT
  });

  StateReference EMPTY_STATE_REFERENCE = StateReference({
    l1ToL2MessageTree: EMPTY_APPENDONLY_TREE_SNAPSHOT,
    partialStateReference: EMPTY_PARTIALSTATE_REFERENCE
  });

  function _assertGt(Timestamp a, Timestamp b) internal {
    if (a <= b) {
      emit log("Error: a > b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", Timestamp.unwrap(b));
      fail();
    }
  }

  function _assertGt(Timestamp a, uint256 b) internal {
    if (a <= Timestamp.wrap(b)) {
      emit log("Error: a > b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function _assertGt(Timestamp a, Timestamp b, string memory err) internal {
    if (a <= b) {
      emit log_named_string("Error", err);
      _assertGt(a, b);
    }
  }

  function _assertGt(Timestamp a, uint256 b, string memory err) internal {
    if (a <= Timestamp.wrap(b)) {
      emit log_named_string("Error", err);
      _assertGt(a, b);
    }
  }

  function _assertLe(Timestamp a, Timestamp b) internal {
    if (a > b) {
      emit log("Error: a <= b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", Timestamp.unwrap(b));
      fail();
    }
  }

  function _assertLe(Timestamp a, uint256 b) internal {
    if (a > Timestamp.wrap(b)) {
      emit log("Error: a <= b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function _assertLe(Timestamp a, Timestamp b, string memory err) internal {
    if (a > b) {
      emit log_named_string("Error", err);
      _assertLe(a, b);
    }
  }

  function _assertLe(Timestamp a, uint256 b, string memory err) internal {
    if (a > Timestamp.wrap(b)) {
      emit log_named_string("Error", err);
      _assertLe(a, b);
    }
  }

  function _assertLt(Timestamp a, Timestamp b) internal {
    if (a >= b) {
      emit log("Error: a < b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", Timestamp.unwrap(b));
      fail();
    }
  }

  function _assertLt(Timestamp a, uint256 b) internal {
    if (a >= Timestamp.wrap(b)) {
      emit log("Error: a < b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function _assertLt(Timestamp a, Timestamp b, string memory err) internal {
    if (a >= b) {
      emit log_named_string("Error", err);
      _assertLt(a, b);
    }
  }

  function _assertLt(Timestamp a, uint256 b, string memory err) internal {
    if (a >= Timestamp.wrap(b)) {
      emit log_named_string("Error", err);
      _assertLt(a, b);
    }
  }

  function _assertEq(Timestamp a, Timestamp b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", Timestamp.unwrap(b));
      fail();
    }
  }

  function _assertEq(Timestamp a, uint256 b) internal {
    if (a != Timestamp.wrap(b)) {
      emit log("Error: a == b not satisfied [Timestamp]");
      emit log_named_uint("      Left", Timestamp.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function _assertEq(Timestamp a, Timestamp b, string memory err) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      _assertEq(a, b);
    }
  }

  function _assertEq(Timestamp a, uint256 b, string memory err) internal {
    if (a != Timestamp.wrap(b)) {
      emit log_named_string("Error", err);
      _assertEq(a, b);
    }
  }

  // Slots

  function _assertEq(Slot a, Slot b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [Slot]");
      emit log_named_uint("      Left", Slot.unwrap(a));
      emit log_named_uint("     Right", Slot.unwrap(b));
      fail();
    }
  }

  function _assertEq(uint256 a, Slot b) internal {
    if (Slot.wrap(a) != b) {
      emit log("Error: a == b not satisfied [Slot]");
      emit log_named_uint("      Left", a);
      emit log_named_uint("     Right", Slot.unwrap(b));
      fail();
    }
  }

  function _assertEq(Slot a, uint256 b) internal {
    if (a != Slot.wrap(b)) {
      emit log("Error: a == b not satisfied [Slot]");
      emit log_named_uint("      Left", Slot.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function _assertEq(Slot a, Slot b, string memory err) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      _assertEq(a, b);
    }
  }

  function _assertEq(uint256 a, Slot b, string memory err) internal {
    if (Slot.wrap(a) != b) {
      emit log_named_string("Error", err);
      _assertEq(a, b);
    }
  }

  function _assertEq(Slot a, uint256 b, string memory err) internal {
    if (a != Slot.wrap(b)) {
      emit log_named_string("Error", err);
      _assertEq(a, b);
    }
  }

  // Epochs

  function _assertEq(Epoch a, Epoch b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [Epoch]");
      emit log_named_uint("      Left", Epoch.unwrap(a));
      emit log_named_uint("     Right", Epoch.unwrap(b));
      fail();
    }
  }

  function _assertEq(Epoch a, uint256 b) internal {
    if (a != Epoch.wrap(b)) {
      emit log("Error: a == b not satisfied [Epoch]");
      emit log_named_uint("      Left", Epoch.unwrap(a));
      emit log_named_uint("     Right", b);
      fail();
    }
  }

  function _assertEq(Epoch a, Epoch b, string memory err) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      _assertEq(a, b);
    }
  }

  function _assertEq(Epoch a, uint256 b, string memory err) internal {
    if (a != Epoch.wrap(b)) {
      emit log_named_string("Error", err);
      _assertEq(a, b);
    }
  }

  function _logStatus(Status status) internal {
    string memory statusString;
    if (status == Status.ZOMBIE) {
      statusString = "ZOMBIE";
    } else if (status == Status.VALIDATING) {
      statusString = "VALIDATING";
    } else if (status == Status.EXITING) {
      statusString = "EXITING";
    } else {
      statusString = "NONE";
    }

    emit log_named_string("status", statusString);
  }

  function _logAttesterConfig(AttesterConfig memory config) internal {
    emit log("attester config");
    emit log_named_address("\twithdrawer", config.withdrawer);
  }

  function _logExit(Exit memory exit) internal {
    emit log("exit");
    emit log_named_decimal_uint("\tamount", exit.amount, 18);
    emit log_named_uint("\texitableAt", Timestamp.unwrap(exit.exitableAt));
    emit log_named_address("\trecipientOrWithdrawer", exit.recipientOrWithdrawer);
    emit log_named_string("\tisRecipient", exit.isRecipient ? "true" : "false");
  }

  function _logAttesterView(AttesterView memory s) internal {
    _logStatus(s.status);
    _logAttesterConfig(s.config);
    if (s.exit.exists) {
      _logExit(s.exit);
    }
    emit log_named_decimal_uint("\tEffective balance", s.effectiveBalance, 18);
  }

  // Blobs

  function _skipBlobCheck(address rollup) internal {
    // For not entirely clear reasons, the checked_write and find in stdStore breaks with
    // under/overflow errors if using them. But we can still use them to find the slot
    // and looking in the logs. Interesting.
    // Alternative, run forge inspect src/core/Rollup.sol:Rollup storageLayout --pretty
    //    uint256 slot = stdstore.target(address(rollup)).sig("checkBlob()").find();
    vm.store(address(rollup), bytes32(uint256(4)), bytes32(uint256(0)));
  }
}
