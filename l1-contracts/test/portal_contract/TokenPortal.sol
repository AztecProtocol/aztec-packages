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

  // TODO: Portal contract mapping !
  function depositToAztec(
    bytes32 _to,
    uint256 _amount,
    uint32 _deadline,
    bytes32 _secretHash
  ) external payable returns (bytes32) {
    IInbox inbox = REGISTRY.getInboxAddress();

    // TODO: return the version from the registry
    IMessageBox.L2Actor memory actor = IMessageBox.L2Actor(_to, 1);
    
    bytes memory content = abi.encode(
      _to, _amount
    );
    bytes32 contentHash = sha256(content);
    UNDERLYING.safeTransferFrom(msg.sender, address(this), _amount);
    // Value is the eth fee of the transfer (do we want this to be in a native asset)?
    return inbox.sendL2Message{value: msg.value}(actor, _deadline, contentHash, _secretHash);
  }

  /**
   * @notice Deposit funds into the portal and adds an L2 message.
   * @dev Includes a selector to easily distinguish messages types
   * @dev Appends the msg.sender to message to support cancelling if stale
   * @param _amount - The amount to deposit
   * @param _to - The aztec address of the recipient
   * @param _caller - The aztec address that can execute on L2, bytes32(0) for anyone
   * @param _deadline - The timestamp after which the entry can be cancelled
   * @param _canceller - The eth address of the account that can cancel the message after deadline
   * @return The key of the entry in the Inbox
   */
  // TODO: not fully functional
  // function deposit(
  //   uint256 _amount,
  //   bytes32 _to,
  //   bytes32 _caller,
  //   uint256 _deadline,
  //   address _canceller
  // ) external payable returns (bytes32) {
  //   IInbox inbox = REGISTRY.getInboxAddress();

  //   bytes memory message = abi.encode(
  //     _to, _amount
  //   );
  //   UNDERLYING.safeTransferFrom(msg.sender, address(this), _amount);
  //   return inbox.sendL2Message{value: msg.value}(_deadline, message);
  // }
  /**
   * @notice Cancel a stale deposit and refund fee
   * @dev Includes a selector to easily distinguish messages types
   * @dev Only meaningfully callable by the account that initiated the deposit
   * as it would otherwise not hit an entry
   * @dev Will revert if the deadline have not been crossed
   * @param _amount - The amount to deposit
   * @param _to - The aztec address of the recipient
   * @param _caller - The aztec address that can execute on L2, bytes32(0) for anyone
   * @param _deadline - The timestamp after which the entry can be cancelled
   * @param _fee - The fee paid when submitting the Tx
   * @return The entryKey of the entry removed from the Inbox
   */

  // TODO: not fully functional
  // function cancelDeposit(
  //   uint256 _amount,
  //   bytes32 _to,
  //   bytes32 _caller,
  //   uint256 _deadline,
  //   uint256 _fee
  // ) external returns (bytes32) {
  //   IInbox inbox = REGISTRY.getInboxAddress();

  //   bytes memory message = abi.encode(
  //     _to, _amount
  //   );
  //   bytes32 entryKey = inbox.cancelL2Message(msg.sender, _deadline, _fee, message);
  //   UNDERLYING.safeTransfer(msg.sender, _amount);
  //   return entryKey;
  // }

  // /**
  //  * @notice Withdraw funds from the portal
  //  * @dev Will revert if not consuming an entry in the Outbox
  //  * @param _amount - The amount to withdraw
  //  * @param _to - The ethereum address of the recipient
  //  * @param _withCaller - Flag to use `msg.sender` as caller, otherwise using address(0)
  //  * @dev If caller specified from L2, must use `_withCaller = true` and be correct caller to not revert
  //  */
  // function withdraw(uint256 _amount, address _to, bool _withCaller) external {
  //   // Including selector as message separator
  //   bytes memory message = abi.encodeWithSignature(
  //     "withdraw(uint256,address,address)", _amount, _to, _withCaller ? msg.sender : address(0)
  //   );
  //   outbox.consume(message);
  //   UNDERLYING.safeTransfer(_to, _amount);
  // }
}
