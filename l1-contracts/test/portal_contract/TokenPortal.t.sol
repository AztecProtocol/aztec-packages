pragma solidity >=0.8.18;

import "forge-std/Test.sol";

// Rollup Proccessor
import {Rollup} from "@aztec/core/Rollup.sol";
import {IInbox} from "@aztec/interfaces/message_bridge/IInbox.sol";
import {IMessageBox} from "@aztec/interfaces/message_bridge/IMessageBox.sol";
import {IRegistryReader} from "@aztec/interfaces/message_bridge/IRegistryReader.sol";

// Portal tokens
import {TokenPortal} from "./TokenPortal.sol";
import {PortalERC20} from "./PortalERC20.sol";

contract TokenPortalTest is Test {
  Rollup rollup;

  TokenPortal tokenPortal;
  PortalERC20 portalERC20;

  function setUp() public {
    rollup = new Rollup();

    portalERC20 = new PortalERC20();
    tokenPortal = new TokenPortal(rollup.REGISTRY(), portalERC20);

    vm.deal(address(this), 100 ether);
  }

  function testArrivesInMessageBox() public {
    // Send a message to the inbox

    // TODO: interface stuff for inbox
    IInbox inbox = IInbox(address(rollup.INBOX()));

    IMessageBox.L2Actor memory recipient = IMessageBox.L2Actor({actor: 0, version: uint256(0x1)});

    bytes32 entryKey = IInbox(inbox).sendL2Message{value: 1 ether}(recipient, 0, 0, 0);

    // Check that the message is in the inbox
    IMessageBox.Entry memory entry = IInbox(inbox).get(entryKey);
    assertEq(entry.count, 1);
  }
}
