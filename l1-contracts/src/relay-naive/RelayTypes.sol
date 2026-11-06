// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

/**
 * @notice A relay request, as emitted by the L2 relay escrow in an L2-to-L1 message. The message content is
 * `RelayLib.requestId(request)`.
 */
struct RelayRequest {
  bytes32 app;
  address target;
  bytes32 postconditionHash;
  uint256 minGas;
  uint256 maxPayment;
  uint256 pricePerGas;
  uint256 tip;
  uint64 deadline;
  uint64 createdAt;
  bytes32 salt;
}

/// @notice A staticcall whose return data must hash to `expectedHash` for the postcondition to hold.
struct Postcondition {
  address target;
  bytes data;
  bytes32 expectedHash;
}

/// @notice One call in an executor batch. Calldata is supplied by the relayer and is not part of the request.
struct RelayCall {
  bytes32 requestId;
  address target;
  bytes data;
  uint256 gasLimit;
  Postcondition post;
}

/// @notice Location of an L2-to-L1 message in the Outbox.
struct OutboxWitness {
  Epoch epoch;
  uint256 numCheckpointsInEpoch;
  uint256 leafIndex;
  bytes32[] path;
}

/// @notice Location of an execution receipt inside a relayer's batch.
struct ReceiptWitness {
  bytes32 receiptsRoot;
  uint256 gasLimit;
  uint256 gasUsed;
  uint256 leafIndex;
  bytes32[] path;
}

struct ClaimItem {
  RelayRequest request;
  OutboxWitness outbox;
  ReceiptWitness receipt;
}

library RelayLib {
  function requestId(RelayRequest memory _request) internal pure returns (bytes32) {
    return Hash.sha256ToField(abi.encode(_request));
  }

  function postconditionHash(Postcondition memory _post) internal pure returns (bytes32) {
    return keccak256(abi.encode(_post.target, keccak256(_post.data), _post.expectedHash));
  }

  /// @dev The spec binds the receipt to the request id, so one execution can only ever back one request.
  function spec(bytes32 _requestId, address _target, bytes32 _postconditionHash, uint256 _gasLimit)
    internal
    pure
    returns (bytes32)
  {
    return keccak256(abi.encode(_requestId, _target, _postconditionHash, _gasLimit));
  }

  function receiptLeaf(bytes32 _spec, uint256 _gasUsed) internal pure returns (bytes32) {
    return keccak256(abi.encode(_spec, _gasUsed));
  }

  function batchKey(address _relayer, bytes32 _receiptsRoot) internal pure returns (bytes32) {
    return keccak256(abi.encode(_relayer, _receiptsRoot));
  }

  /// @notice Keccak root over `_n` leaves, padded with zero leaves up to the next power of two. Overwrites `_leaves`.
  function merkleRoot(bytes32[] memory _leaves, uint256 _n) internal pure returns (bytes32) {
    uint256 width = 1;
    while (width < _n) {
      width <<= 1;
    }
    while (width > 1) {
      for (uint256 i = 0; i < width / 2; i++) {
        bytes32 l = 2 * i < _n ? _leaves[2 * i] : bytes32(0);
        bytes32 r = 2 * i + 1 < _n ? _leaves[2 * i + 1] : bytes32(0);
        _leaves[i] = keccak256(abi.encode(l, r));
      }
      _n = (_n + 1) / 2;
      width /= 2;
    }
    return _leaves[0];
  }

  function verify(bytes32 _leaf, uint256 _index, bytes32[] calldata _path, bytes32 _root) internal pure returns (bool) {
    bytes32 node = _leaf;
    for (uint256 i = 0; i < _path.length; i++) {
      node = (_index >> i) & 1 == 0 ? keccak256(abi.encode(node, _path[i])) : keccak256(abi.encode(_path[i], node));
    }
    return node == _root;
  }
}
