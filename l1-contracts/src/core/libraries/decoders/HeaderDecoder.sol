// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

// Libraries
import {Constants} from "../ConstantsGen.sol";
import {Hash} from "../Hash.sol";

/**
 * @title Header Decoder Library
 * @author Aztec Labs
 * @notice Decoding a L2 header
 * Concerned with readability and velocity of development not giving a damn about gas costs.
 *
 * -------------------
 * You can use https://gist.github.com/LHerskind/724a7e362c97e8ac2902c6b961d36830 to generate the below outline.
 * -------------------
 * L2 Block Header specification
 * -------------------
 *
 *  | byte start                                                                       | num bytes    | name
 *  | ---                                                                              | ---          | ---
 *  |                                                                                  |              | Header {
 *  |                                                                                  |              |   GlobalVariables {
 *  | 0x0000                                                                           | 0x20         |     chainId
 *  | 0x0020                                                                           | 0x20         |     version
 *  | 0x0040                                                                           | 0x20         |     blockNumber
 *  | 0x0060                                                                           | 0x20         |     timestamp
 *  |                                                                                  |              |   }
 *  |                                                                                  |              |   StateReference {
 *  | 0x0080                                                                           | 0x20         |     l1ToL2MessageTree.root
 *  | 0x00a0                                                                           | 0x04         |     l1ToL2MessageTree.nextAvailableLeafIndex
 *  |                                                                                  |              |     PartialStateReference {
 *  | 0x00a4                                                                           | 0x20         |       noteHashTree.root
 *  | 0x00c4                                                                           | 0x04         |       noteHashTree.nextAvailableLeafIndex
 *  | 0x00c8                                                                           | 0x20         |       nullifierTree.root
 *  | 0x00e8                                                                           | 0x04         |       nullifierTree.nextAvailableLeafIndex
 *  | 0x00ec                                                                           | 0x20         |       contractTree.root
 *  | 0x010c                                                                           | 0x04         |       contractTree.nextAvailableLeafIndex
 *  | 0x0110                                                                           | 0x20         |       publicDataTree.root
 *  | 0x0130                                                                           | 0x04         |       publicDataTree.nextAvailableLeafIndex
 *  |                                                                                  |              |     }
 *  |                                                                                  |              |   }
 *  | 0x0134                                                                           | 0x20         |   lastArchive.root
 *  | 0x0154                                                                           | 0x04         |   lastArchive.nextAvailableLeafIndex
 *  | 0x0158                                                                           | 0x20         |   bodyHash
 *  |                                                                                  |              | }
 *  | ---                                                                              | ---          | ---
 */
library HeaderDecoder {
  // TODO: This is only partial
  struct Header {
    uint256 chainId;
    uint256 version;
    uint256 blockNumber;
    uint256 timestamp;
    bytes32 lastArchive;
  }

  /**
   * @notice Decodes the header
   * @param _header - The header calldata.
   */
  function decode(bytes calldata _header) internal pure returns (Header memory) {
    Header memory header;

    header.chainId = uint256(bytes32(_header[:0x20]));
    header.version = uint256(bytes32(_header[0x20:0x40]));
    header.blockNumber = uint256(bytes32(_header[0x40:0x60]));
    header.timestamp = uint256(bytes32(_header[0x60:0x80]));

    // The rest is needed only by verifier and hence not decoded here.

    header.lastArchive = bytes32(_header[0x134:0x154]);

    return header;
  }
}
