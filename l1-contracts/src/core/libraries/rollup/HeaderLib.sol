// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";

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
 */
library HeaderLib {
  function hash(Header memory _header) internal pure returns (bytes32) {
    return Hash.sha256ToField(abi.encode(_header));
  }
}
