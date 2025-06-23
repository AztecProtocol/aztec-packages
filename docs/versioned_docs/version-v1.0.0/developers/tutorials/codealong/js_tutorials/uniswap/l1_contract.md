---
title: L1 contracts (EVM)
sidebar_position: 2
---

This page goes over the code in the L1 contract for Uniswap, which works alongside a [token portal (codealong tutorial)](../token_bridge.md).

## Setup

```solidity title="setup" showLineNumbers 
import {TokenPortal} from "./TokenPortal.sol";
import {ISwapRouter} from "../external/ISwapRouter.sol";

/**
 * @title UniswapPortal
 * @author Aztec Labs
 * @notice A minimal portal that allow an user inside L2, to withdraw asset A from the Rollup
 * swap asset A to asset B, and deposit asset B into the rollup again.
 * Relies on Uniswap for doing the swap, TokenPortals for A and B to get and send tokens
 * and the message boxes (inbox & outbox).
 */
contract UniswapPortal {
  ISwapRouter public constant ROUTER = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

  IRegistry public registry;
  bytes32 public l2UniswapAddress;
  IRollup public rollup;
  IOutbox public outbox;
  uint256 public rollupVersion;

  function initialize(address _registry, bytes32 _l2UniswapAddress) external {
    registry = IRegistry(_registry);
    l2UniswapAddress = _l2UniswapAddress;

    rollup = IRollup(address(registry.getCanonicalRollup()));
    outbox = rollup.getOutbox();
    rollupVersion = rollup.getVersion();
  }

  // Using a struct here to avoid stack too deep errors
  struct LocalSwapVars {
    IERC20 inputAsset;
    IERC20 outputAsset;
    bytes32 contentHash;
  }
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/l1-contracts/test/portals/UniswapPortal.sol#L12-L48" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/test/portals/UniswapPortal.sol#L12-L48</a></sub></sup>


## Public swap

```solidity title="solidity_uniswap_swap_public" showLineNumbers 
/**
 * @notice Exit with funds from L2, perform swap on L1 and deposit output asset to L2 again publicly
 * @dev `msg.value` indicates fee to submit message to inbox. Currently, anyone can call this method on your behalf.
 * They could call it with 0 fee causing the sequencer to never include in the rollup.
 * In this case, you will have to cancel the message and then make the deposit later
 * @param _inputTokenPortal - The ethereum address of the input token portal
 * @param _inAmount - The amount of assets to swap (same amount as withdrawn from L2)
 * @param _uniswapFeeTier - The fee tier for the swap on UniswapV3
 * @param _outputTokenPortal - The ethereum address of the output token portal
 * @param _amountOutMinimum - The minimum amount of output assets to receive from the swap (slippage protection)
 * @param _aztecRecipient - The aztec address to receive the output assets
 * @param _secretHashForL1ToL2Message - The hash of the secret consumable message. The hash should be 254 bits (so it can fit in a Field element)
 * @param _withCaller - When true, using `msg.sender` as the caller, otherwise address(0)
 * @return A hash of the L1 to L2 message inserted in the Inbox
 */
function swapPublic(
  address _inputTokenPortal,
  uint256 _inAmount,
  uint24 _uniswapFeeTier,
  address _outputTokenPortal,
  uint256 _amountOutMinimum,
  bytes32 _aztecRecipient,
  bytes32 _secretHashForL1ToL2Message,
  bool _withCaller,
  // Avoiding stack too deep
  PortalDataStructures.OutboxMessageMetadata[2] calldata _outboxMessageMetadata
) public returns (bytes32, uint256) {
  LocalSwapVars memory vars;

  vars.inputAsset = TokenPortal(_inputTokenPortal).underlying();
  vars.outputAsset = TokenPortal(_outputTokenPortal).underlying();

  // Withdraw the input asset from the portal
  {
    TokenPortal(_inputTokenPortal).withdraw(
      address(this),
      _inAmount,
      true,
      _outboxMessageMetadata[0]._l2BlockNumber,
      _outboxMessageMetadata[0]._leafIndex,
      _outboxMessageMetadata[0]._path
    );
  }

  {
    // prevent stack too deep errors
    // The purpose of including the function selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    vars.contentHash = Hash.sha256ToField(
      abi.encodeWithSignature(
        "swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32,address)",
        _inputTokenPortal,
        _inAmount,
        _uniswapFeeTier,
        _outputTokenPortal,
        _amountOutMinimum,
        _aztecRecipient,
        _secretHashForL1ToL2Message,
        _withCaller ? msg.sender : address(0)
      )
    );
  }

  // Consume the message from the outbox
  {
    outbox.consume(
      DataStructures.L2ToL1Msg({
        sender: DataStructures.L2Actor(l2UniswapAddress, rollupVersion),
        recipient: DataStructures.L1Actor(address(this), block.chainid),
        content: vars.contentHash
      }),
      _outboxMessageMetadata[1]._l2BlockNumber,
      _outboxMessageMetadata[1]._leafIndex,
      _outboxMessageMetadata[1]._path
    );
  }

  // Perform the swap
  ISwapRouter.ExactInputSingleParams memory swapParams;
  {
    swapParams = ISwapRouter.ExactInputSingleParams({
      tokenIn: address(vars.inputAsset),
      tokenOut: address(vars.outputAsset),
      fee: _uniswapFeeTier,
      recipient: address(this),
      deadline: block.timestamp,
      amountIn: _inAmount,
      amountOutMinimum: _amountOutMinimum,
      sqrtPriceLimitX96: 0
    });
  }
  // Note, safeApprove was deprecated from Oz
  vars.inputAsset.approve(address(ROUTER), _inAmount);
  uint256 amountOut = ROUTER.exactInputSingle(swapParams);

  // approve the output token portal to take funds from this contract
  // Note, safeApprove was deprecated from Oz
  vars.outputAsset.approve(address(_outputTokenPortal), amountOut);

  // Deposit the output asset to the L2 via its portal
  return TokenPortal(_outputTokenPortal).depositToAztecPublic(
    _aztecRecipient, amountOut, _secretHashForL1ToL2Message
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/l1-contracts/test/portals/UniswapPortal.sol#L50-L155" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/test/portals/UniswapPortal.sol#L50-L155</a></sub></sup>


1. It fetches the input and output tokens we are swapping. The Uniswap portal only needs to know the portal addresses of the input and output as they store the underlying ERC20 token address.
2. Consumes the `withdraw` message to get input tokens on L1 to itself. This is needed to execute the swap.

   Before it actually can swap, it checks if the provided swap parameters were what the user actually wanted by creating a message content hash (similar to what we did in the L2 contract) to ensure the right parameters are used.

3. Executes the swap and receives the output funds to itself.

   The deadline by which the funds should be swapped is `block.timestamp` i.e. this block itself. This makes things atomic on the L1 side.

4. The portal must deposit the output funds back to L2 using the output token’s portal. For this we first approve the token portal to move Uniswap funds, and then call the portal’s `depositToAztecPublic()` method to transfer funds to the portal and create a L1 → l2 message to mint the right amount of output tokens on L2.

To incentivize the sequencer to pick up this message, we pass a fee to the deposit message.

You can find the corresponding function on the [L2 contracts page](./l2_contract.md#public-swap).

## Private swap

This works very similarly to the public flow.

```solidity title="solidity_uniswap_swap_private" showLineNumbers 
  /**
   * @notice Exit with funds from L2, perform swap on L1 and deposit output asset to L2 again privately
   * @dev `msg.value` indicates fee to submit message to inbox. Currently, anyone can call this method on your behalf.
   * They could call it with 0 fee causing the sequencer to never include in the rollup.
   * In this case, you will have to cancel the message and then make the deposit later
   * @param _inputTokenPortal - The ethereum address of the input token portal
   * @param _inAmount - The amount of assets to swap (same amount as withdrawn from L2)
   * @param _uniswapFeeTier - The fee tier for the swap on UniswapV3
   * @param _outputTokenPortal - The ethereum address of the output token portal
   * @param _amountOutMinimum - The minimum amount of output assets to receive from the swap (slippage protection)
   * @param _secretHashForL1ToL2Message - The hash of the secret consumable message. The hash should be 254 bits (so it can fit in a Field element)
   * @param _withCaller - When true, using `msg.sender` as the caller, otherwise address(0)
   * @return A hash of the L1 to L2 message inserted in the Inbox
   */
  function swapPrivate(
    address _inputTokenPortal,
    uint256 _inAmount,
    uint24 _uniswapFeeTier,
    address _outputTokenPortal,
    uint256 _amountOutMinimum,
    bytes32 _secretHashForL1ToL2Message,
    bool _withCaller,
    // Avoiding stack too deep
    PortalDataStructures.OutboxMessageMetadata[2] calldata _outboxMessageMetadata
  ) public returns (bytes32, uint256) {
    LocalSwapVars memory vars;

    vars.inputAsset = TokenPortal(_inputTokenPortal).underlying();
    vars.outputAsset = TokenPortal(_outputTokenPortal).underlying();

    {
      TokenPortal(_inputTokenPortal).withdraw(
        address(this),
        _inAmount,
        true,
        _outboxMessageMetadata[0]._l2BlockNumber,
        _outboxMessageMetadata[0]._leafIndex,
        _outboxMessageMetadata[0]._path
      );
    }

    {
      // prevent stack too deep errors
      // The purpose of including the function selector is to make the message unique to that specific call. Note that
      // it has nothing to do with calling the function.
      vars.contentHash = Hash.sha256ToField(
        abi.encodeWithSignature(
          "swap_private(address,uint256,uint24,address,uint256,bytes32,address)",
          _inputTokenPortal,
          _inAmount,
          _uniswapFeeTier,
          _outputTokenPortal,
          _amountOutMinimum,
          _secretHashForL1ToL2Message,
          _withCaller ? msg.sender : address(0)
        )
      );
    }

    // Consume the message from the outbox
    {
      outbox.consume(
        DataStructures.L2ToL1Msg({
          sender: DataStructures.L2Actor(l2UniswapAddress, rollupVersion),
          recipient: DataStructures.L1Actor(address(this), block.chainid),
          content: vars.contentHash
        }),
        _outboxMessageMetadata[1]._l2BlockNumber,
        _outboxMessageMetadata[1]._leafIndex,
        _outboxMessageMetadata[1]._path
      );
    }

    // Perform the swap
    ISwapRouter.ExactInputSingleParams memory swapParams;
    {
      swapParams = ISwapRouter.ExactInputSingleParams({
        tokenIn: address(vars.inputAsset),
        tokenOut: address(vars.outputAsset),
        fee: _uniswapFeeTier,
        recipient: address(this),
        deadline: block.timestamp,
        amountIn: _inAmount,
        amountOutMinimum: _amountOutMinimum,
        sqrtPriceLimitX96: 0
      });
    }
    // Note, safeApprove was deprecated from Oz
    vars.inputAsset.approve(address(ROUTER), _inAmount);
    uint256 amountOut = ROUTER.exactInputSingle(swapParams);

    // approve the output token portal to take funds from this contract
    // Note, safeApprove was deprecated from Oz
    vars.outputAsset.approve(address(_outputTokenPortal), amountOut);

    // Deposit the output asset to the L2 via its portal
    return
      TokenPortal(_outputTokenPortal).depositToAztecPrivate(amountOut, _secretHashForL1ToL2Message);
  }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/l1-contracts/test/portals/UniswapPortal.sol#L157-L258" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/test/portals/UniswapPortal.sol#L157-L258</a></sub></sup>


You can find the corresponding function on the [L2 contracts page](./l2_contract.md#private-swap).
