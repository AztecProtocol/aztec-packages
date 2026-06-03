// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

// docs:start:example_token_portal
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";

/// @title ExampleTokenPortal
/// @notice Example token portal for tutorial.
contract ExampleTokenPortal {
    using SafeERC20 for IERC20;

    IRegistry public registry;
    IERC20 public underlying;
    bytes32 public l2Bridge;

    IRollup public rollup;
    IOutbox public outbox;
    IInbox public inbox;
    uint256 public rollupVersion;

    /// @dev No access control for simplicity. A production contract should restrict this to the deployer/owner.
    function initialize(address _registry, address _underlying, bytes32 _l2Bridge) external {
        registry = IRegistry(_registry);
        underlying = IERC20(_underlying);
        l2Bridge = _l2Bridge;

        rollup = IRollup(address(registry.getCanonicalRollup()));
        outbox = rollup.getOutbox();
        inbox = rollup.getInbox();
        rollupVersion = rollup.getVersion();
    }

    // docs:end:example_token_portal

    // docs:start:deposit_to_aztec_public
    /// @notice Deposit tokens and send L1->L2 message for public minting on Aztec
    function depositToAztecPublic(bytes32 _to, uint256 _amount, bytes32 _secretHash)
        external
        returns (bytes32, uint256)
    {
        DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2Bridge, rollupVersion);

        bytes32 contentHash =
            Hash.sha256ToField(abi.encodeWithSignature("mint_to_public(bytes32,uint256)", _to, _amount));

        underlying.safeTransferFrom(msg.sender, address(this), _amount);

        return inbox.sendL2Message(actor, contentHash, _secretHash);
    }

    // docs:end:deposit_to_aztec_public

    /// @notice Deposit tokens and send L1->L2 message for private minting on Aztec
    function depositToAztecPrivate(uint256 _amount, bytes32 _secretHash) external returns (bytes32, uint256) {
        DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2Bridge, rollupVersion);

        bytes32 contentHash = Hash.sha256ToField(abi.encodeWithSignature("mint_to_private(uint256)", _amount));

        underlying.safeTransferFrom(msg.sender, address(this), _amount);

        return inbox.sendL2Message(actor, contentHash, _secretHash);
    }

    // docs:start:withdraw
    /// @notice Withdraw tokens after consuming an L2->L1 message.
    /// @param _numCheckpointsInEpoch The partial-proof depth (1-indexed) the witness was built against.
    function withdraw(
        address _recipient,
        uint256 _amount,
        Epoch _epoch,
        uint256 _numCheckpointsInEpoch,
        uint256 _leafIndex,
        bytes32[] calldata _path
    ) external {
        DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
            sender: DataStructures.L2Actor(l2Bridge, rollupVersion),
            recipient: DataStructures.L1Actor(address(this), block.chainid),
            content: Hash.sha256ToField(
                abi.encodeWithSignature("withdraw(address,uint256,address)", _recipient, _amount, msg.sender)
            )
        });

        outbox.consume(message, _epoch, _numCheckpointsInEpoch, _leafIndex, _path);

        underlying.safeTransfer(_recipient, _amount);
    }
    // docs:end:withdraw
}
