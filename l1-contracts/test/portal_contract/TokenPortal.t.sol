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
    tokenPortal = new TokenPortal(IRegistryReader(address(rollup.REGISTRY())), portalERC20);

    vm.deal(address(this), 100 ether);
  }

  function testDeposit() public {
    IInbox inbox = IInbox(address(rollup.INBOX()));

    // mint token and approve to the portal
    portalERC20.mint(address(this), 1 ether);
    portalERC20.approve(address(tokenPortal), 1 ether);

    uint32 deadline = uint32(block.timestamp + 1 days);
    bytes32 messageHash = bytes32(0x2d749407d8c364537cdeb799c1574929cb22ff1ece2b96d2a1c6fa287a0e0171);
    uint256 amount = 100;
    bytes32 secretHash = 0x147e4fec49805c924e28150fc4b36824679bc17ecb1d7d9f6a9effb7fde6b6a0;
    bytes32 entryKey = tokenPortal.depositToAztec{value: 1 ether}(messageHash, amount, deadline, secretHash);

    // Check that the message is in the inbox
    IMessageBox.Entry memory entry = IInbox(inbox).get(entryKey);
    assertEq(entry.count, 1);
  }
}
