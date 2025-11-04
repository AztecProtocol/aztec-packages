// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

// docs:start:portal_setup
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IRegistry} from "@aztec/l1-contracts/src/governance/interfaces/IRegistry.sol";
import {IInbox} from "@aztec/l1-contracts/src/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol";
import {IRollup} from "@aztec/l1-contracts/src/core/interfaces/IRollup.sol";
import {DataStructures} from "@aztec/l1-contracts/src/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/l1-contracts/src/core/libraries/crypto/Hash.sol";

contract NFTPortal {
    IRegistry public registry;
    IERC721 public nftContract;
    bytes32 public l2Bridge;

    IRollup public rollup;
    IOutbox public outbox;
    IInbox public inbox;
    uint256 public rollupVersion;

    function initialize(address _registry, address _nftContract, bytes32 _l2Bridge) external {
        registry = IRegistry(_registry);
        nftContract = IERC721(_nftContract);
        l2Bridge = _l2Bridge;

        rollup = IRollup(address(registry.getCanonicalRollup()));
        outbox = rollup.getOutbox();
        inbox = rollup.getInbox();
        rollupVersion = rollup.getVersion();
    }
    // docs:end:portal_setup

    // docs:start:portal_deposit_and_withdraw
    // Lock NFT and send message to L2
    function depositToAztec(uint256 tokenId, bytes32 secretHash) external returns (bytes32, uint256) {
        // Lock the NFT
        nftContract.transferFrom(msg.sender, address(this), tokenId);

        // Prepare L2 message - just a naive hash of our tokenId
        DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2Bridge, rollupVersion);
        bytes32 contentHash = Hash.sha256ToField(abi.encode(tokenId));

        // Send message to Aztec
        (bytes32 key, uint256 index) = inbox.sendL2Message(actor, contentHash, secretHash);
        return (key, index);
    }

    // Unlock NFT after L2 burn
    function withdraw(
        uint256 tokenId,
        uint256 l2BlockNumber,
        uint256 leafIndex,
        bytes32[] calldata path
    ) external {
        // Verify message from L2
        DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
            sender: DataStructures.L2Actor(l2Bridge, rollupVersion),
            recipient: DataStructures.L1Actor(address(this), block.chainid),
            content: Hash.sha256ToField(abi.encodePacked(tokenId, msg.sender))
        });

        outbox.consume(message, l2BlockNumber, leafIndex, path);

        // Unlock NFT
        nftContract.transferFrom(address(this), msg.sender, tokenId);
    }
}
// docs:end:portal_deposit_and_withdraw
