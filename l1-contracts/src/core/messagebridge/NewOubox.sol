// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

// Libraries
import {DataStructures} from "../libraries/DataStructures.sol";
import {Errors} from "../libraries/Errors.sol";
import {Hash} from "../libraries/Hash.sol";
import {MessageBox} from "../libraries/MessageBox.sol";

/**
 * @title Outbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the rollup contract
 * and will be consumed by the portal contracts.
 */
contract Outbox {
  using Hash for DataStructures.L2ToL1Msg;

  event RootAdded(uint256 indexed l2BlockNumber, bytes32 indexed root, uint256 height);
  event MessageConsumed(uint256 indexed l2BlockNumber, bytes32 indexed root, bytes32 indexed messageHash);

  struct RootData {
    bytes32 root;
    uint256 height;
    mapping(uint256 => bool) nullified;
  }

  address public immutable STATE_TRANSITIONER;

  mapping(uint256 l2BlockNumber => RootData) public roots;

  constructor(address _stateTransitioner) {
    STATE_TRANSITIONER = _stateTransitioner;
  }

  function insert(uint256 _l2BlockNumber, bytes32 _root, uint256 _height) external {
    if (msg.sender != STATE_TRANSITIONER) {
      revert Errors.Outbox__Unauthorized();
    }

    if (roots[_l2BlockNumber].root != bytes32(0)) {
      revert Errors.Outbox__RootAlreadySet(_l2BlockNumber);
    }

    roots[_l2BlockNumber].root = _root;
    roots[_l2BlockNumber].height = _height;

    emit RootAdded(_l2BlockNumber, _root, _height);
  }

  function consume(
    uint256 _l2BlockNumber,
    uint256 _leafIndex,
    DataStructures.L2ToL1Msg memory _message,
    bytes32[] memory _path
  ) public {
    if (msg.sender != _message.recipient.actor) {
      revert Errors.Outbox__InvalidRecipient(_message.recipient.actor, msg.sender);
    }

    if (block.chainid != _message.recipient.chainId) {
      revert Errors.Outbox__InvalidChainId();
    }

    if (roots[_l2BlockNumber].nullified[_leafIndex]) {
      revert Errors.Outbox__AlreadyNullified(_l2BlockNumber, _leafIndex);
    }

    bytes32 root = roots[_l2BlockNumber].root;

    bytes32 messageHash = _verifyMembership(_path, _message, _leafIndex, root, roots[_l2BlockNumber].height);

    roots[_l2BlockNumber].nullified[_leafIndex] = true;

    emit MessageConsumed(_l2BlockNumber, root, messageHash);
  }

  function _verifyMembership(
    bytes32[] memory _path,
    DataStructures.L2ToL1Msg memory _message,
    uint256 _index,
    bytes32 _root,
    uint256 _height
  ) internal pure returns (bytes32) {
    if (_height != _path.length) {
      revert Errors.Outbox__InvalidPathLength(_height, _path.length);
    }

    bytes32 leaf = _message.sha256ToField();

    bytes32 root;
    uint256 index = _index;

    for (uint256 i = 0; i < _path.length; i++) {
      bool isRight = (index & 1) == 1;

      root = isRight
        ? sha256(bytes.concat(_path[i], i == 0 ? leaf : root))
        : sha256(bytes.concat(i == 0 ? leaf : root, _path[i]));

      index /= 2;
    }

    if (root != _root) {
      revert Errors.Outbox__InvalidRoot(_root, root);
    }

    return leaf;
  }
}
