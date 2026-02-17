// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {SafeCast} from "@oz/utils/math/SafeCast.sol";

struct ChainTips {
  uint256 pending;
  uint256 proven;
}

type CompressedChainTips is uint256;

library ChainTipsLib {
  using SafeCast for uint256;

  uint256 internal constant PENDING_CHECKPOINT_NUMBER_MASK =
    0xffffffffffffffffffffffffffffffff00000000000000000000000000000000;
  uint256 internal constant PROVEN_CHECKPOINT_NUMBER_MASK = 0xffffffffffffffffffffffffffffffff;

  function getPending(CompressedChainTips _compressedChainTips) internal pure returns (uint256) {
    return CompressedChainTips.unwrap(_compressedChainTips) >> 128;
  }

  function getProven(CompressedChainTips _compressedChainTips) internal pure returns (uint256) {
    return CompressedChainTips.unwrap(_compressedChainTips) & PROVEN_CHECKPOINT_NUMBER_MASK;
  }

  function updatePending(CompressedChainTips _compressedChainTips, uint256 _pendingCheckpointNumber)
    internal
    pure
    returns (CompressedChainTips)
  {
    uint256 value = CompressedChainTips.unwrap(_compressedChainTips) & ~PENDING_CHECKPOINT_NUMBER_MASK;
    return CompressedChainTips.wrap(value | (uint256(_pendingCheckpointNumber.toUint128()) << 128));
  }

  function updateProven(CompressedChainTips _compressedChainTips, uint256 _provenCheckpointNumber)
    internal
    pure
    returns (CompressedChainTips)
  {
    uint256 value = CompressedChainTips.unwrap(_compressedChainTips) & ~PROVEN_CHECKPOINT_NUMBER_MASK;
    return CompressedChainTips.wrap(value | _provenCheckpointNumber.toUint128());
  }

  function compress(ChainTips memory _chainTips) internal pure returns (CompressedChainTips) {
    // We are doing cast to uint128 but inside a uint256 to not wreck the shifting.
    uint256 pending = _chainTips.pending.toUint128();
    uint256 proven = _chainTips.proven.toUint128();
    return CompressedChainTips.wrap((pending << 128) | proven);
  }

  function decompress(CompressedChainTips _compressedChainTips) internal pure returns (ChainTips memory) {
    return ChainTips({pending: getPending(_compressedChainTips), proven: getProven(_compressedChainTips)});
  }
}
