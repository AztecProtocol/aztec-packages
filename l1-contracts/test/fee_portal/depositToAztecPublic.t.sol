// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {FeeJuicePortal} from "@aztec/core/FeeJuicePortal.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Sysstia} from "@aztec/governance/Sysstia.sol";

contract DepositToAztecPublic is Test {
  using Hash for DataStructures.L1ToL2Msg;

  address internal constant OWNER = address(0x1);
  Registry internal registry;
  TestERC20 internal token;
  FeeJuicePortal internal feeJuicePortal;
  Rollup internal rollup;
  Sysstia internal sysstia;

  function setUp() public {
    registry = new Registry(OWNER);
    token = new TestERC20();
    feeJuicePortal =
      new FeeJuicePortal(address(registry), address(token), bytes32(Constants.FEE_JUICE_ADDRESS));

    token.mint(address(feeJuicePortal), Constants.FEE_JUICE_INITIAL_MINT);
    feeJuicePortal.initialize();
    sysstia = new Sysstia(token, registry, address(this));
    rollup =
      new Rollup(feeJuicePortal, sysstia, bytes32(0), bytes32(0), address(this), new address[](0));

    vm.prank(OWNER);
    registry.upgrade(address(rollup));
  }

  function test_RevertGiven_InsufficientBalance() external {
    // it should revert
    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientAllowance.selector, address(feeJuicePortal), 0, 1
      )
    );
    feeJuicePortal.depositToAztecPublic(bytes32(0x0), 1, bytes32(0x0));

    token.approve(address(feeJuicePortal), 1);
    vm.expectRevert(
      abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(this), 0, 1)
    );
    feeJuicePortal.depositToAztecPublic(bytes32(0x0), 1, bytes32(0x0));
  }

  function test_GivenSufficientBalance(uint256 _numberOfRollups) external {
    // it should create a message for the newest version
    // it should transfer the tokens to the portal
    // it should insert the message into the newest inbox
    // it should emit a {DepositToAztecPublic} event
    // it should return the key

    uint256 numberOfRollups = bound(_numberOfRollups, 1, 5);
    for (uint256 i = 0; i < numberOfRollups; i++) {
      Rollup freshRollup =
        new Rollup(feeJuicePortal, sysstia, bytes32(0), bytes32(0), address(this), new address[](0));
      vm.prank(OWNER);
      registry.upgrade(address(freshRollup));
    }

    assertNotEq(registry.getRollup(), address(rollup));

    bytes32 to = bytes32(0x0);
    bytes32 secretHash = bytes32(uint256(0x01));
    uint256 amount = 100 ether;
    uint256 index = 2 ** Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT;

    DataStructures.L1ToL2Msg memory message = DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor(address(feeJuicePortal), block.chainid),
      recipient: DataStructures.L2Actor(feeJuicePortal.L2_TOKEN_ADDRESS(), 1 + numberOfRollups),
      content: Hash.sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", to, amount)),
      secretHash: secretHash,
      index: index
    });

    bytes32 expectedKey = message.sha256ToField();

    token.mint(address(this), amount);
    token.approve(address(feeJuicePortal), amount);

    Inbox inbox = Inbox(address(Rollup(address(registry.getRollup())).INBOX()));
    assertEq(inbox.totalMessagesInserted(), 0);

    vm.expectEmit(true, true, true, true, address(inbox));
    emit IInbox.MessageSent(2, index, expectedKey);
    vm.expectEmit(true, true, true, true, address(feeJuicePortal));
    emit IFeeJuicePortal.DepositToAztecPublic(to, amount, secretHash, expectedKey);

    bytes32 key = feeJuicePortal.depositToAztecPublic(to, amount, secretHash);

    assertEq(inbox.totalMessagesInserted(), 1);
    assertEq(key, expectedKey);
  }
}
