// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRollup, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Postcondition, RelayCall, RelayLib} from "./RelayTypes.sol";

/**
 * @title RelayExecutor
 * @notice Naive gas-measurement prototype. Holds no funds. Executes relay calls guarded by postconditions and records
 * one receipts root per batch, plus receipts for epoch proofs submitted through it.
 */
contract RelayExecutor {
  struct ProofReceipt {
    uint256 provenBefore;
    uint256 provenAfter;
    address proverId;
    uint256 time;
  }

  /// @dev Headroom kept on top of a call's gas limit so the 63/64 rule cannot starve it.
  uint256 internal constant CALL_GAS_BUFFER = 10_000;

  IRollup public immutable ROLLUP;

  mapping(bytes32 batchKey => uint256 timestamp) public batches;
  ProofReceipt[] public proofReceipts;

  event CallExecuted(bytes32 indexed requestId, uint256 gasUsed);
  event BatchExecuted(address indexed relayer, bytes32 receiptsRoot, uint256 numReceipts);

  error InsufficientGas(uint256 index);

  constructor(IRollup _rollup) {
    ROLLUP = _rollup;
  }

  /**
   * @notice Executes each call whose postcondition is false before and true after. Failed calls are skipped and get
   * no receipt. Successful calls become (spec, gasUsed) leaves of the batch's receipts root.
   * @param _relayer The account credited with the batch, so the batch can be sent through a shared multicall.
   */
  function executeBatch(address _relayer, RelayCall[] calldata _calls) external returns (bytes32 root) {
    bytes32[] memory leaves = new bytes32[](_calls.length);
    uint256 n = 0;
    for (uint256 i = 0; i < _calls.length; i++) {
      RelayCall calldata c = _calls[i];
      if (_holds(c.post)) {
        continue;
      }
      require(gasleft() >= c.gasLimit * 64 / 63 + CALL_GAS_BUFFER, InsufficientGas(i));
      uint256 before = gasleft();
      (bool ok,) = c.target.call{gas: c.gasLimit}(c.data);
      uint256 gasUsed = before - gasleft();
      if (!ok || !_holds(c.post)) {
        continue;
      }
      bytes32 spec = RelayLib.spec(c.requestId, c.target, RelayLib.postconditionHash(c.post), c.gasLimit);
      leaves[n++] = RelayLib.receiptLeaf(spec, gasUsed);
      emit CallExecuted(c.requestId, gasUsed);
    }
    if (n == 0) {
      return bytes32(0);
    }
    root = RelayLib.merkleRoot(leaves, n);
    batches[RelayLib.batchKey(_relayer, root)] = block.timestamp;
    emit BatchExecuted(_relayer, root, n);
  }

  /// @notice Submits an epoch root proof and records how far it moved the proven tip.
  function submitProof(SubmitEpochRootProofArgs calldata _args) external {
    uint256 provenBefore = ROLLUP.getProvenCheckpointNumber();
    ROLLUP.submitEpochRootProof(_args);
    uint256 provenAfter = ROLLUP.getProvenCheckpointNumber();
    proofReceipts.push(ProofReceipt(provenBefore, provenAfter, _args.args.proverId, block.timestamp));
  }

  function _holds(Postcondition calldata _post) internal view returns (bool) {
    (bool ok, bytes memory ret) = _post.target.staticcall(_post.data);
    return ok && keccak256(ret) == _post.expectedHash;
  }
}
