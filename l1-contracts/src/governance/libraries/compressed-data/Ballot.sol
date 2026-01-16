// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {SafeCast} from "@oz/utils/math/SafeCast.sol";

struct Ballot {
  uint256 yea;
  uint256 nay;
}

type CompressedBallot is uint256;

library BallotLib {
  using SafeCast for uint256;

  uint256 internal constant YEA_MASK = 0xffffffffffffffffffffffffffffffff00000000000000000000000000000000;
  uint256 internal constant NAY_MASK = 0xffffffffffffffffffffffffffffffff;

  function getYea(CompressedBallot _compressedBallot) internal pure returns (uint256) {
    return CompressedBallot.unwrap(_compressedBallot) >> 128;
  }

  function getNay(CompressedBallot _compressedBallot) internal pure returns (uint256) {
    return CompressedBallot.unwrap(_compressedBallot) & NAY_MASK;
  }

  function updateYea(CompressedBallot _compressedBallot, uint256 _yea) internal pure returns (CompressedBallot) {
    uint256 value = CompressedBallot.unwrap(_compressedBallot) & ~YEA_MASK;
    return CompressedBallot.wrap(value | (_yea << 128));
  }

  function updateNay(CompressedBallot _compressedBallot, uint256 _nay) internal pure returns (CompressedBallot) {
    uint256 value = CompressedBallot.unwrap(_compressedBallot) & ~NAY_MASK;
    return CompressedBallot.wrap(value | _nay);
  }

  function addYea(CompressedBallot _compressedBallot, uint256 _amount) internal pure returns (CompressedBallot) {
    uint256 currentYea = getYea(_compressedBallot);
    uint256 newYea = currentYea + _amount;
    return updateYea(_compressedBallot, newYea.toUint128());
  }

  function addNay(CompressedBallot _compressedBallot, uint256 _amount) internal pure returns (CompressedBallot) {
    uint256 currentNay = getNay(_compressedBallot);
    uint256 newNay = currentNay + _amount;
    return updateNay(_compressedBallot, newNay.toUint128());
  }

  function compress(Ballot memory _ballot) internal pure returns (CompressedBallot) {
    // We are doing cast to uint128 but inside a uint256 to not wreck the shifting.
    uint256 yea = _ballot.yea.toUint128();
    uint256 nay = _ballot.nay.toUint128();
    return CompressedBallot.wrap((yea << 128) | nay);
  }

  function decompress(CompressedBallot _compressedBallot) internal pure returns (Ballot memory) {
    return Ballot({yea: getYea(_compressedBallot), nay: getNay(_compressedBallot)});
  }
}
