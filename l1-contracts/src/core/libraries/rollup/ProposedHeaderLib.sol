// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";

import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

struct AppendOnlyTreeSnapshot {
  bytes32 root;
  uint32 nextAvailableLeafIndex;
}

struct PartialStateReference {
  AppendOnlyTreeSnapshot noteHashTree;
  AppendOnlyTreeSnapshot nullifierTree;
  AppendOnlyTreeSnapshot publicDataTree;
}

struct StateReference {
  AppendOnlyTreeSnapshot l1ToL2MessageTree;
  // Note: Can't use "partial" name here as in protocol specs because it is a reserved solidity keyword
  PartialStateReference partialStateReference;
}

struct GasFees {
  uint128 feePerDaGas;
  uint128 feePerL2Gas;
}

struct ContentCommitment {
  bytes32 blobsHash;
  bytes32 inHash;
  bytes32 outHash;
}

struct ProposedHeader {
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
 * @title ProposedHeader Library
 * @author Aztec Labs
 * @notice Decoding and validating a proposed L2 block header
 */
library ProposedHeaderLib {
  using SafeCast for uint256;

  /**
   * @notice  Hash the proposed header
   *
   * @dev     The hashing here MUST match what is in the proposed_block_header.ts
   *
   * @param _header The header to hash
   *
   * @return The hash of the header
   */
  function hash(ProposedHeader memory _header) internal pure returns (bytes32) {
    return Hash.sha256ToField(
      abi.encodePacked(
        _header.lastArchiveRoot,
        _header.contentCommitment.blobsHash,
        _header.contentCommitment.inHash,
        _header.contentCommitment.outHash,
        _header.slotNumber,
        Timestamp.unwrap(_header.timestamp).toUint64(),
        _header.coinbase,
        _header.feeRecipient,
        _header.gasFees.feePerDaGas,
        _header.gasFees.feePerL2Gas,
        _header.totalManaUsed
      )
    );
  }
}
