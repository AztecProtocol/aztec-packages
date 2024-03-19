pragma solidity >=0.8.18;

import "forge-std/Test.sol";

// Rollup Processor
import {Rollup} from "../../src/core/Rollup.sol";
import {AvailabilityOracle} from "../../src/core/availability_oracle/AvailabilityOracle.sol";
import {Registry} from "../../src/core/messagebridge/Registry.sol";
import {Outbox} from "../../src/core/messagebridge/Outbox.sol";
import {DataStructures} from "../../src/core/libraries/DataStructures.sol";
import {Hash} from "../../src/core/libraries/Hash.sol";
import {Errors} from "../../src/core/libraries/Errors.sol";

// Interfaces
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

// Portals
import {TokenPortal} from "./TokenPortal.sol";
import {UniswapPortal} from "./UniswapPortal.sol";

contract UniswapPortalTest is Test {
  event L1ToL2MessageCancelled(bytes32 indexed entryKey);

  IERC20 public constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
  IERC20 public constant WETH9 = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

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
  bytes32 internal aztecRecipient = bytes32(uint256(0x3));
  bytes32 internal secretHashForRedeemingMintedNotes = bytes32(uint256(0x4));

  function setUp() public {
    // fork mainnet
    uint256 forkId = vm.createFork(vm.rpcUrl("mainnet_fork"));
    vm.selectFork(forkId);

    Registry registry = new Registry();
    outbox = new Outbox(address(registry));
    rollup = new Rollup(registry, new AvailabilityOracle());
    registry.upgrade(address(rollup), address(rollup.INBOX()), address(outbox));

    daiTokenPortal = new TokenPortal();
    daiTokenPortal.initialize(address(registry), address(DAI), l2TokenAddress);

    wethTokenPortal = new TokenPortal();
    wethTokenPortal.initialize(address(registry), address(WETH9), l2TokenAddress);

    uniswapPortal = new UniswapPortal();
    uniswapPortal.initialize(address(registry), l2UniswapAddress);

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
    returns (bytes32 entryKey)
  {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(l2TokenAddress, 1),
      recipient: DataStructures.L1Actor(address(daiTokenPortal), block.chainid),
      content: Hash.sha256ToField(
        abi.encodeWithSignature("withdraw(address,uint256,address)", _recipient, amount, _caller)
        )
    });
    entryKey = outbox.computeEntryKey(message);
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
          "swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32,address)",
          address(daiTokenPortal),
          amount,
          uniswapFeePool,
          address(wethTokenPortal),
          amountOutMinimum,
          _aztecRecipient,
          secretHash,
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
          "swap_private(address,uint256,uint24,address,uint256,bytes32,bytes32,address)",
          address(daiTokenPortal),
          amount,
          uniswapFeePool,
          address(wethTokenPortal),
          amountOutMinimum,
          _secretHashForRedeemingMintedNotes,
          secretHash,
          _caller
        )
        )
    });
    entryKey = outbox.computeEntryKey(message);
  }

  function _addMessagesToOutbox(bytes32 daiWithdrawEntryKey, bytes32 swapEntryKey) internal {
    bytes32[] memory entryKeys = new bytes32[](2);
    entryKeys[0] = daiWithdrawEntryKey;
    entryKeys[1] = swapEntryKey;
    vm.prank(address(rollup));

    outbox.sendL1Messages(entryKeys);
  }

  // Creates a withdraw transaction without a designated caller.
  // Should fail when uniswap portal tries to consume it since it tries using a designated caller.
  function testRevertIfWithdrawMessageHasNoDesignatedCaller() public {
    bytes32 entryKey = _createDaiWithdrawMessage(address(uniswapPortal), address(0));
    _addMessagesToOutbox(entryKey, bytes32(uint256(0x1)));
    bytes32 entryKeyPortalChecksAgainst =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, entryKeyPortalChecksAgainst)
    );
    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      true
    );
  }

  // Inserts a wrong outbox message (where `_recipient` is not the uniswap portal).
  function testRevertIfExpectedOutboxMessageNotFound(address _recipient) public {
    vm.assume(_recipient != address(uniswapPortal));
    // malformed withdraw message (wrong recipient)
    _addMessagesToOutbox(
      _createDaiWithdrawMessage(_recipient, address(uniswapPortal)), bytes32(uint256(0x1))
    );

    bytes32 entryKeyPortalChecksAgainst =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, entryKeyPortalChecksAgainst)
    );
    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      true
    );
  }

  function testRevertIfSwapParamsDifferentToOutboxMessage() public {
    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(this));
    _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey);

    bytes32 newAztecRecipient = bytes32(uint256(0x4));
    bytes32 entryKeyPortalChecksAgainst =
      _createUniswapSwapMessagePublic(newAztecRecipient, address(this));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, entryKeyPortalChecksAgainst)
    );
    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      newAztecRecipient, // change recipient of swapped token to some other address
      secretHash,
      true
    );
  }

  function testSwapWithDesignatedCaller() public {
    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(this));
    _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey);

    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      true
    );

    // dai should be taken away from dai portal
    assertEq(DAI.balanceOf(address(daiTokenPortal)), 0);
    // there should be some weth in the weth portal
    assertGt(WETH9.balanceOf(address(wethTokenPortal)), 0);
    // there should be no message in the outbox:
    assertFalse(outbox.contains(daiWithdrawEntryKey));
    assertFalse(outbox.contains(swapEntryKey));
  }

  function testSwapCalledByAnyoneIfDesignatedCallerNotSet(address _caller) public {
    vm.assume(_caller != address(uniswapPortal));
    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    // don't set caller on swapPublic() -> so anyone can call this method.
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(0));
    _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey);

    vm.prank(_caller);
    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      false
    );
    // check that swap happened:
    // dai should be taken away from dai portal
    assertEq(DAI.balanceOf(address(daiTokenPortal)), 0);
    // there should be some weth in the weth portal
    assertGt(WETH9.balanceOf(address(wethTokenPortal)), 0);
    // there should be no message in the outbox:
    assertFalse(outbox.contains(daiWithdrawEntryKey));
    assertFalse(outbox.contains(swapEntryKey));
  }

  function testRevertIfSwapWithDesignatedCallerCalledByWrongCaller(address _caller) public {
    vm.assume(_caller != address(this));
    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(this));
    _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey);

    vm.startPrank(_caller);
    bytes32 entryKeyPortalChecksAgainst = _createUniswapSwapMessagePublic(aztecRecipient, _caller);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, entryKeyPortalChecksAgainst)
    );
    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      true
    );

    entryKeyPortalChecksAgainst = _createUniswapSwapMessagePublic(aztecRecipient, address(0));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, entryKeyPortalChecksAgainst)
    );
    uniswapPortal.swapPublic(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      aztecRecipient,
      secretHash,
      false
    );
    vm.stopPrank();
  }

  function testRevertIfSwapMessageWasForDifferentPublicOrPrivateFlow() public {
    bytes32 daiWithdrawEntryKey =
      _createDaiWithdrawMessage(address(uniswapPortal), address(uniswapPortal));

    // Create message for `_isPrivateFlow`:
    bytes32 swapEntryKey = _createUniswapSwapMessagePublic(aztecRecipient, address(this));
    _addMessagesToOutbox(daiWithdrawEntryKey, swapEntryKey);

    bytes32 entryKeyPortalChecksAgainst =
      _createUniswapSwapMessagePrivate(secretHashForRedeemingMintedNotes, address(this));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, entryKeyPortalChecksAgainst)
    );

    uniswapPortal.swapPrivate(
      address(daiTokenPortal),
      amount,
      uniswapFeePool,
      address(wethTokenPortal),
      amountOutMinimum,
      secretHashForRedeemingMintedNotes,
      secretHash,
      true
    );
  }
  // TODO(#887) - what if uniswap fails?
  // TODO(#887) - what happens if uniswap deadline is passed?
}
