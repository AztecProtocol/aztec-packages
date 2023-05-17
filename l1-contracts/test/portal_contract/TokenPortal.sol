pragma solidity >=0.8.18;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

// Messaging
import {IRegistryReader} from "@aztec/interfaces/message_bridge/IRegistryReader.sol";
import {IInbox} from "@aztec/interfaces/message_bridge/IInbox.sol";
import {IMessageBox} from "@aztec/interfaces/message_bridge/IMessageBox.sol";

contract TokenPortal {
  using SafeERC20 for IERC20;

  IRegistryReader public immutable REGISTRY;
  IERC20 public immutable UNDERLYING;

  constructor(IRegistryReader _rollupRegistry, IERC20 _underlying) {
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
    IMessageBox.L2Actor memory actor = IMessageBox.L2Actor(_to, 1);

    // Hash the message content to be reconstructed in the receiving contract
    bytes memory content = abi.encode(_amount, _to);
    bytes32 contentHash = sha256(content);
    
    // Hold the tokens in the portal
    UNDERLYING.safeTransferFrom(msg.sender, address(this), _amount);

    // Send message to rollup
    return inbox.sendL2Message{value: msg.value}(actor, _deadline, contentHash, _secretHash);
  }
}
