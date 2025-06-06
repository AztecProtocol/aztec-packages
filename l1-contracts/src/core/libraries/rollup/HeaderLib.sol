// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";

struct GasFees {
  uint128 feePerDaGas;
  uint128 feePerL2Gas;
}

struct ContentCommitment {
  uint256 numTxs;
  bytes32 blobsHash;
  bytes32 inHash;
  bytes32 outHash;
}

struct Header {
  bytes32 lastArchiveRoot;
  ContentCommitment contentCommitment;
  Slot slotNumber;
  Timestamp timestamp;
  address coinbase;
  bytes32 feeRecipient;
  GasFees gasFees;
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
 *  | 0x0000                                                                           | 0x20         | lastArchiveRoot
 *  |                                                                                  |              | ContentCommitment {
 *  | 0x0020                                                                           | 0x20         |   numTxs
 *  | 0x0040                                                                           | 0x20         |   blobsHash
 *  | 0x0060                                                                           | 0x20         |   inHash
 *  | 0x0080                                                                           | 0x20         |   outHash
 *  |                                                                                  |              | }
 *  | 0x00a0                                                                           | 0x20         | slotNumber
 *  | 0x00c0                                                                           | 0x08         | timestamp
 *  | 0x00c8                                                                           | 0x14         | coinbase
 *  | 0x00dc                                                                           | 0x20         | feeRecipient
 *  | 0x00fc                                                                           | 0x10         | gasFees.feePerDaGas
 *  | 0x010c                                                                           | 0x10         | gasFees.feePerL2Gas
 *  | 0x011c                                                                           | 0x20         | totalManaUsed
 *  | ---                                                                              | ---          | ---
 */
library HeaderLib {
  uint256 private constant HEADER_LENGTH = Constants.PROPOSED_BLOCK_HEADER_LENGTH_BYTES; // Header byte length

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
    header.lastArchiveRoot = bytes32(_header[0x0000:0x0020]);

    // Reading ContentCommitment
    header.contentCommitment.numTxs = uint256(bytes32(_header[0x0020:0x0040]));
    header.contentCommitment.blobsHash = bytes32(_header[0x0040:0x0060]);
    header.contentCommitment.inHash = bytes32(_header[0x0060:0x0080]);
    header.contentCommitment.outHash = bytes32(_header[0x0080:0x00a0]);

    // Reading partial GlobalVariables
    header.slotNumber = Slot.wrap(uint256(bytes32(_header[0x00a0:0x00c0])));
    header.timestamp = Timestamp.wrap(uint256(uint64(bytes8(_header[0x00c0:0x00c8]))));
    header.coinbase = address(bytes20(_header[0x00c8:0x00dc]));
    header.feeRecipient = bytes32(_header[0x00dc:0x00fc]);
    header.gasFees.feePerDaGas = uint128(bytes16(_header[0x00fc:0x010c]));
    header.gasFees.feePerL2Gas = uint128(bytes16(_header[0x010c:0x011c]));

    // Reading totalManaUsed
    header.totalManaUsed = uint256(bytes32(_header[0x011c:0x013c]));

    return header;
  }

  function hash(bytes memory _header) internal pure returns (bytes32) {
    return Hash.sha256ToField(_header);
  }
}
