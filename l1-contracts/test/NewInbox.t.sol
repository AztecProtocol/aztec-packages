// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";
import {NewInbox} from "../src/core/messagebridge/NewInbox.sol";
import {Constants} from "../src/core/libraries/ConstantsGen.sol";
import {Errors} from "../src/core/libraries/Errors.sol";

import {DataStructures} from "../src/core/libraries/DataStructures.sol";

contract NewInboxTest is Test {
  NewInbox internal inbox;
  uint256 internal version = 0;

  function setUp() public {
    address rollup = address(this);
    inbox = new NewInbox(rollup, 10, 0);
  }

  function _fakeMessage() internal view returns (DataStructures.L1ToL2Msg memory) {
    return DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor({actor: address(this), chainId: block.chainid}),
      recipient: DataStructures.L2Actor({
        actor: 0x1000000000000000000000000000000000000000000000000000000000000000,
        version: version
      }),
      content: 0x2000000000000000000000000000000000000000000000000000000000000000,
      secretHash: 0x3000000000000000000000000000000000000000000000000000000000000000,
      fee: 0,
      deadline: 0
    });
  }

  function testRevertIfNotConsumingFromRollup() public {
    vm.prank(address(0x1));
    vm.expectRevert(Errors.Inbox__Unauthorized.selector);
    inbox.consume();
  }
}
