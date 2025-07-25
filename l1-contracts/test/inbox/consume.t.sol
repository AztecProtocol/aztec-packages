// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {
  InboxAnchorHash,
  InboxAnchor,
  InboxAnchorChain,
  InboxAnchorChainLib,
  InboxAnchorLib
} from "@aztec/core/libraries/crypto/InboxAnchorChain.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {InboxHarness} from "./InboxHarness.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Math} from "@oz/utils/math/Math.sol";

contract ConsumeTest is Test {
  using InboxAnchorLib for InboxAnchor;

  uint256 internal pendingBlockNumber = 0;
  InboxHarness internal inbox;

  function setUp() public {
    uint256 version = 1;

    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    inbox =
      new InboxHarness(address(this), feeAsset, version, Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT);
  }

  function getPendingBlockNumber() public view returns (uint256) {
    return pendingBlockNumber;
  }

  modifier createHistory(uint8[8] memory _jumps) {
    DataStructures.L1ToL2Msg memory message = inbox.getFakeMessage();
    for (uint256 i = 0; i < _jumps.length; i++) {
      pendingBlockNumber += bound(_jumps[i], 1, 16);

      inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    }

    inbox.lowerAnchorForcefully();

    _;
  }

  function test_happyPath(uint8[8] memory _jumps, uint256 _start, uint256 _end)
    public
    createHistory(_jumps)
  {
    uint256 upperLimit = inbox.getLastAnchorBlockNumber();
    uint256 startBlock = bound(_start, 1, upperLimit);
    uint256 endBlock = bound(_end, startBlock, upperLimit);

    InboxAnchor[] memory anchorChain = inbox.getAnchorChain(startBlock, endBlock);

    bytes32[] memory inHashes = inbox.consume(anchorChain, startBlock, endBlock);

    assertEq(inHashes.length, endBlock - startBlock + 1);
    emit log_named_uint("inHashes.length", inHashes.length);
    for (uint256 i = 0; i < inHashes.length; i++) {
      assertEq(inHashes[i], inbox.getRoot(startBlock + i));
    }
  }

  function test_reverts_EmptyAnchorChain() public {
    InboxAnchor[] memory anchorChain = new InboxAnchor[](0);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__EmptyAnchorChain.selector));
    inbox.consume(anchorChain, 0, 0);
  }

  function test_reverts_Unauthorized() public {
    InboxAnchor[] memory anchorChain = new InboxAnchor[](1);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__Unauthorized.selector));
    vm.prank(address(1));
    inbox.consume(anchorChain, 0, 0);
  }

  function test_reverts_StartBlockGreaterThanEndBlock() public {
    InboxAnchor[] memory anchorChain = new InboxAnchor[](1);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__StartBlockGreaterThanEndBlock.selector));
    inbox.consume(anchorChain, 1, 0);
  }

  function test_reverts_EndBlockUnstable() public {
    uint256 endBlock = inbox.getInProgress();
    InboxAnchor[] memory anchorChain = new InboxAnchor[](1);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Inbox__EndBlockUnstable.selector, endBlock, inbox.getInProgress()
      )
    );
    inbox.consume(anchorChain, 0, endBlock);
  }

  function test_reverts_EndBlockNotAnchored() public {
    uint256 endBlock = inbox.getLastAnchorBlockNumber() + 1;
    InboxAnchor[] memory anchorChain = new InboxAnchor[](1);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__EndBlockNotAnchored.selector, endBlock));
    inbox.consume(anchorChain, 0, endBlock);
  }

  function test_reverts_StartBlockNotLocallyAnchored(
    uint8[8] memory _jumps,
    uint256 _start,
    uint256 _end
  ) public createHistory(_jumps) {
    // We need a start block that multiple pre-decessors otherwise we might always be included
    // if the chain need to go all the way to genesis

    uint256 earliest = _child(1);

    uint256 startBlock = bound(_start, earliest, inbox.getLastAnchorBlockNumber());
    uint256 endBlock = bound(_end, startBlock, inbox.getLastAnchorBlockNumber());

    InboxAnchor[] memory anchorChain = inbox.getAnchorChain(startBlock, endBlock);

    uint256 improperStartBlock = anchorChain[0].blockNumber - 1;

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Inbox__StartBlockNotLocallyAnchored.selector, improperStartBlock
      )
    );
    inbox.consume(anchorChain, improperStartBlock, endBlock);
  }

  function test_reverts_EndBlockNotLocallyAnchored(
    uint8[8] memory _jumps,
    uint256 _start,
    uint256 _end
  ) public createHistory(_jumps) {
    // We need the end to not be the last, since we wish to jump past our end,
    // but still be anchored globally, just not locally
    uint256 latest = _parent(inbox.getLastAnchorBlockNumber());

    uint256 startBlock = bound(_start, 1, latest);
    uint256 endBlock = bound(_end, startBlock, latest);

    InboxAnchor[] memory anchorChain = inbox.getAnchorChain(startBlock, endBlock);

    uint256 improperEndBlock = anchorChain[anchorChain.length - 1].blockNumber + 1;

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Inbox__EndBlockNotLocallyAnchored.selector, improperEndBlock)
    );
    inbox.consume(anchorChain, startBlock, improperEndBlock);
  }

  function test_reverts_InvalidAnchorChain(uint8[8] memory _jumps, uint256 _start, uint256 _end)
    public
    createHistory(_jumps)
  {
    uint256 startBlock = bound(_start, 1, inbox.getLastAnchorBlockNumber());
    uint256 endBlock = bound(_end, startBlock, inbox.getLastAnchorBlockNumber());

    InboxAnchor[] memory anchorChain = inbox.getAnchorChain(startBlock, endBlock);

    anchorChain[0].root = keccak256(abi.encode(anchorChain[0].root));

    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__InvalidAnchorChain.selector));
    inbox.consume(anchorChain, startBlock, endBlock);
  }

  function test_longAnchor(uint8[8] memory _jumps, uint256 _start, uint256 _end)
    public
    createHistory(_jumps)
  {
    // Using a longer chain should still be acceptable and get us the correct values,
    // just a bit more costly

    uint256 earliest = _child(_child(1));
    uint256 latest = _parent(inbox.getLastAnchorBlockNumber());

    uint256 startBlock = bound(_start, earliest, latest);
    uint256 endBlock = bound(_end, startBlock, latest);

    InboxAnchor[] memory anchorChain =
      inbox.getAnchorChain(_parent(_parent(startBlock)), _child(endBlock));

    bytes32[] memory inHashes = inbox.consume(anchorChain, startBlock, endBlock);

    assertEq(inHashes.length, endBlock - startBlock + 1);

    for (uint256 i = 0; i < inHashes.length; i++) {
      assertEq(
        inHashes[i], inbox.getRoot(startBlock + i), "god damn, you just lied about the roots"
      );
    }
  }

  function test_showcase(uint8[8] memory _jumps) public createHistory(_jumps) {
    // Without the locally anchored checks, it would be possible to bypass real values!
    // To see this. You should try making a comment of the lines with the errors:
    // - Inbox__StartBlockNotLocallyAnchored
    // - Inbox__EndBlockNotLocallyAnchored
    // If you do so, you will see that the following test would be able to lie about roots
    // which in this case would mean that certain messages would be deleted, and other
    // added twice.

    return;

    uint256 startBlock = 1;
    uint256 endBlock = 3;

    InboxAnchor[] memory anchorChain = inbox.getAnchorChain(3, 5);

    bytes32[] memory inHashes = inbox.consume(anchorChain, startBlock, endBlock);

    assertEq(inHashes.length, endBlock - startBlock + 1);
    for (uint256 i = 0; i < inHashes.length; i++) {
      assertEq(
        inHashes[i], inbox.getRoot(startBlock + i), "god damn, you just lied about the roots"
      );
    }
  }

  function _parent(uint256 _block) internal view returns (uint256) {
    uint256 value = _block - 1;
    while (!inbox.hasAnchor(value)) {
      value -= 1;
    }

    return value;
  }

  function _child(uint256 _block) internal view returns (uint256) {
    uint256 value = _block + 1;
    while (!inbox.hasAnchor(value)) {
      value += 1;
    }

    return value;
  }
}
