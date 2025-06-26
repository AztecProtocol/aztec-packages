// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {SafeCast} from "@oz/utils/math/SafeCast.sol";

struct ChainTips {
  uint256 pendingBlockNumber;
  uint256 provenBlockNumber;
}

type CompressedChainTips is uint256;

library ChainTipsLib {
  using SafeCast for uint256;

  uint256 internal constant PENDING_BLOCK_NUMBER_MASK =
    0xffffffffffffffffffffffffffffffff00000000000000000000000000000000;
  uint256 internal constant PROVEN_BLOCK_NUMBER_MASK = 0xffffffffffffffffffffffffffffffff;

  function getPendingBlockNumber(CompressedChainTips _compressedChainTips)
    internal
    pure
    returns (uint256)
  {
    return CompressedChainTips.unwrap(_compressedChainTips) >> 128;
  }

  function getProvenBlockNumber(CompressedChainTips _compressedChainTips)
    internal
    pure
    returns (uint256)
  {
    return CompressedChainTips.unwrap(_compressedChainTips) & PROVEN_BLOCK_NUMBER_MASK;
  }

  function updatePendingBlockNumber(
    CompressedChainTips _compressedChainTips,
    uint256 _pendingBlockNumber
  ) internal pure returns (CompressedChainTips) {
    uint256 value = CompressedChainTips.unwrap(_compressedChainTips) & ~PENDING_BLOCK_NUMBER_MASK;
    return CompressedChainTips.wrap(value | (_pendingBlockNumber << 128));
  }

  function updateProvenBlockNumber(
    CompressedChainTips _compressedChainTips,
    uint256 _provenBlockNumber
  ) internal pure returns (CompressedChainTips) {
    uint256 value = CompressedChainTips.unwrap(_compressedChainTips) & ~PROVEN_BLOCK_NUMBER_MASK;
    return CompressedChainTips.wrap(value | _provenBlockNumber);
  }

  function compress(ChainTips memory _chainTips) internal pure returns (CompressedChainTips) {
    // We are doing cast to uint128 but inside a uint256 to not wreck the shifting.
    uint256 pending = _chainTips.pendingBlockNumber.toUint128();
    uint256 proven = _chainTips.provenBlockNumber.toUint128();
    return CompressedChainTips.wrap((pending << 128) | proven);
  }

  function decompress(CompressedChainTips _compressedChainTips)
    internal
    pure
    returns (ChainTips memory)
  {
    return ChainTips({
      pendingBlockNumber: getPendingBlockNumber(_compressedChainTips),
      provenBlockNumber: getProvenBlockNumber(_compressedChainTips)
    });
  }
}
