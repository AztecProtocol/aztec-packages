// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

/**
 * @title Hash library
 * @author Aztec Labs
 * @notice Library that contains helper functions to compute hashes for data structures and convert to field elements
 * Using sha256 as the hash function since it hits a good balance between gas cost and circuit size.
 */
library Hash {
  /**
   * @notice Computes the sha256 hash of the L1 to L2 message and converts it to a field element
   * @param _message - The L1 to L2 message to hash
   * @return The hash of the provided message as a field element
   */
  function sha256ToField(DataStructures.L1ToL2Msg memory _message) internal pure returns (bytes32) {
    return sha256ToField(
      abi.encode(_message.sender, _message.recipient, _message.content, _message.secretHash, _message.index)
    );
  }

  /**
   * @notice Computes the sha256 hash of the L2 to L1 message and converts it to a field element
   * @param _message - The L2 to L1 message to hash
   * @return The hash of the provided message as a field element
   */
  function sha256ToField(DataStructures.L2ToL1Msg memory _message) internal pure returns (bytes32) {
    return sha256ToField(
      abi.encodePacked(
        _message.sender.actor,
        _message.sender.version,
        _message.recipient.actor,
        _message.recipient.chainId,
        _message.content
      )
    );
  }

  /**
   * @notice Computes the sha256 hash of the provided data and converts it to a field element
   * @dev Truncating one byte to convert the hash to a field element. We prepend a byte rather than cast
   * bytes31(bytes32) to match Noir's to_be_bytes.
   * @param _data - The bytes to hash
   * @return The hash of the provided data as a field element
   */
  function sha256ToField(bytes memory _data) internal pure returns (bytes32) {
    return bytes32(bytes.concat(new bytes(1), bytes31(sha256(_data))));
  }

  /**
   * @notice Advances the Inbox consensus rolling hash by one message leaf
   * @dev Each link is `sha256ToField(DOM_SEP__INBOX_ROLLING_HASH || rollingHash || leaf)` over the 4-byte big-endian
   * domain separator followed by the two 32-byte big-endian values. The separator keeps a chain link from being
   * reinterpreted as an untagged two-field sha256 hash, such as an `outHash` merkle node. Truncated at every link so
   * the value is always a field element; the rollup circuits recompute the identical chain over the message leaves
   * they insert. The genesis value is zero.
   * @param _rollingHash - The current rolling hash
   * @param _leaf - The message leaf to absorb
   * @return The updated rolling hash
   */
  function accumulateInboxRollingHash(bytes32 _rollingHash, bytes32 _leaf) internal pure returns (bytes32) {
    return sha256ToField(abi.encodePacked(uint32(Constants.DOM_SEP__INBOX_ROLLING_HASH), _rollingHash, _leaf));
  }
}
