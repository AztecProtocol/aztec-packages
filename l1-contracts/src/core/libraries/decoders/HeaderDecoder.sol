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
  struct GlobalVariables {
    uint256 chainId;
    uint256 version;
    uint256 blockNumber;
    uint256 timestamp;
  }

  struct PartialStateReference {
    bytes32 noteHashTreeRoot;
    uint32 noteHashTreeNextAvailableLeafIndex;
    bytes32 nullifierTreeRoot;
    uint32 nullifierTreeNextAvailableLeafIndex;
    bytes32 contractTreeRoot;
    uint32 contractTreeNextAvailableLeafIndex;
    bytes32 publicDataTreeRoot;
    uint32 publicDataTreeNextAvailableLeafIndex;
  }

  struct StateReference {
    bytes32 l1ToL2MessageTreeRoot;
    uint32 l1ToL2MessageTreeNextAvailableLeafIndex;
    // Note: Can't use "partial" name here as in yellow paper because it is a reserved solidity keyword
    PartialStateReference partialStateReference;
  }

  struct Header {
    GlobalVariables globalVariables;
    StateReference stateReference;
    bytes32 lastArchiveRoot;
    uint32 lastArchiveNextAvailableLeafIndex;
    bytes32 bodyHash;
  }

  /**
   * @notice Decodes the header
   * @param _header - The header calldata.
   */
  function decode(bytes calldata _header) internal pure returns (Header memory) {
    require(_header.length == 376, "Invalid header length");

    Header memory header;

    header.globalVariables.chainId = uint256(bytes32(_header[:0x20]));
    header.globalVariables.version = uint256(bytes32(_header[0x20:0x40]));
    header.globalVariables.blockNumber = uint256(bytes32(_header[0x40:0x60]));
    header.globalVariables.timestamp = uint256(bytes32(_header[0x60:0x80]));
    header.stateReference.l1ToL2MessageTreeRoot = bytes32(_header[0x80:0xa0]);
    header.stateReference.l1ToL2MessageTreeNextAvailableLeafIndex =
      uint32(bytes4(_header[0xa0:0xa4]));
    header.stateReference.partialStateReference.noteHashTreeRoot = bytes32(_header[0xa4:0xc4]);
    header.stateReference.partialStateReference.noteHashTreeNextAvailableLeafIndex =
      uint32(bytes4(_header[0xc4:0xc8]));
    header.stateReference.partialStateReference.nullifierTreeRoot = bytes32(_header[0xc8:0xe8]);
    header.stateReference.partialStateReference.nullifierTreeNextAvailableLeafIndex =
      uint32(bytes4(_header[0xe8:0xec]));
    header.stateReference.partialStateReference.contractTreeRoot = bytes32(_header[0xec:0x10c]);
    header.stateReference.partialStateReference.contractTreeNextAvailableLeafIndex =
      uint32(bytes4(_header[0x10c:0x110]));
    header.stateReference.partialStateReference.publicDataTreeRoot = bytes32(_header[0x110:0x130]);
    header.stateReference.partialStateReference.publicDataTreeNextAvailableLeafIndex =
      uint32(bytes4(_header[0x130:0x134]));
    header.lastArchiveRoot = bytes32(_header[0x134:0x154]);
    header.lastArchiveNextAvailableLeafIndex = uint32(bytes4(_header[0x154:0x158]));
    header.bodyHash = bytes32(_header[0x158:0x178]);

    return header;
  }
}
