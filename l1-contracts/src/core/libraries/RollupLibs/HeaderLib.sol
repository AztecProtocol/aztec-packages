// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

struct AppendOnlyTreeSnapshot {
  bytes32 root;
  uint32 nextAvailableLeafIndex;
}

struct PartialStateReference {
  AppendOnlyTreeSnapshot noteHashTree;
  AppendOnlyTreeSnapshot nullifierTree;
  AppendOnlyTreeSnapshot contractTree;
  AppendOnlyTreeSnapshot publicDataTree;
}

struct StateReference {
  AppendOnlyTreeSnapshot l1ToL2MessageTree;
  // Note: Can't use "partial" name here as in protocol specs because it is a reserved solidity keyword
  PartialStateReference partialStateReference;
}

struct GasFees {
  uint256 feePerDaGas;
  uint256 feePerL2Gas;
}

struct GlobalVariables {
  uint256 chainId;
  uint256 version;
  uint256 blockNumber;
  uint256 slotNumber;
  uint256 timestamp;
  address coinbase;
  bytes32 feeRecipient;
  GasFees gasFees;
}

struct ContentCommitment {
  uint256 numTxs;
  bytes32 blobsHash;
  bytes32 inHash;
  bytes32 outHash;
}

struct Header {
  AppendOnlyTreeSnapshot lastArchive;
  ContentCommitment contentCommitment;
  StateReference stateReference;
  GlobalVariables globalVariables;
  uint256 totalFees;
  uint256 totalManaUsed;
}

/**
 * @title Header Library
 * @author Aztec Labs
 * @notice Decoding and validating an L2 block header
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
 *  | 0x0000                                                                           | 0x20         |   lastArchive.root
 *  | 0x0020                                                                           | 0x04         |   lastArchive.nextAvailableLeafIndex
 *  |                                                                                  |              |   ContentCommitment {
 *  | 0x0024                                                                           | 0x20         |     numTxs
 *  | 0x0044                                                                           | 0x20         |     blobsHash
 *  | 0x0064                                                                           | 0x20         |     inHash
 *  | 0x0084                                                                           | 0x20         |     outHash
 *  |                                                                                  |              |   StateReference {
 *  | 0x00a4                                                                           | 0x20         |     l1ToL2MessageTree.root
 *  | 0x00c4                                                                           | 0x04         |     l1ToL2MessageTree.nextAvailableLeafIndex
 *  |                                                                                  |              |     PartialStateReference {
 *  | 0x00c8                                                                           | 0x20         |       noteHashTree.root
 *  | 0x00e8                                                                           | 0x04         |       noteHashTree.nextAvailableLeafIndex
 *  | 0x00ec                                                                           | 0x20         |       nullifierTree.root
 *  | 0x010c                                                                           | 0x04         |       nullifierTree.nextAvailableLeafIndex
 *  | 0x0110                                                                           | 0x20         |       publicDataTree.root
 *  | 0x0130                                                                           | 0x04         |       publicDataTree.nextAvailableLeafIndex
 *  |                                                                                  |              |     }
 *  |                                                                                  |              |   }
 *  |                                                                                  |              |   GlobalVariables {
 *  | 0x0134                                                                           | 0x20         |     chainId
 *  | 0x0154                                                                           | 0x20         |     version
 *  | 0x0174                                                                           | 0x20         |     blockNumber
 *  | 0x0194                                                                           | 0x20         |     slotNumber
 *  | 0x01b4                                                                           | 0x20         |     timestamp
 *  | 0x01d4                                                                           | 0x14         |     coinbase
 *  | 0x01e8                                                                           | 0x20         |     feeRecipient
 *  | 0x0208                                                                           | 0x20         |     gasFees.feePerDaGas
 *  | 0x0228                                                                           | 0x20         |     gasFees.feePerL2Gas
 *  |                                                                                  |              |   }
 *  |                                                                                  |              | }
 *  | 0x0248                                                                           | 0x20         | total_fees
 *  | 0x0268                                                                           | 0x20         | total_mana_used
 *  | ---                                                                              | ---          | ---
 */
library HeaderLib {
  uint256 private constant HEADER_LENGTH = Constants.BLOCK_HEADER_LENGTH_BYTES; // Header byte length

  /**
   * @notice Decodes the header
   * @param _header - The header calldata
   * @return The decoded header
   */
  function decode(bytes calldata _header) internal pure returns (Header memory) {
    require(
      _header.length == HEADER_LENGTH,
      Errors.HeaderLib__InvalidHeaderSize(HEADER_LENGTH, _header.length)
    );

    Header memory header;

    // Reading lastArchive
    header.lastArchive = AppendOnlyTreeSnapshot(
      bytes32(_header[0x0000:0x0020]), uint32(bytes4(_header[0x0020:0x0024]))
    );

    // Reading ContentCommitment
    header.contentCommitment.numTxs = uint256(bytes32(_header[0x0024:0x0044]));
    header.contentCommitment.blobsHash = bytes32(_header[0x0044:0x0064]);
    header.contentCommitment.inHash = bytes32(_header[0x0064:0x0084]);
    header.contentCommitment.outHash = bytes32(_header[0x0084:0x00a4]);

    // Reading StateReference
    header.stateReference.l1ToL2MessageTree = AppendOnlyTreeSnapshot(
      bytes32(_header[0x00a4:0x00c4]), uint32(bytes4(_header[0x00c4:0x00c8]))
    );
    header.stateReference.partialStateReference.noteHashTree = AppendOnlyTreeSnapshot(
      bytes32(_header[0x00c8:0x00e8]), uint32(bytes4(_header[0x00e8:0x00ec]))
    );
    header.stateReference.partialStateReference.nullifierTree = AppendOnlyTreeSnapshot(
      bytes32(_header[0x00ec:0x010c]), uint32(bytes4(_header[0x010c:0x0110]))
    );
    header.stateReference.partialStateReference.publicDataTree = AppendOnlyTreeSnapshot(
      bytes32(_header[0x0110:0x0130]), uint32(bytes4(_header[0x0130:0x0134]))
    );

    // Reading GlobalVariables
    header.globalVariables.chainId = uint256(bytes32(_header[0x0134:0x0154]));
    header.globalVariables.version = uint256(bytes32(_header[0x0154:0x0174]));
    header.globalVariables.blockNumber = uint256(bytes32(_header[0x0174:0x0194]));
    header.globalVariables.slotNumber = uint256(bytes32(_header[0x0194:0x01b4]));
    header.globalVariables.timestamp = uint256(bytes32(_header[0x01b4:0x01d4]));
    header.globalVariables.coinbase = address(bytes20(_header[0x01d4:0x01e8]));
    header.globalVariables.feeRecipient = bytes32(_header[0x01e8:0x0208]);
    header.globalVariables.gasFees.feePerDaGas = uint256(bytes32(_header[0x0208:0x0228]));
    header.globalVariables.gasFees.feePerL2Gas = uint256(bytes32(_header[0x0228:0x0248]));

    // Reading totalFees
    header.totalFees = uint256(bytes32(_header[0x0248:0x0268]));

    // Reading totalManaUsed
    header.totalManaUsed = uint256(bytes32(_header[0x0268:0x0288]));

    return header;
  }
}
