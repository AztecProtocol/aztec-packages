// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

import {RelayExecutor} from "./RelayExecutor.sol";
import {ClaimItem, OutboxWitness, RelayLib, RelayRequest} from "./RelayTypes.sol";

/**
 * @title RelayVault
 * @notice Naive gas-measurement prototype. Holds AZTEC for sponsoring apps, credits deposits to the L2 relay escrow,
 * pays relayers for executed requests and refunds expired ones.
 */
contract RelayVault {
  using SafeERC20 for IERC20;

  bytes32 internal constant DEPOSIT = keccak256("relay.deposit");
  bytes32 internal constant CREDIT = keccak256("relay.credit");

  IERC20 public immutable AZTEC;
  IInbox public immutable INBOX;
  IOutbox public immutable OUTBOX;
  RelayExecutor public immutable EXECUTOR;
  bytes32 public immutable ESCROW_L2;
  uint256 public immutable VERSION;
  uint256 public immutable CLAIM_WINDOW;

  mapping(bytes32 app => uint256 amount) public remainders;

  error ReceiptNotFound(uint256 index);
  error ReceiptOutOfWindow(uint256 index, uint256 time);
  error GasLimitTooLow(uint256 index);
  error RefundTooEarly();

  constructor(
    IERC20 _aztec,
    IInbox _inbox,
    IOutbox _outbox,
    RelayExecutor _executor,
    bytes32 _escrowL2,
    uint256 _version,
    uint256 _claimWindow
  ) {
    AZTEC = _aztec;
    INBOX = _inbox;
    OUTBOX = _outbox;
    EXECUTOR = _executor;
    ESCROW_L2 = _escrowL2;
    VERSION = _version;
    CLAIM_WINDOW = _claimWindow;
  }

  function deposit(bytes32 _app, uint256 _amount) external {
    AZTEC.safeTransferFrom(msg.sender, address(this), _amount);
    _credit(DEPOSIT, _app, _amount);
  }

  /**
   * @notice Pays `_relayer` for every request it executed. Each request is consumed from the Outbox, so it is paid at
   * most once, and the difference between the escrowed max payment and the metered payment goes to the app's
   * remainder balance.
   */
  function claim(address _relayer, ClaimItem[] calldata _items) external {
    uint256 total = 0;
    for (uint256 i = 0; i < _items.length; i++) {
      ClaimItem calldata item = _items[i];
      RelayRequest calldata r = item.request;
      bytes32 id = RelayLib.requestId(r);
      _consume(id, item.outbox);

      require(item.receipt.gasLimit >= r.minGas, GasLimitTooLow(i));
      bytes32 leaf = RelayLib.receiptLeaf(
        RelayLib.spec(id, r.target, r.postconditionHash, item.receipt.gasLimit), item.receipt.gasUsed
      );
      require(
        RelayLib.verify(leaf, item.receipt.leafIndex, item.receipt.path, item.receipt.receiptsRoot), ReceiptNotFound(i)
      );
      uint256 time = EXECUTOR.batches(RelayLib.batchKey(_relayer, item.receipt.receiptsRoot));
      require(time != 0, ReceiptNotFound(i));
      require(r.createdAt <= time && time <= r.deadline, ReceiptOutOfWindow(i, time));

      uint256 gasPayment = item.receipt.gasUsed * r.pricePerGas;
      if (gasPayment > r.maxPayment) {
        gasPayment = r.maxPayment;
      }
      total += gasPayment + r.tip;
      if (r.maxPayment > gasPayment) {
        remainders[r.app] += r.maxPayment - gasPayment;
      }
    }
    AZTEC.safeTransfer(_relayer, total);
  }

  /// @notice Returns an expired, unclaimed request's escrow to the app's L1 remainder balance.
  function refund(RelayRequest calldata _request, OutboxWitness calldata _witness) external {
    require(block.timestamp > uint256(_request.deadline) + CLAIM_WINDOW, RefundTooEarly());
    _consume(RelayLib.requestId(_request), _witness);
    remainders[_request.app] += _request.maxPayment + _request.tip;
  }

  /// @notice Returns an expired, unclaimed request's escrow to the app's L2 escrow balance.
  function refundToL2(RelayRequest calldata _request, OutboxWitness calldata _witness) external {
    require(block.timestamp > uint256(_request.deadline) + CLAIM_WINDOW, RefundTooEarly());
    _consume(RelayLib.requestId(_request), _witness);
    _credit(CREDIT, _request.app, _request.maxPayment + _request.tip);
  }

  function _consume(bytes32 _requestId, OutboxWitness calldata _w) internal {
    OUTBOX.consume(
      DataStructures.L2ToL1Msg({
        sender: DataStructures.L2Actor(ESCROW_L2, VERSION),
        recipient: DataStructures.L1Actor(address(this), block.chainid),
        content: _requestId
      }),
      _w.epoch,
      _w.numCheckpointsInEpoch,
      _w.leafIndex,
      _w.path
    );
  }

  function _credit(bytes32 _kind, bytes32 _app, uint256 _amount) internal {
    INBOX.sendL2Message(
      DataStructures.L2Actor(ESCROW_L2, VERSION), Hash.sha256ToField(abi.encode(_kind, _app, _amount)), bytes32(0)
    );
  }
}
