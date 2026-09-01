// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

// docs:start:example_uniswap_portal
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {ExampleTokenPortal} from "./ExampleTokenPortal.sol";

/// @title ExampleUniswapPortal
/// @notice Example swap portal for tutorial. Instead of using a real Uniswap V3 router,
///         performs a mock 1:1 swap by transferring pre-funded output tokens.
///         Still demonstrates the core pattern: consuming 2 L2->L1 messages per swap.
contract ExampleUniswapPortal {
    using SafeERC20 for IERC20;

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

    // docs:end:example_uniswap_portal

    // docs:start:swap_public
    /// @notice Execute a public swap: consume 2 L2->L1 messages, mock-swap, deposit output to L2
    /// @dev Message 1: TokenBridge exit (withdraw input tokens to this contract)
    ///      Message 2: Uniswap swap intent (proves the user authorized this exact swap)
    function swapPublic(
        address _inputTokenPortal,
        uint256 _inAmount,
        uint24 _uniswapFeeTier,
        address _outputTokenPortal,
        uint256 _amountOutMinimum,
        bytes32 _aztecRecipient,
        bytes32 _privateContentHashForL1ToL2Message,
        // Outbox message metadata for the two L2->L1 messages
        Epoch[2] calldata _epochs,
        uint256[2] calldata _numCheckpointsInEpochs,
        uint256[2] calldata _leafIndices,
        bytes32[][2] calldata _paths
    ) external returns (bytes32, uint256) {
        IERC20 outputAsset = ExampleTokenPortal(_outputTokenPortal).underlying();

        // Message 1: Consume the token bridge exit message (withdraw input tokens)
        ExampleTokenPortal(_inputTokenPortal)
            .withdraw(address(this), _inAmount, _epochs[0], _numCheckpointsInEpochs[0], _leafIndices[0], _paths[0]);

        // Message 2: Consume the uniswap swap intent message
        bytes32 contentHash = Hash.sha256ToField(
            abi.encodeWithSignature(
                "swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32)",
                _inputTokenPortal,
                _inAmount,
                _uniswapFeeTier,
                _outputTokenPortal,
                _amountOutMinimum,
                _aztecRecipient,
                _privateContentHashForL1ToL2Message
            )
        );

        outbox.consume(
            DataStructures.L2ToL1Msg({
                sender: DataStructures.L2Actor(l2UniswapAddress, rollupVersion),
                recipient: DataStructures.L1Actor(address(this), block.chainid),
                content: contentHash
            }),
            _epochs[1],
            _numCheckpointsInEpochs[1],
            _leafIndices[1],
            _paths[1]
        );

        // Mock swap: 1:1 transfer (this contract must be pre-funded with output tokens)
        uint256 amountOut = _inAmount;
        require(amountOut >= _amountOutMinimum, "Insufficient output amount");

        // Approve output token portal and deposit back to Aztec
        outputAsset.approve(_outputTokenPortal, amountOut);
        return ExampleTokenPortal(_outputTokenPortal)
            .depositToAztecPublic(_aztecRecipient, amountOut, _privateContentHashForL1ToL2Message);
    }

    // docs:end:swap_public

    // docs:start:swap_private
    /// @notice Execute a private swap: same pattern but deposits output privately
    function swapPrivate(
        address _inputTokenPortal,
        uint256 _inAmount,
        uint24 _uniswapFeeTier,
        address _outputTokenPortal,
        uint256 _amountOutMinimum,
        bytes32 _privateContentHashForL1ToL2Message,
        // Outbox message metadata for the two L2->L1 messages
        Epoch[2] calldata _epochs,
        uint256[2] calldata _numCheckpointsInEpochs,
        uint256[2] calldata _leafIndices,
        bytes32[][2] calldata _paths
    ) external returns (bytes32, uint256) {
        IERC20 outputAsset = ExampleTokenPortal(_outputTokenPortal).underlying();

        // Message 1: Consume the token bridge exit message (withdraw input tokens)
        ExampleTokenPortal(_inputTokenPortal)
            .withdraw(address(this), _inAmount, _epochs[0], _numCheckpointsInEpochs[0], _leafIndices[0], _paths[0]);

        // Message 2: Consume the uniswap swap intent message
        bytes32 contentHash = Hash.sha256ToField(
            abi.encodeWithSignature(
                "swap_private(address,uint256,uint24,address,uint256,bytes32)",
                _inputTokenPortal,
                _inAmount,
                _uniswapFeeTier,
                _outputTokenPortal,
                _amountOutMinimum,
                _privateContentHashForL1ToL2Message
            )
        );

        outbox.consume(
            DataStructures.L2ToL1Msg({
                sender: DataStructures.L2Actor(l2UniswapAddress, rollupVersion),
                recipient: DataStructures.L1Actor(address(this), block.chainid),
                content: contentHash
            }),
            _epochs[1],
            _numCheckpointsInEpochs[1],
            _leafIndices[1],
            _paths[1]
        );

        // Mock swap: 1:1 transfer
        uint256 amountOut = _inAmount;
        require(amountOut >= _amountOutMinimum, "Insufficient output amount");

        // Approve output token portal and deposit back to Aztec privately
        outputAsset.approve(_outputTokenPortal, amountOut);
        return ExampleTokenPortal(_outputTokenPortal).depositToAztecPrivate(amountOut, _privateContentHashForL1ToL2Message);
    }
    // docs:end:swap_private
}
