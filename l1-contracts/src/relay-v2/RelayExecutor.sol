// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {EthPerFeeAssetE12} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {
  PRECONDITION_ERC20_BALANCE,
  PRECONDITION_NONE,
  PRECONDITION_OUTBOX_MESSAGE,
  Precondition,
  RelayCall,
  RelayLib
} from "./RelayTypes.sol";

/**
 * @title RelayExecutor
 * @notice Gas-measurement prototype (v2). Holds no funds. Checks each call's pre-defined precondition, runs the
 * request's calldata prefix plus the relayer's suffix, and records one slot per batch holding the batch's receipts
 * root key, the timestamp, the base fee and the rollup's ETH-per-AZTEC price.
 */
contract RelayExecutor {
  /// @dev Headroom kept on top of a call's gas limit so the 63/64 rule cannot starve it.
  uint256 internal constant CALL_GAS_BUFFER = 10_000;

  IRollup public immutable ROLLUP;
  IOutbox public immutable OUTBOX;

  /// @dev RelayLib.packBatch(timestamp, basefee, ethPerFeeAsset).
  mapping(bytes32 batchKey => uint256 packed) public batches;

  event CallExecuted(bytes32 indexed requestId, uint256 gasUsed);
  event BatchExecuted(address indexed relayer, bytes32 receiptsRoot, uint256 numReceipts);

  error InsufficientGas(uint256 index);

  constructor(IRollup _rollup) {
    ROLLUP = _rollup;
    OUTBOX = _rollup.getOutbox();
  }

  /**
   * @notice Executes each call whose precondition holds. Failed calls are skipped and get no receipt. Successful
   * calls become (spec, gasUsed) leaves of the batch's receipts root.
   * @param _relayer The account credited with the batch, so the batch can be sent through a shared multicall.
   */
  function executeBatch(address _relayer, RelayCall[] calldata _calls) external returns (bytes32 root) {
    bytes32[] memory leaves = new bytes32[](_calls.length);
    uint256 n = 0;
    for (uint256 i = 0; i < _calls.length; i++) {
      RelayCall calldata c = _calls[i];
      if (!_holds(c.pre, c.witness)) {
        continue;
      }
      require(gasleft() >= c.gasLimit * 64 / 63 + CALL_GAS_BUFFER, InsufficientGas(i));
      uint256 before = gasleft();
      (bool ok,) = c.target.call{gas: c.gasLimit}(bytes.concat(c.prefix, c.suffix));
      uint256 left = gasleft();
      if (!ok) {
        continue;
      }
      // EIP-8037 can refund state gas to regular gas inside the call, so `left` may exceed `before`.
      uint256 gasUsed = before > left ? before - left : 0;
      bytes32 spec = RelayLib.spec(
        c.requestId, c.target, keccak256(c.prefix), RelayLib.preconditionHash(c.pre.kind, c.pre.params), c.gasLimit
      );
      leaves[n++] = RelayLib.receiptLeaf(spec, gasUsed);
      emit CallExecuted(c.requestId, gasUsed);
    }
    if (n == 0) {
      return bytes32(0);
    }
    root = RelayLib.merkleRoot(leaves, n);
    (uint256 baseFee, uint256 ethPerFeeAsset) = _price();
    batches[RelayLib.batchKey(_relayer, root)] = RelayLib.packBatch(block.timestamp, baseFee, ethPerFeeAsset);
    emit BatchExecuted(_relayer, root, n);
  }

  function _price() internal view virtual returns (uint256 baseFee, uint256 ethPerFeeAsset) {
    return (block.basefee, EthPerFeeAssetE12.unwrap(ROLLUP.getEthPerFeeAsset()));
  }

  function _holds(Precondition calldata _pre, bytes calldata _witness) internal view returns (bool) {
    uint8 kind = _pre.kind;
    if (kind == PRECONDITION_NONE) {
      return true;
    }
    if (kind == PRECONDITION_ERC20_BALANCE) {
      (address token, address holder, uint256 minAmount) = abi.decode(_pre.params, (address, address, uint256));
      (bool ok, bytes memory ret) = token.staticcall(abi.encodeCall(IERC20.balanceOf, (holder)));
      return ok && ret.length >= 32 && abi.decode(ret, (uint256)) >= minAmount;
    }
    if (kind == PRECONDITION_OUTBOX_MESSAGE) {
      bytes32 messageHash = abi.decode(_pre.params, (bytes32));
      (Epoch epoch, uint256 numCheckpoints, uint256 leafIndex, bytes32[] memory path) =
        abi.decode(_witness, (Epoch, uint256, uint256, bytes32[]));
      bytes32 outboxRoot = OUTBOX.getRootData(epoch, numCheckpoints);
      return outboxRoot != bytes32(0) && RelayLib.verifyOutbox(messageHash, leafIndex, path, outboxRoot);
    }
    return false;
  }
}
