pragma solidity >=0.8.27;

import "forge-std/Test.sol";

// Rollup Processor
import {IRollup, Rollup} from "@aztec/core/Rollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";

// Interfaces
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";

// Portal tokens
import {TokenPortal} from "./TokenPortal.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

import {NaiveMerkle} from "../merkle/Naive.sol";
import {MockFeeJuicePortal} from "@aztec/mock/MockFeeJuicePortal.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";

contract TokenPortalTest is Test {
  using Hash for DataStructures.L1ToL2Msg;
  using stdStorage for StdStorage;

  event MessageConsumed(bytes32 indexed messageHash, address indexed recipient);

  uint256 internal constant FIRST_REAL_TREE_NUM = Constants.INITIAL_L2_BLOCK_NUM + 1;
  uint256 internal constant L1_TO_L2_MSG_SUBTREE_SIZE = 2 ** Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT;

  Registry internal registry;
  RewardDistributor internal rewardDistributor;
  Inbox internal inbox;
  IOutbox internal outbox;

  Rollup internal rollup;
  bytes32 internal l2TokenAddress = bytes32(uint256(0x42));

  TokenPortal internal tokenPortal;
  TestERC20 internal testERC20;

  // input params
  uint32 internal deadline = uint32(block.timestamp + 1 days);
  bytes32 internal to = bytes32(0x2d749407d8c364537cdeb799c1574929cb22ff1ece2b96d2a1c6fa287a0e0171);
  uint256 internal amount = 100;
  uint256 internal mintAmount = 1 ether;
  // this hash is just a random 32 byte string
  bytes32 internal secretHashForL2MessageConsumption =
    0x147e4fec49805c924e28150fc4b36824679bc17ecb1d7d9f6a9effb7fde6b6a0;

  // params for withdraw:
  address internal recipient = address(0xdead);
  uint256 internal withdrawAmount = 654;

  uint256 internal l2BlockNumber = 69;

  function setUp() public {
    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();

    rollup = builder.getConfig().rollup;
    registry = builder.getConfig().registry;
    testERC20 = builder.getConfig().testERC20;

    inbox = Inbox(address(rollup.getInbox()));
    outbox = rollup.getOutbox();

    tokenPortal = new TokenPortal();
    tokenPortal.initialize(address(registry), address(testERC20), l2TokenAddress);

    // Modify the proven block count
    stdstore.target(address(rollup)).sig("getProvenBlockNumber()").checked_write(l2BlockNumber);
    assertEq(rollup.getProvenBlockNumber(), l2BlockNumber);

    vm.deal(address(this), 100 ether);
  }

  function _createExpectedMintPrivateL1ToL2Message(uint256 _index)
    internal
    view
    returns (DataStructures.L1ToL2Msg memory)
  {
    // The purpose of including the function selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    return DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor(address(tokenPortal), block.chainid),
      recipient: DataStructures.L2Actor(l2TokenAddress, rollup.getVersion()),
      content: Hash.sha256ToField(abi.encodeWithSignature("mint_to_private(uint256)", amount)),
      secretHash: secretHashForL2MessageConsumption,
      index: _index
    });
  }

  function _createExpectedMintPublicL1ToL2Message(uint256 _index)
    internal
    view
    returns (DataStructures.L1ToL2Msg memory)
  {
    // The purpose of including the function selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    return DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor(address(tokenPortal), block.chainid),
      recipient: DataStructures.L2Actor(l2TokenAddress, rollup.getVersion()),
      content: Hash.sha256ToField(
        abi.encodeWithSignature("mint_to_public(bytes32,uint256)", to, amount)
      ),
      secretHash: secretHashForL2MessageConsumption,
      index: _index
    });
  }

  function testDepositPrivate() public returns (bytes32) {
    // mint token and approve to the portal
    testERC20.mint(address(this), mintAmount);
    testERC20.approve(address(tokenPortal), mintAmount);

    // Check for the expected message
    uint256 expectedIndex = (FIRST_REAL_TREE_NUM - 1) * L1_TO_L2_MSG_SUBTREE_SIZE;
    DataStructures.L1ToL2Msg memory expectedMessage =
      _createExpectedMintPrivateL1ToL2Message(expectedIndex);

    bytes32 expectedLeaf = expectedMessage.sha256ToField();
    bytes16 expectedHash =
      bytes16(keccak256(abi.encodePacked(inbox.getState().rollingHash, expectedLeaf)));
    // Check the event was emitted
    vm.expectEmit(true, true, true, true);
    // event we expect
    emit IInbox.MessageSent(FIRST_REAL_TREE_NUM, expectedIndex, expectedLeaf, expectedHash);
    // event we will get

    // Perform op
    (bytes32 leaf, uint256 index) =
      tokenPortal.depositToAztecPrivate(amount, secretHashForL2MessageConsumption);

    assertEq(leaf, expectedLeaf, "returned leaf and calculated leaf should match");
    assertEq(index, expectedIndex, "returned index and calculated index should match");

    return leaf;
  }

  function testDepositPublic() public returns (bytes32) {
    // mint token and approve to the portal
    testERC20.mint(address(this), mintAmount);
    testERC20.approve(address(tokenPortal), mintAmount);

    // Check for the expected message
    uint256 expectedIndex = (FIRST_REAL_TREE_NUM - 1) * L1_TO_L2_MSG_SUBTREE_SIZE;
    DataStructures.L1ToL2Msg memory expectedMessage =
      _createExpectedMintPublicL1ToL2Message(expectedIndex);
    bytes32 expectedLeaf = expectedMessage.sha256ToField();
    bytes16 expectedHash =
      bytes16(keccak256(abi.encodePacked(inbox.getState().rollingHash, expectedLeaf)));

    // Check the event was emitted
    vm.expectEmit(true, true, true, true);
    // event we expect
    emit IInbox.MessageSent(FIRST_REAL_TREE_NUM, expectedIndex, expectedLeaf, expectedHash);

    // Perform op
    (bytes32 leaf, uint256 index) =
      tokenPortal.depositToAztecPublic(to, amount, secretHashForL2MessageConsumption);

    assertEq(leaf, expectedLeaf, "returned leaf and calculated leaf should match");
    assertEq(index, expectedIndex, "returned index and calculated index should match");

    return leaf;
  }

  function _createWithdrawMessageForOutbox(address _designatedCaller)
    internal
    returns (bytes32, bytes32)
  {
    // The purpose of including the function selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    bytes32 l2ToL1Message = Hash.sha256ToField(
      DataStructures.L2ToL1Msg({
        sender: DataStructures.L2Actor({actor: l2TokenAddress, version: rollup.getVersion()}),
        recipient: DataStructures.L1Actor({actor: address(tokenPortal), chainId: block.chainid}),
        content: Hash.sha256ToField(
          abi.encodeWithSignature(
            "withdraw(address,uint256,address)", recipient, withdrawAmount, _designatedCaller
          )
        )
      })
    );

    uint256 treeHeight = 1;
    NaiveMerkle tree = new NaiveMerkle(treeHeight);
    tree.insertLeaf(l2ToL1Message);
    bytes32 treeRoot = tree.computeRoot();

    return (l2ToL1Message, treeRoot);
  }

  function _addWithdrawMessageInOutbox(address _designatedCaller, uint256 _l2BlockNumber)
    internal
    returns (bytes32, bytes32[] memory, bytes32)
  {
    // send assets to the portal
    testERC20.mint(address(tokenPortal), withdrawAmount);

    // Create the message
    (bytes32 l2ToL1Message,) = _createWithdrawMessageForOutbox(_designatedCaller);

    uint256 treeHeight = 1;
    NaiveMerkle tree = new NaiveMerkle(treeHeight);
    tree.insertLeaf(l2ToL1Message);

    (bytes32[] memory siblingPath,) = tree.computeSiblingPath(0);

    bytes32 treeRoot = tree.computeRoot();
    // Insert messages into the outbox (impersonating the rollup contract)
    vm.prank(address(rollup));
    outbox.insert(_l2BlockNumber, treeRoot);

    return (l2ToL1Message, siblingPath, treeRoot);
  }

  function testAnyoneCanCallWithdrawIfNoDesignatedCaller(address _caller) public {
    vm.assume(_caller != address(0));

    // add message with caller as this address
    (bytes32 l2ToL1Message, bytes32[] memory siblingPath, bytes32 treeRoot) =
      _addWithdrawMessageInOutbox(address(0), l2BlockNumber);
    assertEq(testERC20.balanceOf(recipient), 0);

    vm.startPrank(_caller);
    vm.expectEmit(true, true, true, true);
    emit IOutbox.MessageConsumed(l2BlockNumber, treeRoot, l2ToL1Message, 0);
    tokenPortal.withdraw(recipient, withdrawAmount, false, l2BlockNumber, 0, siblingPath);

    // Should have received 654 RNA tokens
    assertEq(testERC20.balanceOf(recipient), withdrawAmount);

    // Should not be able to withdraw again
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, l2BlockNumber, 0)
    );
    tokenPortal.withdraw(recipient, withdrawAmount, false, l2BlockNumber, 0, siblingPath);
    vm.stopPrank();
  }

  function testWithdrawWithDesignatedCallerFailsForOtherCallers(address _caller) public {
    vm.assume(_caller != address(this));
    // add message with caller as this address
    (, bytes32[] memory siblingPath, bytes32 treeRoot) =
      _addWithdrawMessageInOutbox(address(this), l2BlockNumber);

    vm.startPrank(_caller);
    (bytes32 l2ToL1MessageHash, bytes32 consumedRoot) = _createWithdrawMessageForOutbox(_caller);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.MerkleLib__InvalidRoot.selector, treeRoot, consumedRoot, l2ToL1MessageHash, 0
      )
    );
    tokenPortal.withdraw(recipient, withdrawAmount, true, l2BlockNumber, 0, siblingPath);

    (l2ToL1MessageHash, consumedRoot) = _createWithdrawMessageForOutbox(address(0));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.MerkleLib__InvalidRoot.selector, treeRoot, consumedRoot, l2ToL1MessageHash, 0
      )
    );
    tokenPortal.withdraw(recipient, withdrawAmount, false, l2BlockNumber, 0, siblingPath);
    vm.stopPrank();
  }

  function testWithdrawWithDesignatedCallerSucceedsForDesignatedCaller() public {
    // add message with caller as this address
    (bytes32 l2ToL1Message, bytes32[] memory siblingPath, bytes32 treeRoot) =
      _addWithdrawMessageInOutbox(address(this), l2BlockNumber);

    vm.expectEmit(true, true, true, true);
    emit IOutbox.MessageConsumed(l2BlockNumber, treeRoot, l2ToL1Message, 0);
    tokenPortal.withdraw(recipient, withdrawAmount, true, l2BlockNumber, 0, siblingPath);

    // Should have received 654 RNA tokens
    assertEq(testERC20.balanceOf(recipient), withdrawAmount);
  }
}
