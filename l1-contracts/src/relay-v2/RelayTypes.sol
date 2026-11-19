// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

// Pre-defined precondition types. A request's type is its precondition type.
// NONE: no check.
// ERC20_BALANCE: params abi.encode(address token, address holder, uint256 minAmount). Holds if
//   `token.balanceOf(holder) >= minAmount`.
// OUTBOX_MESSAGE: params abi.encode(bytes32 messageHash), the Outbox leaf of the exit's own L2-to-L1 message. The
//   relayer supplies the witness abi.encode(Epoch epoch, uint256 numCheckpointsInEpoch, uint256 leafIndex,
//   bytes32[] path). Holds if the message is a member of that proven Outbox root. It is not consumed.
uint8 constant PRECONDITION_NONE = 0;
uint8 constant PRECONDITION_ERC20_BALANCE = 1;
uint8 constant PRECONDITION_OUTBOX_MESSAGE = 2;

/**
 * @notice A relay request, as emitted by the L2 relay ledger in an L2-to-L1 message. The message content is
 * `RelayLib.requestId(request)`. The full calldata prefix and precondition params travel in the L2 event; the
 * request commits to their hashes.
 */
struct RelayRequest {
  bytes32 app;
  address target;
  /// @dev RelayLib.preconditionHash(type, params).
  bytes32 preconditionHash;
  /// @dev keccak256 of the calldata prefix. The relayer may append a suffix.
  bytes32 prefixHash;
  uint256 gas;
  uint256 maxAztecPerGas;
  uint256 tip;
  uint64 deadline;
  uint64 createdAt;
  bytes32 salt;
}

/**
 * @notice A fast-proof request: pays `amount` AZTEC to the first prover of `checkpoint`, if claimed by `expiration`.
 * Emitted as its own L2-to-L1 message with content `RelayLib.proofRequestId(request)`.
 */
struct ProofRequest {
  bytes32 app;
  uint256 checkpoint;
  uint256 amount;
  uint64 expiration;
  bytes32 salt;
}

struct Precondition {
  uint8 kind;
  bytes params;
}

/// @notice One call in an executor batch. The target is called with `prefix ++ suffix`.
struct RelayCall {
  bytes32 requestId;
  address target;
  bytes prefix;
  bytes suffix;
  uint256 gasLimit;
  Precondition pre;
  /// @dev Relayer-supplied evidence for the precondition. Empty unless the type needs one.
  bytes witness;
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

struct ProofClaimItem {
  ProofRequest request;
  OutboxWitness outbox;
}

library RelayLib {
  bytes32 internal constant RELAY_REQUEST = keccak256("relay.request");
  bytes32 internal constant PROOF_REQUEST = keccak256("relay.proof_request");

  function requestId(RelayRequest memory _request) internal pure returns (bytes32) {
    return Hash.sha256ToField(abi.encode(RELAY_REQUEST, _request));
  }

  function proofRequestId(ProofRequest memory _request) internal pure returns (bytes32) {
    return Hash.sha256ToField(abi.encode(PROOF_REQUEST, _request));
  }

  function preconditionHash(uint8 _kind, bytes memory _params) internal pure returns (bytes32) {
    return keccak256(abi.encode(_kind, _params));
  }

  /// @dev The spec binds the receipt to the request id, the calldata prefix the executor ran and the precondition it
  /// checked, so the vault can tell the execution matched the request.
  function spec(bytes32 _requestId, address _target, bytes32 _prefixHash, bytes32 _preconditionHash, uint256 _gasLimit)
    internal
    pure
    returns (bytes32)
  {
    return keccak256(abi.encode(_requestId, _target, _prefixHash, _preconditionHash, _gasLimit));
  }

  function receiptLeaf(bytes32 _spec, uint256 _gasUsed) internal pure returns (bytes32) {
    return keccak256(abi.encode(_spec, _gasUsed));
  }

  function batchKey(address _relayer, bytes32 _receiptsRoot) internal pure returns (bytes32) {
    return keccak256(abi.encode(_relayer, _receiptsRoot));
  }

  /// @notice Packs a batch record into one slot: timestamp (64 bits), base fee (96 bits), ETH per AZTEC (96 bits).
  function packBatch(uint256 _time, uint256 _baseFee, uint256 _ethPerFeeAsset) internal pure returns (uint256) {
    require(_time < 1 << 64 && _baseFee < 1 << 96 && _ethPerFeeAsset < 1 << 96, "batch overflow");
    return _time | (_baseFee << 64) | (_ethPerFeeAsset << 160);
  }

  function unpackBatch(uint256 _packed) internal pure returns (uint256 time, uint256 baseFee, uint256 ethPerFeeAsset) {
    time = uint64(_packed);
    baseFee = uint96(_packed >> 64);
    ethPerFeeAsset = _packed >> 160;
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

  /// @notice Non-reverting copy of MerkleLib.verifyMembership (sha256-to-field tree used by the Outbox).
  function verifyOutbox(bytes32 _leaf, uint256 _index, bytes32[] memory _path, bytes32 _root)
    internal
    pure
    returns (bool)
  {
    bytes32 node = _leaf;
    uint256 index = _index;
    for (uint256 i = 0; i < _path.length; i++) {
      node = index & 1 == 1
        ? Hash.sha256ToField(bytes.concat(_path[i], node))
        : Hash.sha256ToField(bytes.concat(node, _path[i]));
      index >>= 1;
    }
    return index == 0 && node == _root;
  }
}
