// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

// Libraries
import {Constants} from "../ConstantsGen.sol";
import {Hash} from "../Hash.sol";

/**
 * @title Messages Decoder Library
 * @author Aztec Labs
 * @notice Decoding a L2 block body and returns cross-chain messages + (in/out)Hash.
 * Concerned with readability and velocity of development not giving a damn about gas costs.
 * @dev Assumes the input trees to be padded.
 *
 * -------------------
 * You can use https://gist.github.com/LHerskind/724a7e362c97e8ac2902c6b961d36830 to generate the below outline.
 * -------------------
 * L2 Body Data Specification
 * -------------------
 *  | byte start                                                                                | num bytes  | name
 *  | ---                                                                                       | ---        | ---
 *  | 0x0                                                                                       | 0x4        | len(numTxs) (denoted t)
 *  |                                                                                           |            | TxEffect 0 {
 *  | 0x4                                                                                       | 0x1        |   len(newNoteHashes) (denoted b)
 *  | 0x4 + 0x1                                                                                 | b * 0x20   |   newNoteHashes
 *  | 0x4 + 0x1 + b * 0x20                                                                      | 0x1        |   len(newNullifiers) (denoted c)
 *  | 0x4 + 0x1 + b * 0x20 + 0x1                                                                | c * 0x20   |   newNullifiers
 *  | 0x4 + 0x1 + b * 0x20 + 0x1 + c * 0x20                                                     | 0x1        |   len(newL2ToL1Msgs) (denoted d)
 *  | 0x4 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1                                               | d * 0x20   |   newL2ToL1Msgs
 *  | 0x4 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20                                    | 0x1        |   len(newPublicDataWrites) (denoted e)
 *  | 0x4 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01                             | e * 0x40   |   newPublicDataWrites
 *  | 0x4 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01 + e * 0x40                  | 0x04       |   byteLen(newEncryptedLogs) (denoted f)
 *  | 0x4 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01 + e * 0x40 + 0x4            | f          |   newEncryptedLogs
 *  | 0x4 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01 + e * 0x40 + 0x4 + f        | 0x04       |   byteLen(newUnencryptedLogs) (denoted g)
 *  | 0x4 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01 + e * 0x40 + 0x4 + f + 0x4  | g          |   newUnencryptedLogs
 *  |                                                                                           |            | },
 *  |                                                                                           |            | TxEffect 1 {
 *  |                                                                                           |            |   ...
 *  |                                                                                           |            | },
 *  |                                                                                           |            | ...
 *  |                                                                                           |            | TxEffect (t - 1) {
 *  |                                                                                           |            |   ...
 *  |                                                                                           |            | },
 */
library MessagesDecoder {
  /**
   * @notice Computes consumables for the block
   * @param _body - The L2 block calldata.
   * @return outHash - The hash of the L1 to L2 messages
   * @return l2ToL1Msgs - The L2 to L1 messages of the block
   */
  function decode(bytes calldata _body)
    internal
    pure
    returns (bytes32 outHash, bytes32[] memory l2ToL1Msgs)
  {
    uint256 offset = 0;
    uint256 numTxs = read4(_body, offset);
    offset += 0x4;

    l2ToL1Msgs = new bytes32[](numTxs * Constants.MAX_NEW_L2_TO_L1_MSGS_PER_TX);

    // Now we iterate over the tx effects
    for (uint256 i = 0; i < numTxs; i++) {
      // revertCode
      offset += 0x1;

      // Note hashes
      uint256 count = read1(_body, offset);
      offset += 0x1;
      offset += count * 0x20; // each note hash is 0x20 bytes long

      // Nullifiers
      count = read1(_body, offset);
      offset += 0x1;
      offset += count * 0x20; // each nullifier is 0x20 bytes long

      // L2 to L1 messages
      {
        count = read1(_body, offset);
        offset += 0x1;

        uint256 msgsLength = count * 0x20; // each l2 to l1 message is 0x20 bytes long

        // Now we copy the new messages into the array (if there are some)
        if (count > 0) {
          uint256 indexInArray = i * Constants.MAX_NEW_L2_TO_L1_MSGS_PER_TX;
          assembly {
            calldatacopy(
              add(add(l2ToL1Msgs, 0x20), mul(indexInArray, 0x20)),
              add(_body.offset, offset),
              msgsLength
            )
          }
        }

        offset += msgsLength;
      }

      // Public data writes
      count = read1(_body, offset);
      offset += 0x1;
      offset += count * 0x40; // each public data write is 0x40 bytes long

      // Encrypted logs
      uint256 length = read4(_body, offset);
      offset += 0x4 + length;

      // Unencrypted logs
      length = read4(_body, offset);
      offset += 0x4 + length;
    }

    outHash = sha256(abi.encodePacked(l2ToL1Msgs));

    return (outHash, l2ToL1Msgs);
  }

  /**
   * @notice Reads 1 bytes from the data
   * @param _data - The data to read from
   * @param _offset - The offset to read from
   * @return The 1 byte as a uint256
   */
  function read1(bytes calldata _data, uint256 _offset) internal pure returns (uint256) {
    return uint256(uint8(bytes1(_data[_offset:_offset + 1])));
  }

  /**
   * @notice Reads 4 bytes from the data
   * @param _data - The data to read from
   * @param _offset - The offset to read from
   * @return The 4 bytes read as a uint256
   */
  function read4(bytes calldata _data, uint256 _offset) internal pure returns (uint256) {
    return uint256(uint32(bytes4(_data[_offset:_offset + 4])));
  }
}
