pragma solidity >=0.8.18;

import "forge-std/Test.sol";

// Rollup Processor
import {Rollup} from "../../src/core/Rollup.sol";
import {AvailabilityOracle} from "../../src/core/availability_oracle/AvailabilityOracle.sol";
import {Inbox} from "../../src/core/messagebridge/Inbox.sol";
import {Registry} from "../../src/core/messagebridge/Registry.sol";
import {Outbox} from "../../src/core/messagebridge/Outbox.sol";
import {NewOutbox} from "../../src/core/messagebridge/NewOutbox.sol";
import {DataStructures} from "../../src/core/libraries/DataStructures.sol";
import {Hash} from "../../src/core/libraries/Hash.sol";
import {Errors} from "../../src/core/libraries/Errors.sol";

// Interfaces
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {INewOutbox} from "../../src/core/interfaces/messagebridge/INewOutbox.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";

// Portals
import {TokenPortal} from "./TokenPortal.sol";
import {UniswapPortal} from "./UniswapPortal.sol";

contract UniswapPortalTest is Test {
  event L1ToL2MessageCancelled(bytes32 indexed entryKey);

  IERC20 public constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
  IERC20 public constant WETH9 = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

  Inbox internal inbox;
  Outbox internal outbox;
  NewOutbox internal newOutbox;
  Rollup internal rollup;
  bytes32 internal l2TokenAddress = bytes32(uint256(0x1));
  bytes32 internal l2UniswapAddress = bytes32(uint256(0x2));

  TokenPortal internal daiTokenPortal;
  TokenPortal internal wethTokenPortal;
  UniswapPortal internal uniswapPortal;

  uint256 internal amount = 100 ether;
  bytes32 internal secretHash = bytes32(0);
  uint24 internal uniswapFeePool = 3000; // 0.3% fee
  uint256 internal amountOutMinimum = 0;
  uint32 internal deadlineForL1ToL2Message; // set after fork is activated
  bytes32 internal aztecRecipient = bytes32(uint256(0x3));
  bytes32 internal secretHashForRedeemingMintedNotes = bytes32(uint256(0x4));

  function setUp() public {
    // fork mainnet
    uint256 forkId = vm.createFork(vm.rpcUrl("mainnet_fork"));
    vm.selectFork(forkId);
    deadlineForL1ToL2Message = uint32(block.timestamp + 1 days);

    Registry registry = new Registry();
    inbox = new Inbox(address(registry));
    outbox = new Outbox(address(registry));
    rollup = new Rollup(registry, new AvailabilityOracle());
    newOutbox = new NewOutbox(address(rollup));
    registry.upgrade(address(rollup), address(inbox), address(outbox));

    daiTokenPortal = new TokenPortal();
    daiTokenPortal.initialize(address(registry), address(newOutbox), address(DAI), l2TokenAddress);

    wethTokenPortal = new TokenPortal();
    wethTokenPortal.initialize(
      address(registry), address(newOutbox), address(WETH9), l2TokenAddress
    );

    uniswapPortal = new UniswapPortal();
    uniswapPortal.initialize(address(registry), address(newOutbox), l2UniswapAddress);

    // have DAI locked in portal that can be moved when funds are withdrawn
    deal(address(DAI), address(daiTokenPortal), amount);
  }

  /**
   * L2 to L1 message withdraw to be added to the outbox
   * @param _recipient - the L1 address that should receive the funds after withdraw
   * @param _caller - designated caller on L1 that will call the withdraw function - typically uniswapPortal
   * Set to address(0) if anyone can call.
   */
  function _createDaiWithdrawMessage(address _recipient, address _caller)
    internal
    view
    returns (bytes32 l2ToL1Message)
  {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(l2TokenAddress, 1),
      recipient: DataStructures.L1Actor(address(daiTokenPortal), block.chainid),
      content: Hash.sha256ToField(
        abi.encodeWithSignature("withdraw(address,uint256,address)", _recipient, amount, _caller)
        )
    });
    l2ToL1Message = Hash.sha256ToField(message);

    return l2ToL1Message;
  }

  /**
   * L2 to L1 message to be added to the outbox -
   * @param _aztecRecipient - the recipient on L2 that will receive the output of the swap
   * @param _caller - designated caller on L1 that will call the swap function - typically address(this)
   * Set to address(0) if anyone can call.
   */
  function _createUniswapSwapMessagePublic(bytes32 _aztecRecipient, address _caller)
    internal
    view
    returns (bytes32 entryKey)
  {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(l2UniswapAddress, 1),
      recipient: DataStructures.L1Actor(address(uniswapPortal), block.chainid),
      content: Hash.sha256ToField(
        abi.encodeWithSignature(
          "swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32,uint32,address,address)",
          address(daiTokenPortal),
          amount,
          uniswapFeePool,
          address(wethTokenPortal),
          amountOutMinimum,
          _aztecRecipient,
          secretHash,
          deadlineForL1ToL2Message,
          address(this),
          _caller
        )
        )
    });
    entryKey = outbox.computeEntryKey(message);
  }

  /**
   * L2 to L1 message to be added to the outbox -
   * @param _secretHashForRedeemingMintedNotes - The hash of the secret to redeem minted notes privately on Aztec
   * @param _caller - designated caller on L1 that will call the swap function - typically address(this)
   * Set to address(0) if anyone can call.
   */
  function _createUniswapSwapMessagePrivate(
    bytes32 _secretHashForRedeemingMintedNotes,
    address _caller
  ) internal view returns (bytes32 entryKey) {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(l2UniswapAddress, 1),
      recipient: DataStructures.L1Actor(address(uniswapPortal), block.chainid),
      content: Hash.sha256ToField(
        abi.encodeWithSignature(
          "swap_private(address,uint256,uint24,address,uint256,bytes32,bytes32,uint32,address,address)",
          address(daiTokenPortal),
          amount,
          uniswapFeePool,
          address(wethTokenPortal),
          amountOutMinimum,
          _secretHashForRedeemingMintedNotes,
          secretHash,
          deadlineForL1ToL2Message,
          address(this),
          _caller
        )
        )
    });
    entryKey = outbox.computeEntryKey(message);
  }

  function _addMessagesToOutbox(
    bytes32 daiWithdrawEntryKey,
    bytes32 swapEntryKey,
    uint256 _l2BlockNumber
  ) internal returns (bytes32, bytes32[] memory, bytes32[] memory) {
    uint256 treeHeight = 1;
    NaiveMerkle tree = new NaiveMerkle(treeHeight);
    tree.insertLeaf(daiWithdrawEntryKey);
    tree.insertLeaf(swapEntryKey);

    bytes32 treeRoot = tree.computeRoot();
    (bytes32[] memory withdrawSiblingPath,) = tree.computeSiblingPath(0);
    (bytes32[] memory swapSiblingPath,) = tree.computeSiblingPath(1);

    vm.prank(address(rollup));
    newOutbox.insert(_l2BlockNumber, treeRoot, treeHeight);

    return (treeRoot, withdrawSiblingPath, swapSiblingPath);
  }

  // Creates a withdraw transaction without a designated caller.
  // Should fail when uniswap portal tries to consume it since it tries using a designated caller.
  function testRevertIfWithdrawMessageHasNoDesignatedCaller() public {
    uint256 l2BlockNumber = 69;
    bytes32 l2ToL1MessageToInsert = _createDaiWithdrawMessage(address(uniswapPortal), address(0));
    (bytes32 root, bytes32[] memory withdrawSiblingPath, bytes32[] memory swapSiblingPath) =
      _addMessagesToOutbox(l2ToL1MessageToInsert, bytes32(uint256(0x1)), l2BlockNumber);
    bytes32 l2ToL1MessageToConsume =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));

    uint256 treeHeight = 1;
    NaiveMerkle tree1 = new NaiveMerkle(treeHeight);
    tree1.insertLeaf(l2ToL1MessageToInsert);
    tree1.insertLeaf(bytes32(uint256(0x1)));
    bytes32 actualRoot = tree1.computeRoot();

    NaiveMerkle tree2 = new NaiveMerkle(treeHeight);
    tree2.insertLeaf(l2ToL1MessageToConsume);
    tree2.insertLeaf(bytes32(uint256(0x1)));
    bytes32 consumedRoot = tree2.computeRoot();

    vm.expectRevert(
      abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, actualRoot, consumedRoot)
    );

    DataStructures.OutboxMessageMetadata[2] memory outboxMessageMetadata = [
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      }),
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      })
    ];

    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this),
      true,
      outboxMessageMetadata
    );
  }

  // Inserts a wrong outbox message (where `_recipient` is not the uniswap portal).
  function testRevertIfExpectedOutboxMessageNotFound(address _recipient) public {
    vm.assume(_recipient != address(uniswapPortal));

    // malformed withdraw message (wrong recipient)
    uint256 l2BlockNumber = 69;
    bytes32 l2ToL1MessageToInsert = _createDaiWithdrawMessage(_recipient, address(uniswapPortal));

    (bytes32 root, bytes32[] memory withdrawSiblingPath, bytes32[] memory swapSiblingPath) =
      _addMessagesToOutbox(l2ToL1MessageToInsert, bytes32(uint256(0x1)), l2BlockNumber);

    bytes32 l2ToL1MessageToConsume =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));

    uint256 treeHeight = 1;
    NaiveMerkle tree1 = new NaiveMerkle(treeHeight);
    tree1.insertLeaf(l2ToL1MessageToInsert);
    tree1.insertLeaf(bytes32(uint256(0x1)));
    bytes32 actualRoot = tree1.computeRoot();

    NaiveMerkle tree2 = new NaiveMerkle(treeHeight);
    tree2.insertLeaf(l2ToL1MessageToConsume);
    tree2.insertLeaf(bytes32(uint256(0x1)));
    bytes32 consumedRoot = tree2.computeRoot();

    vm.expectRevert(
      abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, actualRoot, consumedRoot)
    );

    DataStructures.OutboxMessageMetadata[2] memory outboxMessageMetadata = [
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      }),
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      })
    ];

    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this),
      true,
      outboxMessageMetadata
    );
  }

  function testRevertIfSwapParamsDifferentToOutboxMessage() public {
    uint256 l2BlockNumber = 69;

    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(this));
    (, bytes32[] memory withdrawSiblingPath, bytes32[] memory swapSiblingPath) =
      _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey, l2BlockNumber);

    bytes32 newAztecRecipient = bytes32(uint256(0x4));
    bytes32 entryKeyPortalChecksAgainst =
      _createUniswapSwapMessagePublic(newAztecRecipient, address(this));

    bytes32 actualRoot;
    bytes32 consumedRoot;

    {
      uint256 treeHeight = 1;
      NaiveMerkle tree1 = new NaiveMerkle(treeHeight);
      tree1.insertLeaf(daiWithdrawEntryKey);
      tree1.insertLeaf(swapEntryKey);
      actualRoot = tree1.computeRoot();

      NaiveMerkle tree2 = new NaiveMerkle(treeHeight);
      tree2.insertLeaf(daiWithdrawEntryKey);
      tree2.insertLeaf(entryKeyPortalChecksAgainst);
      consumedRoot = tree2.computeRoot();
    }

    vm.expectRevert(
      abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, actualRoot, consumedRoot)
    );

    DataStructures.OutboxMessageMetadata[2] memory outboxMessageMetadata = [
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      }),
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 1,
        _path: swapSiblingPath
      })
    ];

    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      newAztecRecipient, // change recipient of swapped token to some other address
      secretHash,
      deadlineForL1ToL2Message,
      address(this),
      true,
      outboxMessageMetadata
    );
  }

  function testSwapWithDesignatedCaller() public {
    uint256 l2BlockNumber = 69;

    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(this));

    (, bytes32[] memory withdrawSiblingPath, bytes32[] memory swapSiblingPath) =
      _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey, l2BlockNumber);

    DataStructures.OutboxMessageMetadata[2] memory outboxMessageMetadata = [
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      }),
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 1,
        _path: swapSiblingPath
      })
    ];

    bytes32 l1ToL2EntryKey = uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this),
      true,
      outboxMessageMetadata
    );

    // dai should be taken away from dai portal
    assertEq(DAI.balanceOf(address(daiTokenPortal)), 0);
    // there should be some weth in the weth portal
    assertGt(WETH9.balanceOf(address(wethTokenPortal)), 0);
    // there should be a message in the inbox:
    assertEq(inbox.get(l1ToL2EntryKey).count, 1);
    // there the message should be nullified at index 0 and 1
    assertTrue(newOutbox.hasMessageBeenConsumedAtBlockAndIndex(l2BlockNumber, 0));
    assertTrue(newOutbox.hasMessageBeenConsumedAtBlockAndIndex(l2BlockNumber, 1));
  }

  function testSwapCalledByAnyoneIfDesignatedCallerNotSet(address _caller) public {
    vm.assume(_caller != address(uniswapPortal));
    uint256 l2BlockNumber = 69;

    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    // don't set caller on swapPublic() -> so anyone can call this method.
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(0));

    (, bytes32[] memory withdrawSiblingPath, bytes32[] memory swapSiblingPath) =
      _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey, l2BlockNumber);

    DataStructures.OutboxMessageMetadata[2] memory outboxMessageMetadata = [
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      }),
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 1,
        _path: swapSiblingPath
      })
    ];

    vm.prank(_caller);
    bytes32 l1ToL2EntryKey = uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this),
      false,
      outboxMessageMetadata
    );
    // check that swap happened:
    // dai should be taken away from dai portal
    assertEq(DAI.balanceOf(address(daiTokenPortal)), 0);
    // there should be some weth in the weth portal
    assertGt(WETH9.balanceOf(address(wethTokenPortal)), 0);
    // there should be a message in the inbox:
    assertEq(inbox.get(l1ToL2EntryKey).count, 1);
    // there should be no message in the outbox:
    assertTrue(newOutbox.hasMessageBeenConsumedAtBlockAndIndex(l2BlockNumber, 0));
    assertTrue(newOutbox.hasMessageBeenConsumedAtBlockAndIndex(l2BlockNumber, 1));
  }

  function testRevertIfSwapWithDesignatedCallerCalledByWrongCaller(address _caller) public {
    vm.assume(_caller != address(this));
    uint256 l2BlockNumber = 69;

    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(this));

    (, bytes32[] memory withdrawSiblingPath, bytes32[] memory swapSiblingPath) =
      _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey, l2BlockNumber);

    DataStructures.OutboxMessageMetadata[2] memory outboxMessageMetadata = [
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      }),
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 1,
        _path: swapSiblingPath
      })
    ];

    vm.startPrank(_caller);
    bytes32 entryKeyPortalChecksAgainst = _createUniswapSwapMessagePublic(aztecRecipient, _caller);

    bytes32 actualRoot;
    bytes32 consumedRoot;

    {
      uint256 treeHeight = 1;
      NaiveMerkle tree1 = new NaiveMerkle(treeHeight);
      tree1.insertLeaf(daiWithdrawEntryKey);
      tree1.insertLeaf(swapEntryKey);
      actualRoot = tree1.computeRoot();

      NaiveMerkle tree2 = new NaiveMerkle(treeHeight);
      tree2.insertLeaf(daiWithdrawEntryKey);
      tree2.insertLeaf(entryKeyPortalChecksAgainst);
      consumedRoot = tree2.computeRoot();
    }

    vm.expectRevert(
      abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, actualRoot, consumedRoot)
    );

    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this),
      true,
      outboxMessageMetadata
    );

    entryKeyPortalChecksAgainst = _createUniswapSwapMessagePublic(aztecRecipient, address(0));

    {
      uint256 treeHeight = 1;
      NaiveMerkle tree1 = new NaiveMerkle(treeHeight);
      tree1.insertLeaf(daiWithdrawEntryKey);
      tree1.insertLeaf(swapEntryKey);
      actualRoot = tree1.computeRoot();

      NaiveMerkle tree2 = new NaiveMerkle(treeHeight);
      tree2.insertLeaf(daiWithdrawEntryKey);
      tree2.insertLeaf(entryKeyPortalChecksAgainst);
      consumedRoot = tree2.computeRoot();
    }
    vm.expectRevert(
      abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, actualRoot, consumedRoot)
    );
    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this),
      false,
      outboxMessageMetadata
    );
    vm.stopPrank();
  }

  // after the portal does the swap, it adds a L1 to L2 message to the inbox.
  // to mint `outputToken` to the `aztecRecipient` on L2. This test checks that
  // if the sequencer doesn't consume the L1->L2 message, then `canceller` can
  // cancel the message and retrieve the funds (instead of them being stuck on the portal)
  function testMessageToInboxIsCancellable() public {
    uint256 l2BlockNumber = 69;

    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(this));
    (, bytes32[] memory withdrawSiblingPath, bytes32[] memory swapSiblingPath) =
      _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey, l2BlockNumber);

    DataStructures.OutboxMessageMetadata[2] memory outboxMessageMetadata = [
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      }),
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 1,
        _path: swapSiblingPath
      })
    ];

    bytes32 l1ToL2EntryKey = uniswapPortal.swapPublic{value: 1 ether}(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this), // this address should be able to cancel
      true,
      outboxMessageMetadata
    );

    uint256 wethAmountOut = WETH9.balanceOf(address(wethTokenPortal));
    // cancel L1 to L2Message - first move ahead of deadline
    vm.warp(deadlineForL1ToL2Message + 1 days);
    // check event was emitted
    vm.expectEmit(true, false, false, false);
    // expected event:
    emit L1ToL2MessageCancelled(l1ToL2EntryKey);
    // perform op
    // TODO(2167) - Update UniswapPortal properly with new portal standard.
    bytes32 entryKey = wethTokenPortal.cancelL1ToAztecMessagePublic(
      aztecRecipient, wethAmountOut, deadlineForL1ToL2Message, secretHash, 1 ether
    );
    assertEq(entryKey, l1ToL2EntryKey, "returned entry key and calculated entryKey should match");
    assertFalse(inbox.contains(entryKey), "entry still in inbox");
    assertEq(
      WETH9.balanceOf(address(this)),
      wethAmountOut,
      "assets should be transferred back to this contract"
    );
    assertEq(WETH9.balanceOf(address(wethTokenPortal)), 0, "portal should have no assets");
  }

  function testRevertIfSwapMessageWasForDifferentPublicOrPrivateFlow() public {
    uint256 l2BlockNumber = 69;

    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));

    // Create message for `_isPrivateFlow`:
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(this));
    (, bytes32[] memory withdrawSiblingPath, bytes32[] memory swapSiblingPath) =
      _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey, l2BlockNumber);

    DataStructures.OutboxMessageMetadata[2] memory outboxMessageMetadata = [
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 0,
        _path: withdrawSiblingPath
      }),
      DataStructures.OutboxMessageMetadata({
        _l2BlockNumber: l2BlockNumber,
        _leafIndex: 1,
        _path: swapSiblingPath
      })
    ];

    bytes32 entryKeyPortalChecksAgainst =
      _createUniswapSwapMessagePrivate(secretHashForRedeemingMintedNotes, address(this));

    bytes32 actualRoot;
    bytes32 consumedRoot;

    {
      uint256 treeHeight = 1;
      NaiveMerkle tree1 = new NaiveMerkle(treeHeight);
      tree1.insertLeaf(daiWithdrawEntryKey);
      tree1.insertLeaf(swapEntryKey);
      actualRoot = tree1.computeRoot();

      NaiveMerkle tree2 = new NaiveMerkle(treeHeight);
      tree2.insertLeaf(daiWithdrawEntryKey);
      tree2.insertLeaf(entryKeyPortalChecksAgainst);
      consumedRoot = tree2.computeRoot();
    }

    vm.expectRevert(
      abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, actualRoot, consumedRoot)
    );

    uniswapPortal.swapPrivate(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      secretHashForRedeemingMintedNotes,
      secretHash,
      deadlineForL1ToL2Message,
      address(this),
      true,
      outboxMessageMetadata
    );
  }
  // TODO(#887) - what if uniswap fails?
  // TODO(#887) - what happens if uniswap deadline is passed?
}
