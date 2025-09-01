// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "./Errors.sol";

/**
 * @title SlashPayloadLib
 * @author Aztec Labs
 * @notice Library for encoding immutable arguments for SlashPayloadCloneable contracts
 * @dev Provides utilities for encoding validator addresses and amounts into a format
 *      suitable for use with EIP-1167 minimal proxy clones with immutable arguments
 */
library SlashPayloadLib {
  /**
   * @notice Encode immutable arguments for SlashPayloadCloneable clones
   * @dev Encodes data in the format expected by SlashPayloadCloneable._getImmutableArgs()
   *      Layout: [validatorSelection(20 bytes)][arrayLength(32 bytes)][validators+amounts array data]
   *      Each validator entry: [address(20 bytes)][amount(12 bytes for uint96)]
   * @param _validatorSelection Address of the validator selection contract
   * @param _validators Array of validator addresses to slash
   * @param _amounts Array of amounts to slash for each validator (uint96 values)
   * @return Encoded arguments for use with cloneDeterministicWithImmutableArgs
   */
  function encodeImmutableArgs(address _validatorSelection, address[] memory _validators, uint96[] memory _amounts)
    internal
    pure
    returns (bytes memory)
  {
    require(
      _validators.length == _amounts.length, Errors.SlashPayload_ArraySizeMismatch(_validators.length, _amounts.length)
    );

    // Calculate total size: 20 bytes (address) + 32 bytes (length) + (20 + 12) * length
    uint256 dataSize = 52 + 32 * _validators.length;
    bytes memory data = new bytes(dataSize);

    assembly {
      let ptr := add(data, 0x20)

      // Store validator selection address (20 bytes)
      // Shift left by 96 bits (12 bytes) to align to the left of the 32-byte slot
      mstore(ptr, shl(96, _validatorSelection))
      ptr := add(ptr, 0x14) // Move 20 bytes forward

      // Store array length (32 bytes)
      mstore(ptr, mload(_validators))
      ptr := add(ptr, 0x20) // Move 32 bytes forward

      // Store validators and amounts
      let len := mload(_validators)
      let validatorsPtr := add(_validators, 0x20)
      let amountsPtr := add(_amounts, 0x20)

      for { let i := 0 } lt(i, len) { i := add(i, 1) } {
        // Store validator address (20 bytes)
        // Shift left by 96 bits to align to the left of the 32-byte slot
        mstore(ptr, shl(96, mload(add(validatorsPtr, mul(i, 0x20)))))
        ptr := add(ptr, 0x14) // Move 20 bytes forward

        // Store amount (12 bytes for uint96)
        // Shift left by 160 bits (20 bytes) to align to the left of the remaining space
        mstore(ptr, shl(160, mload(add(amountsPtr, mul(i, 0x20)))))
        ptr := add(ptr, 0x0c) // Move 12 bytes forward
      }
    }

    return data;
  }
}
