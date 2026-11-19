// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {
  EthPerFeeAssetE12,
  EthValue,
  FeeAssetValue,
  PriceLib
} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

import {RelayExecutor} from "./RelayExecutor.sol";
import {ClaimItem, OutboxWitness, ProofClaimItem, ProofRequest, RelayLib, RelayRequest} from "./RelayTypes.sol";

/**
 * @title RelayVault
 * @notice Gas-measurement prototype (v2). Holds AZTEC for sponsoring apps, credits deposits to the L2 relay ledger,
 * pays relayers for executed requests at the gas price recorded by the executor, pays provers for fast-proof
 * requests, and refunds expired ones.
 */
contract RelayVault {
  using SafeERC20 for IERC20;

  bytes32 internal constant DEPOSIT = keccak256("relay.deposit");
  bytes32 internal constant CREDIT = keccak256("relay.credit");

  IERC20 public immutable AZTEC;
  IInbox public immutable INBOX;
  IOutbox public immutable OUTBOX;
  IRollup public immutable ROLLUP;
  RelayExecutor public immutable EXECUTOR;
  bytes32 public immutable ESCROW_L2;
  uint256 public immutable VERSION;
  uint256 public immutable CLAIM_WINDOW;

  mapping(bytes32 app => uint256 amount) public remainders;

  error ReceiptNotFound(uint256 index);
  error ReceiptOutOfWindow(uint256 index, uint256 time);
  error GasLimitTooLow(uint256 index);
  error RefundTooEarly();
  error NotFirstProver(uint256 index, address firstProver);
  error ProofRequestExpired(uint256 index);

  constructor(
    IERC20 _aztec,
    IInbox _inbox,
    IOutbox _outbox,
    IRollup _rollup,
    RelayExecutor _executor,
    bytes32 _escrowL2,
    uint256 _version,
    uint256 _claimWindow
  ) {
    AZTEC = _aztec;
    INBOX = _inbox;
    OUTBOX = _outbox;
    ROLLUP = _rollup;
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
   * most once. The gas is priced at the base fee and ETH-per-AZTEC rate the executor recorded for the batch, capped at
   * `maxAztecPerGas`, and the unused part of `gas * maxAztecPerGas` goes to the app's remainder balance.
   */
  function claim(address _relayer, ClaimItem[] calldata _items) external {
    uint256 total = 0;
    for (uint256 i = 0; i < _items.length; i++) {
      ClaimItem calldata item = _items[i];
      RelayRequest calldata r = item.request;
      bytes32 id = RelayLib.requestId(r);
      _consume(id, item.outbox);

      require(item.receipt.gasLimit >= r.gas, GasLimitTooLow(i));
      bytes32 leaf = RelayLib.receiptLeaf(
        RelayLib.spec(id, r.target, r.prefixHash, r.preconditionHash, item.receipt.gasLimit), item.receipt.gasUsed
      );
      require(
        RelayLib.verify(leaf, item.receipt.leafIndex, item.receipt.path, item.receipt.receiptsRoot), ReceiptNotFound(i)
      );
      uint256 batch = EXECUTOR.batches(RelayLib.batchKey(_relayer, item.receipt.receiptsRoot));
      uint256 time = uint64(batch);
      require(time != 0, ReceiptNotFound(i));
      require(r.createdAt <= time && time <= r.deadline, ReceiptOutOfWindow(i, time));

      uint256 gasPayment = _gasPayment(r, item.receipt.gasUsed, batch);
      total += gasPayment + r.tip;
      uint256 maxGasPayment = r.gas * r.maxAztecPerGas;
      if (maxGasPayment > gasPayment) {
        remainders[r.app] += maxGasPayment - gasPayment;
      }
    }
    AZTEC.safeTransfer(_relayer, total);
  }

  /**
   * @notice Pays `_prover` the flat amount of every fast-proof request whose checkpoint it proved first. Each request
   * is consumed from the Outbox, so it is paid at most once. The Rollup records no proof time, so the expiration is
   * checked against the claim time.
   */
  function claimProof(address _prover, ProofClaimItem[] calldata _items) external {
    uint256 total = 0;
    for (uint256 i = 0; i < _items.length; i++) {
      ProofRequest calldata r = _items[i].request;
      _consume(RelayLib.proofRequestId(r), _items[i].outbox);
      require(block.timestamp <= r.expiration, ProofRequestExpired(i));
      address firstProver = ROLLUP.getFirstProvenBy(r.checkpoint);
      require(firstProver == _prover, NotFirstProver(i, firstProver));
      total += r.amount;
    }
    AZTEC.safeTransfer(_prover, total);
  }

  /// @notice Returns an expired, unclaimed request's escrow to the app's L1 remainder balance.
  function refund(RelayRequest calldata _request, OutboxWitness calldata _witness) external {
    require(block.timestamp > uint256(_request.deadline) + CLAIM_WINDOW, RefundTooEarly());
    _consume(RelayLib.requestId(_request), _witness);
    remainders[_request.app] += _request.gas * _request.maxAztecPerGas + _request.tip;
  }

  /// @notice Returns an expired, unclaimed request's escrow to the app's L2 ledger balance.
  function refundToL2(RelayRequest calldata _request, OutboxWitness calldata _witness) external {
    require(block.timestamp > uint256(_request.deadline) + CLAIM_WINDOW, RefundTooEarly());
    _consume(RelayLib.requestId(_request), _witness);
    _credit(CREDIT, _request.app, _request.gas * _request.maxAztecPerGas + _request.tip);
  }

  /// @notice Returns an expired, unclaimed fast-proof request's amount to the app's L1 remainder balance.
  function refundProof(ProofRequest calldata _request, OutboxWitness calldata _witness) external {
    require(block.timestamp > _request.expiration, RefundTooEarly());
    _consume(RelayLib.proofRequestId(_request), _witness);
    remainders[_request.app] += _request.amount;
  }

  /// @dev min(gasUsed * basefee in AZTEC, gasUsed * maxAztecPerGas), with gasUsed clamped to the request's gas so the
  /// payment never exceeds the escrow.
  function _gasPayment(RelayRequest calldata _r, uint256 _gasUsed, uint256 _batch) internal pure returns (uint256) {
    (, uint256 _baseFee, uint256 _ethPerFeeAsset) = RelayLib.unpackBatch(_batch);
    uint256 gasUsed = _gasUsed < _r.gas ? _gasUsed : _r.gas;
    uint256 cap = gasUsed * _r.maxAztecPerGas;
    if (_ethPerFeeAsset == 0) {
      return cap;
    }
    uint256 cost = FeeAssetValue.unwrap(
      PriceLib.toFeeAsset(EthValue.wrap(gasUsed * _baseFee), EthPerFeeAssetE12.wrap(_ethPerFeeAsset))
    );
    return cost < cap ? cost : cap;
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
