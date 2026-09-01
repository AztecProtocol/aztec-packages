// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

// docs:start:portal_setup
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

contract AavePortal {
    using SafeERC20 for IERC20;

    IRegistry public registry;
    IERC20 public underlying;
    IERC20 public aToken;
    IAavePool public aavePool;
    bytes32 public l2Bridge;

    IRollup public rollup;
    IOutbox public outbox;
    IInbox public inbox;
    uint256 public rollupVersion;

    bool private _initialized;

    function initialize(address _registry, address _underlying, address _aToken, address _aavePool, bytes32 _l2Bridge)
        external
    {
        require(!_initialized, "Already initialized");
        _initialized = true;

        registry = IRegistry(_registry);
        underlying = IERC20(_underlying);
        aToken = IERC20(_aToken);
        aavePool = IAavePool(_aavePool);
        l2Bridge = _l2Bridge;

        rollup = IRollup(address(registry.getCanonicalRollup()));
        outbox = rollup.getOutbox();
        inbox = rollup.getInbox();
        rollupVersion = rollup.getVersion();
    }

    // docs:end:portal_setup

    // docs:start:portal_deposit_to_aave
    /// @notice Consume an L2->L1 withdraw message and deposit the underlying tokens into Aave
    /// @dev The content hash must match what the L2 bridge emits via get_withdraw_content_hash
    function depositToAave(
        address _recipient,
        uint256 _amount,
        bool _withCaller,
        Epoch _epoch,
        uint256 _numCheckpointsInEpoch,
        uint256 _leafIndex,
        bytes32[] calldata _path
    ) external {
        // Reconstruct the L2->L1 message (must match the L2 bridge's exit_to_l1_public/private)
        DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
            sender: DataStructures.L2Actor(l2Bridge, rollupVersion),
            recipient: DataStructures.L1Actor(address(this), block.chainid),
            content: Hash.sha256ToField(
                abi.encodeWithSignature(
                    "withdraw(address,uint256,address)", _recipient, _amount, _withCaller ? msg.sender : address(0)
                )
            )
        });

        // Consume the message from the outbox (verifies merkle proof)
        outbox.consume(message, _epoch, _numCheckpointsInEpoch, _leafIndex, _path);

        // Deposit into Aave instead of sending tokens to the recipient.
        // The portal must already hold the underlying tokens (pre-funded or bridged separately).
        underlying.approve(address(aavePool), _amount);
        aavePool.supply(address(underlying), _amount, address(this), 0);
    }

    // docs:end:portal_deposit_to_aave

    // docs:start:portal_claim_public
    /// @notice Withdraw from Aave and send an L1->L2 message to mint tokens publicly on L2
    function claimFromAavePublic(uint256 _aTokenAmount, bytes32 _to, bytes32 _privateContentHash)
        external
        returns (bytes32, uint256)
    {
        // Withdraw from Aave (returns underlying + yield)
        aToken.approve(address(aavePool), _aTokenAmount);
        uint256 withdrawn = aavePool.withdraw(address(underlying), _aTokenAmount, address(this));

        // Send L1->L2 message with the total withdrawn amount (including yield)
        DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2Bridge, rollupVersion);
        bytes32 publicContentHash =
            Hash.sha256ToField(abi.encodeWithSignature("mint_to_public(bytes32,uint256)", _to, withdrawn));

        (bytes32 key, uint256 index) = inbox.sendL2Message(actor, publicContentHash, _privateContentHash);
        return (key, index);
    }

    // docs:end:portal_claim_public

    // docs:start:portal_claim_private
    /// @notice Withdraw from Aave and send an L1->L2 message to mint tokens privately on L2
    function claimFromAavePrivate(uint256 _aTokenAmount, bytes32 _privateContentHash) external returns (bytes32, uint256) {
        // Withdraw from Aave (returns underlying + yield)
        aToken.approve(address(aavePool), _aTokenAmount);
        uint256 withdrawn = aavePool.withdraw(address(underlying), _aTokenAmount, address(this));

        // Send L1->L2 message for private minting
        DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2Bridge, rollupVersion);
        bytes32 publicContentHash = Hash.sha256ToField(abi.encodeWithSignature("mint_to_private(uint256)", withdrawn));

        (bytes32 key, uint256 index) = inbox.sendL2Message(actor, publicContentHash, _privateContentHash);
        return (key, index);
    }
    // docs:end:portal_claim_private
}
