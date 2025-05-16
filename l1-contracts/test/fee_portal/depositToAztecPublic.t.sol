// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";

contract DepositToAztecPublic is Test {
  using Hash for DataStructures.L1ToL2Msg;

  address internal constant OWNER = address(0x1);
  Registry internal registry;
  TestERC20 internal token;
  FeeJuicePortal internal feeJuicePortal;
  Rollup internal rollup;
  RewardDistributor internal rewardDistributor;

  address internal constant MAGIC_FEE_JUICE_ADDRESS = address(uint160(Constants.FEE_JUICE_ADDRESS));

  function setUp() public {
    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();

    rollup = builder.getConfig().rollup;
    registry = builder.getConfig().registry;
    token = builder.getConfig().testERC20;

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));
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

  function test_GivenSufficientBalance() external {
    // it should create a message for the inbox (and its rollup version)
    // it should transfer the tokens to the portal
    // it should insert the message into the inbox
    // it should emit a {DepositToAztecPublic} event
    // it should return the key

    bytes32 to = bytes32(0x0);
    bytes32 secretHash = bytes32(uint256(0x01));
    uint256 amount = 100 ether;
    uint256 expectedIndex = 2 ** Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT;

    // The purpose of including the function selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    // Separately, NOTE that the sender is the MAGIC_FEE_JUICE_ADDRESS, not the feeJuicePortal address in
    // this special case.
    DataStructures.L1ToL2Msg memory message = DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor(MAGIC_FEE_JUICE_ADDRESS, block.chainid),
      recipient: DataStructures.L2Actor(feeJuicePortal.L2_TOKEN_ADDRESS(), rollup.getVersion()),
      content: Hash.sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", to, amount)),
      secretHash: secretHash,
      index: expectedIndex
    });

    bytes32 expectedKey = message.sha256ToField();

    token.mint(address(this), amount);
    token.approve(address(feeJuicePortal), amount);

    Inbox inbox = Inbox(address(Rollup(address(registry.getCanonicalRollup())).getInbox()));
    assertEq(inbox.getTotalMessagesInserted(), 0);

    bytes16 expectedHash =
      bytes16(keccak256(abi.encodePacked(inbox.getState().rollingHash, expectedKey)));
    vm.expectEmit(true, true, true, true, address(inbox));
    emit IInbox.MessageSent(2, expectedIndex, expectedKey, expectedHash);
    vm.expectEmit(true, true, true, true, address(feeJuicePortal));
    emit IFeeJuicePortal.DepositToAztecPublic(to, amount, secretHash, expectedKey, expectedIndex);

    (bytes32 key, uint256 index) = feeJuicePortal.depositToAztecPublic(to, amount, secretHash);

    assertEq(inbox.getTotalMessagesInserted(), 1);
    assertEq(key, expectedKey);
    assertEq(index, expectedIndex);
  }
}
