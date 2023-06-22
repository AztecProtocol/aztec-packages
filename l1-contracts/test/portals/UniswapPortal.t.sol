pragma solidity >=0.8.18;

import "forge-std/Test.sol";

// Rollup Proccessor
import {Rollup} from "@aztec/core/Rollup.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Registry} from "@aztec/core/messagebridge/Registry.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

// Interfaces
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

// Portals
import {TokenPortal} from "./TokenPortal.sol";
import {UniswapPortal} from "./UniswapPortal.sol";

contract UniswapPortalTest is Test {
  event L1ToL2MessageCancelled(bytes32 indexed entryKey);

  IERC20 public constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
  IERC20 public constant WETH9 = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

  Inbox internal inbox;
  Outbox internal outbox;
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

  function setUp() public {
    // fork mainnet
    uint256 forkId = vm.createFork(vm.rpcUrl("mainnet_fork"));
    vm.selectFork(forkId);
    deadlineForL1ToL2Message = uint32(block.timestamp + 1 days);

    Registry registry = new Registry();
    inbox = new Inbox(address(registry));
    outbox = new Outbox(address(registry));
    rollup = new Rollup(registry);
    registry.upgrade(address(rollup), address(inbox), address(outbox));

    daiTokenPortal = new TokenPortal();
    daiTokenPortal.initialize(address(registry), address(DAI), l2TokenAddress);

    wethTokenPortal = new TokenPortal();
    wethTokenPortal.initialize(address(registry), address(WETH9), l2TokenAddress);

    uniswapPortal = new UniswapPortal();
    uniswapPortal.initialize(address(registry), l2UniswapAddress);

    // have DAI locked in portal that can be moved when funds are withdrawn
    deal(address(DAI), address(daiTokenPortal), amount);
  }

  // L2 to L1 message to be added to the outbox
  function _createDaiWithdrawMessage(address _recipient) internal view returns (bytes32 entryKey) {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(l2TokenAddress, 1),
      recipient: DataStructures.L1Actor(address(daiTokenPortal), block.chainid),
      content: Hash.sha256ToField(
        abi.encodeWithSignature(
          "withdraw(uint256,address,address)", amount, _recipient, address(uniswapPortal)
        )
        )
    });
    entryKey = outbox.computeEntryKey(message);
  }

  // L2 to L1 message to be added to the outbox - param added for ease of crafting malicious message.
  function _createUniswapSwapMessage(bytes32 _aztecRecipient)
    internal
    view
    returns (bytes32 entryKey)
  {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(l2UniswapAddress, 1),
      recipient: DataStructures.L1Actor(address(uniswapPortal), block.chainid),
      content: Hash.sha256ToField(
        abi.encodeWithSignature(
          "swap(address,uint256,uint24,address,uint256,bytes32,bytes32,uint32,address)",
          address(daiTokenPortal),
          amount,
          uniswapFeePool,
          address(wethTokenPortal),
          amountOutMinimum,
          _aztecRecipient,
          secretHash,
          deadlineForL1ToL2Message,
          address(this)
        )
        )
    });
    entryKey = outbox.computeEntryKey(message);
  }

  function _addMessagesToOutbox(bytes32 daiWithdrawMessageKey, bytes32 swapMessageKey) internal {
    bytes32[] memory entryKeys = new bytes32[](2);
    entryKeys[0] = daiWithdrawMessageKey;
    entryKeys[1] = swapMessageKey;
    vm.prank(address(rollup));

    outbox.sendL1Messages(entryKeys);
  }

  function testSwap() public {
    bytes32 daiWithdrawMsgKey = _createDaiWithdrawMessage(address(uniswapPortal));
    bytes32 swapMsgKey = _createUniswapSwapMessage(aztecRecipient);
    _addMessagesToOutbox(daiWithdrawMsgKey, swapMsgKey);

    bytes32 l1ToL2MessageKey = uniswapPortal.swap(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this)
    );

    // dai should be taken away from dai portal
    assertEq(DAI.balanceOf(address(daiTokenPortal)), 0);
    // there should be some weth in the weth portal
    assertGt(WETH9.balanceOf(address(wethTokenPortal)), 0);
    // there should be a message in the inbox:
    assertEq(inbox.get(l1ToL2MessageKey).count, 1);
    // there should be no message in the outbox:
    assertFalse(outbox.contains(daiWithdrawMsgKey));
    assertFalse(outbox.contains(swapMsgKey));
  }

  function testRevertIfExpectedOutboxMessageNotFound() public {
    bytes32 entryKeyPortalChecksAgainst = _createDaiWithdrawMessage(address(uniswapPortal));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, entryKeyPortalChecksAgainst)
    );
    uniswapPortal.swap(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this)
    );
  }

  function testRevertIfSwapParamsDifferentToOutboxMessage() public {
    bytes32 daiWithdrawMsgKey = _createDaiWithdrawMessage(address(uniswapPortal));
    bytes32 swapMsgKey = _createUniswapSwapMessage(aztecRecipient);
    _addMessagesToOutbox(daiWithdrawMsgKey, swapMsgKey);

    bytes32 newAztecRecipient = bytes32(uint256(0x4));
    bytes32 entryKeyPortalChecksAgainst = _createUniswapSwapMessage(newAztecRecipient);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, entryKeyPortalChecksAgainst)
    );
    uniswapPortal.swap(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      newAztecRecipient, // change recipient of swapped token to some other address
      secretHash,
      deadlineForL1ToL2Message,
      address(this)
    );
  }

  // after the portal does the swap, it adds a L1 to L2 message to the inbox.
  // to mint `outputToken` to the `aztecRecipient` on L2. This test checks that
  // if the sequencer doesn't consume the L1->L2 message, then `canceller` can
  // cancel the message and retrieve the funds (instead of them being stuck on the portal)
  function testMessageToInboxIsCancellable() public {
    bytes32 daiWithdrawMsgKey = _createDaiWithdrawMessage(address(uniswapPortal));
    bytes32 swapMsgKey = _createUniswapSwapMessage(aztecRecipient);
    _addMessagesToOutbox(daiWithdrawMsgKey, swapMsgKey);

    bytes32 l1ToL2MessageKey = uniswapPortal.swap{value: 1 ether}(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      deadlineForL1ToL2Message,
      address(this) // this address should be able to cancel
    );

    uint256 wethAmountOut = WETH9.balanceOf(address(wethTokenPortal));
    // cancel L1 to L2Message - first move ahead of deadline
    vm.warp(deadlineForL1ToL2Message + 1 days);
    // check event was emitted
    vm.expectEmit(true, false, false, false);
    // expected event:
    emit L1ToL2MessageCancelled(l1ToL2MessageKey);
    // perform op
    bytes32 entryKey = wethTokenPortal.cancelL1ToAztecMessage(
      aztecRecipient, wethAmountOut, deadlineForL1ToL2Message, secretHash, 1 ether
    );
    assertEq(entryKey, l1ToL2MessageKey, "returned entry key and calculated entryKey should match");
    assertFalse(inbox.contains(entryKey), "entry still in inbox");
    assertEq(
      WETH9.balanceOf(address(this)),
      wethAmountOut,
      "assets should be transferred back to this contract"
    );
    assertEq(WETH9.balanceOf(address(wethTokenPortal)), 0, "portal should have no assets");
  }

  // TODO(#887) - what if uniswap fails?
  // TODO(#887) - what happens if uniswap deadline is passed?
}
