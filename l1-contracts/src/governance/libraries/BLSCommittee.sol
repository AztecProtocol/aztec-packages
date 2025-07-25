// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

// todo: emit g2 points as events
struct Validator {
  uint256 x1;
  uint256 y1;
  uint256 x20;
  uint256 x21;
  uint256 y20;
  uint256 y21;
  bool active;
}

// struct Committee {
//   Validator[48]      slots;            // the 48 public keys
//   mapping(address => uint8) slotOf;      // addr → slot+1  (0 = none)
//   uint48               activeMask;       // 1‑bit per slot, 48 LSBs used
// }

library BLSCommittee {
  uint8 internal constant SIZE = 48; // #committee slots
  uint48 internal constant MASK = type(uint48).max; // 0xffffffffffff

  /// @dev count trailing zeros: CTZ(x), 0‑based, x ≠ 0
  function _ctz(uint48 x) internal pure returns (uint8) {
    unchecked {
      // isolate LS1b inside 48‑bit field, then log2
      uint48 ls1b = x & (~x + 1); // NOTE: 48‑bit twos‑comp
      return _log2(ls1b);
    }
  }

  /// @dev log2 for a power‑of‑two 48‑bit word
  function _log2(uint48 x) private pure returns (uint8 y) {
    while (x > 1) {
      x >>= 1;
      ++y;
    }
  }

  function findFreeSlot(uint48 activeMask) internal pure returns (uint8) {
    uint48 free = ~activeMask; // Invert to find free slots
    require(free != 0, "committee full");
    return _ctz(free); // 0 … 47
  }

  function setBit(uint48 m, uint8 slot) internal pure returns (uint48) {
    return m | (uint48(1) << slot);
  }

  function clearBit(uint48 m, uint8 slot) internal pure returns (uint48) {
    return m & ~(uint48(1) << slot);
  }

  /// Packs the low 48 bits into exactly 6 bytes (little‑endian)
  function toBytes6(uint48 m) internal pure returns (bytes6 out) {
    // abi.encodePacked produces little‑endian for integers
    return bytes6(abi.encodePacked(m));
  }

  function popcount(uint48 m) internal pure returns (uint256 c) {
    for (; m != 0; m >>= 1) { c += m & 1; }
  }

  // function getCommittee(bytes32 epochSeed) public view returns (uint32[48] memory ids) {
  //       uint32 live = uint32(liveIds.length);
  //       require(live >= 48, "need >=48 active validators");

  //       // in‑memory bitmap: 1 bit per live index
  //       // size = ceil(live / 256) words
  //       uint256 words = (live + 255) >> 8;            // /256
  //       uint256[] memory used = new uint256[](words);

  //       uint8 filled = 0;
  //       uint256 nonce = 0;                            // bumps on collision

  //       while (filled < 48) {
  //           uint256 rnd = uint256(
  //               keccak256(abi.encodePacked(epochSeed, filled, nonce))
  //           );
  //           uint32 idx = uint32(rnd % live);          // index in liveIds[]

  //           // Check bitmap
  //           uint256 word = idx >> 8;                  // /256
  //           uint256 bit  = 1 << (idx & 255);          // %256
  //           if (used[word] & bit != 0) {              // duplicate → retry
  //               ++nonce;
  //               continue;
  //           }
  //           used[word] |= bit;                        // mark taken

  //           ids[filled] = liveIds[idx];
  //           ++filled;
  //       }
  //   }
}
