pragma solidity >=0.8.18;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

// Messaging
import {IRegistry} from "@aztec/core/interfaces/messagebridge/IRegistry.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/Hash.sol";

contract TokenPortal {
  using SafeERC20 for IERC20;

  IRegistry public registry;
  IERC20 public underlying;
  bytes32 public l2TokenAddress;

  function initialize(address _registry, address _underlying, bytes32 _l2TokenAddress) external {
    registry = IRegistry(_registry);
    underlying = IERC20(_underlying);
    l2TokenAddress = _l2TokenAddress;
  }

  /**
   * @notice Deposit funds into the portal and adds an L2 message.
   * @param _to - The aztec address of the recipient
   * @param _amount - The amount to deposit
   * @param _deadline - The timestamp after which the entry can be cancelled
   * @param _secretHash - The hash of the secret consumable message
   * @param _canceller - The address that can cancel the L1 to L2 message.
   * @return The key of the entry in the Inbox
   */
  function depositToAztec(
    bytes32 _to,
    uint256 _amount,
    uint32 _deadline,
    bytes32 _secretHash,
    address _canceller
  ) external payable returns (bytes32) {
    // Preamble
    // @todo: (issue #624) handle different versions
    IInbox inbox = registry.getInbox();
    DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2TokenAddress, 1);

    // Hash the message content to be reconstructed in the receiving contract
    bytes32 contentHash = Hash.sha256ToField(
      abi.encodeWithSignature("mint(uint256,bytes32,address)", _amount, _to, _canceller)
    );

    // Hold the tokens in the portal
    underlying.safeTransferFrom(msg.sender, address(this), _amount);

    // Send message to rollup
    return inbox.sendL2Message{value: msg.value}(actor, _deadline, contentHash, _secretHash);
  }

  /**
   * @notice Cancel the L1 to L2 message
   * @dev only callable by the `canceller` of the message
   * @param _to - The aztec address of the recipient in the original message
   * @param _amount - The amount to deposit per the original message
   * @param _deadline - The timestamp after which the entry can be cancelled
   * @param _secretHash - The hash of the secret consumable message in the original message
   * @param _fee - The fee paid to the sequencer
   * @return The key of the entry in the Inbox
   */
  function cancelL1ToAztecMessage(
    bytes32 _to,
    uint256 _amount,
    uint32 _deadline,
    bytes32 _secretHash,
    uint64 _fee
  ) external returns (bytes32) {
    // @todo: (issue #624) handle different versions
    IInbox inbox = registry.getInbox();
    DataStructures.L1Actor memory l1Actor = DataStructures.L1Actor(address(this), block.chainid);
    DataStructures.L2Actor memory l2Actor = DataStructures.L2Actor(l2TokenAddress, 1);
    DataStructures.L1ToL2Msg memory message = DataStructures.L1ToL2Msg({
      sender: l1Actor,
      recipient: l2Actor,
      content: Hash.sha256ToField(
        abi.encodeWithSignature("mint(uint256,bytes32,address)", _amount, _to, msg.sender)
        ),
      secretHash: _secretHash,
      deadline: _deadline,
      fee: _fee
    });
    bytes32 entryKey = inbox.cancelL2Message(message, address(this));
    // release the funds to msg.sender (since the content hash (& message key) is derived by hashing the caller,
    // we confirm that msg.sender is same as `_canceller` supplied when creating the message)
    underlying.transfer(msg.sender, _amount);
    return entryKey;
  }

  /**
   * @notice Withdraw funds from the portal
   * @dev Second part of withdraw, must be initiated from L2 first as it will consume a message from outbox
   * @param _amount - The amount to withdraw
   * @param _recipient - The address to send the funds to
   * @param _withCaller - Flag to use `msg.sender` as caller, otherwise address(0)
   * Must match the caller of the message (specified from L2) to consume it.
   * @return The key of the entry in the Outbox
   */
  function withdraw(uint256 _amount, address _recipient, bool _withCaller)
    external
    returns (bytes32)
  {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(l2TokenAddress, 1),
      recipient: DataStructures.L1Actor(address(this), block.chainid),
      content: Hash.sha256ToField(
        abi.encodeWithSignature(
          "withdraw(uint256,address,address)",
          _amount,
          _recipient,
          _withCaller ? msg.sender : address(0)
        )
        )
    });

    // @todo: (issue #624) handle different versions
    bytes32 entryKey = registry.getOutbox().consume(message);

    underlying.transfer(_recipient, _amount);

    return entryKey;
  }
}
