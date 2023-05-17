pragma solidity >=0.8.18;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

// Messaging
import {IRegistry} from "@aztec/core/interfaces/messagebridge/IRegistry.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IMessageBox} from "@aztec/core/interfaces/messagebridge/IMessageBox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

contract TokenPortal {
  using SafeERC20 for IERC20;

  IRegistry public immutable REGISTRY;
  IERC20 public immutable UNDERLYING;

  constructor(IRegistry _rollupRegistry, IERC20 _underlying) {
    REGISTRY = _rollupRegistry;
    UNDERLYING = _underlying;
  }

  /**
   * @notice Deposit funds into the portal and adds an L2 message.
   * @param _to - The aztec address of the recipient
   * @param _amount - The amount to deposit
   * @param _deadline - The timestamp after which the entry can be cancelled
   * @param _secretHash - The hash of the secret consumable message
   * @return The key of the entry in the Inbox
   */
  function depositToAztec(bytes32 _to, uint256 _amount, uint32 _deadline, bytes32 _secretHash)
    external
    payable
    returns (bytes32)
  {
    // Preamble
    IInbox inbox = REGISTRY.getInbox();
    DataStructures.L2Actor memory actor = DataStructures.L2Actor(_to, 1);

    // Hash the message content to be reconstructed in the receiving contract
    bytes memory content = abi.encode(_amount, _to);
    bytes32 contentHash = bytes32(uint256(sha256(content)) % DataStructures.P);

    // Hold the tokens in the portal
    UNDERLYING.safeTransferFrom(msg.sender, address(this), _amount);

    // Send message to rollup
    return inbox.sendL2Message{value: msg.value}(actor, _deadline, contentHash, _secretHash);
  }
}
