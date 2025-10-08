// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

struct G1Point {
  uint256 x;
  uint256 y;
}

struct G2Point {
  uint256 x0;
  uint256 x1;
  uint256 y0;
  uint256 y1;
}

/**
 * Credit:
 * Primary inspiration from https://hackmd.io/7B4nfNShSY2Cjln-9ViQrA, which points out the
 * optimization of linking/using a G1 and G2 key and provides an implementation for
 * the hashToPoint and sqrt functions.
 */

/**
 * Library for registering public keys and computing BLS signatures over the BN254 curve.
 * The BN254 curve has been chosen over the BLS12-381 curve for gas efficiency, and
 * because the Aztec rollup's security is already reliant on BN254.
 */
library BN254Lib {
  /**
   * We use uint256[2] for G1 points and uint256[4] for G2 points.
   * For G1 points, the expected order is (x, y).
   * For G2 points, the expected order is (x_imaginary, x_real, y_imaginary, y_real)
   * Using structs would be more readable, but it would be more expensive to use them, particularly
   * when aggregating the public keys, since we need to convert to uint256[2] and uint256[4] anyway.
   */

  // See bn254_registration.test.ts and BLSKey.t.sol for tests which validate these constants.
  uint256 public constant BASE_FIELD_ORDER =
    21_888_242_871_839_275_222_246_405_745_257_275_088_696_311_157_297_823_662_689_037_894_645_226_208_583;

  uint256 public constant GROUP_ORDER =
    21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;

  bytes32 public constant STAKING_DOMAIN_SEPARATOR = bytes32("AZTEC_BLS_POP_BN254_V1");

  error AddPointFail();
  error MulPointFail();
  error GammaZero();
  error SqrtFail();
  error PairingFail();
  error NoPointFound();
  error InfinityNotAllowed();

  /**
   * @notice Prove possession of a secret for a point in G1 and G2.
   *
   * Ultimately, we want to check:
   * - That the caller knows the secret key of pk2 (to prevent rogue-key attacks)
   * - That pk1 and pk2 have the same secret key (as an optimization)
   *
   * Registering two public keys is an optimization: It means we can do G1-only operations
   * at the time of verifying a signature, which is much cheaper than G2 operations.
   *
   * In this function, we check:
   * e(signature + gamma * pk1, -G2) * e(hashToPoint(pk1) + gamma * G1, pk2) == 1
   *
   * Which is effectively a check that:
   * e(signature, G2) == e(hashToPoint(pk1), pk2) // a BLS signature over msg = pk1, to prove knowledge of the sk.
   * e(pk1, G2) == e(G1, pk2) // a demonstration that pk1 and pk2 have the same sk.
   *
   * @param pk1 The G1 point of the BLS public key (x, y coordinates)
   * @param pk2 The G2 point of the BLS public key (x_1, x_0, y_1, y_0 coordinates)
   * @param signature The G1 point that acts as a proof of possession of the private keys corresponding to pk1 and pk2
   */
  function proofOfPossession(G1Point memory pk1, G2Point memory pk2, G1Point memory signature)
    internal
    view
    returns (bool)
  {
    // Ensure that provided points are not infinity
    require(!isZero(pk1), InfinityNotAllowed());
    require(!isZero(pk2), InfinityNotAllowed());
    require(!isZero(signature), InfinityNotAllowed());

    // Compute the point "digest" of the pk1 that sigma is a signature over
    G1Point memory pk1DigestPoint = g1ToDigestPoint(pk1);

    // Random challenge:
    // gamma = keccak(pk1, pk2, signature) mod |Fr|
    uint256 gamma = gammaOf(pk1, pk2, signature);
    require(gamma != 0, GammaZero());

    // Build G1 L = signature + gamma * pk1
    G1Point memory left = g1Add(signature, g1Mul(pk1, gamma));

    // Build G1 R = pk1DigestPoint + gamma * G1
    G1Point memory right = g1Add(pk1DigestPoint, g1Mul(g1Generator(), gamma));

    // Pairing: e(L, -G2) * e(R, pk2) == 1
    return bn254Pairing(left, g2NegatedGenerator(), right, pk2);
  }

  /// @notice Convert a G1 point (public key) to the digest point that must be signed to prove possession.
  /// @dev exposed as public to allow clients not to have implemented the hashToPoint function.
  function g1ToDigestPoint(G1Point memory pk1) internal view returns (G1Point memory) {
    bytes memory pk1Bytes = abi.encodePacked(pk1.x, pk1.y);
    return hashToPoint(STAKING_DOMAIN_SEPARATOR, pk1Bytes);
  }

  /// @dev Add two points on BN254 G1 (affine coords).
  ///      Reverts if the inputs are not on‐curve.
  function g1Add(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory output) {
    uint256[4] memory input;
    input[0] = p1.x;
    input[1] = p1.y;
    input[2] = p2.x;
    input[3] = p2.y;

    bool success;
    assembly {
      // call(gas, to, value, in, insize, out, outsize)
      // STATICCALL is 40 gas vs 700 gas for CALL
      success :=
        staticcall(
          sub(gas(), 2000),
          0x06, // precompile address
          input,
          0x80, // input size = 4 × 32 bytes
          output,
          0x40 // output size = 2 × 32 bytes
        )
    }

    if (!success) revert AddPointFail();
    return output;
  }

  /// @dev Multiply a point by a scalar (little‑endian 256‑bit integer).
  ///      Reverts if the point is not on‐curve or the scalar ≥ p.
  function g1Mul(G1Point memory p, uint256 s) internal view returns (G1Point memory output) {
    uint256[3] memory input;
    input[0] = p.x;
    input[1] = p.y;
    input[2] = s;

    bool success;
    assembly {
      success :=
        staticcall(
          sub(gas(), 2000),
          0x07, // precompile address
          input,
          0x60, // input size = 3 × 32 bytes
          output,
          0x40 // output size = 2 × 32 bytes
        )
    }
    if (!success) revert MulPointFail();
    return output;
  }

  function bn254Pairing(G1Point memory g1a, G2Point memory g2a, G1Point memory g1b, G2Point memory g2b)
    internal
    view
    returns (bool)
  {
    uint256[12] memory input;

    input[0] = g1a.x;
    input[1] = g1a.y;
    input[2] = g2a.x1;
    input[3] = g2a.x0;
    input[4] = g2a.y1;
    input[5] = g2a.y0;

    input[6] = g1b.x;
    input[7] = g1b.y;
    input[8] = g2b.x1;
    input[9] = g2b.x0;
    input[10] = g2b.y1;
    input[11] = g2b.y0;

    uint256[1] memory result;
    bool didCallSucceed;
    assembly {
      didCallSucceed :=
        staticcall(
          sub(gas(), 2000),
          8,
          input,
          0x180, // input size = 12 * 32 bytes
          result,
          0x20 // output size = 32 bytes
        )
    }
    require(didCallSucceed, PairingFail());
    return result[0] == 1;
  }

  // The hash to point is based on the "mapToPoint" function in https://www.iacr.org/archive/asiacrypt2001/22480516.pdf
  function hashToPoint(bytes32 domain, bytes memory message) internal view returns (G1Point memory output) {
    bool found = false;
    uint256 attempts = 0;
    while (true) {
      uint256 x = uint256(keccak256(abi.encode(domain, message, attempts))) % BASE_FIELD_ORDER;
      attempts++;

      uint256 y = mulmod(x, x, BASE_FIELD_ORDER);
      y = mulmod(y, x, BASE_FIELD_ORDER);
      y = addmod(y, 3, BASE_FIELD_ORDER);
      (y, found) = sqrt(y);
      if (found) {
        uint256 y0 = y;
        uint256 y1 = BASE_FIELD_ORDER - y;

        // Ensure that y1 > y0, flip em if necessary
        if (y0 > y1) {
          (y0, y1) = (y1, y0);
        }

        uint256 b = uint256(keccak256(abi.encode(domain, message, attempts)));
        if (b & 1 == 0) {
          output = G1Point({x: x, y: y0});
        } else {
          output = G1Point({x: x, y: y1});
        }

        break;
      }
    }
    require(found, NoPointFound());
    return output;
  }

  function sqrt(uint256 xx) internal view returns (uint256 x, bool hasRoot) {
    bool callSuccess;
    assembly {
      let freeMem := mload(0x40)
      mstore(freeMem, 0x20)
      mstore(add(freeMem, 0x20), 0x20)
      mstore(add(freeMem, 0x40), 0x20)
      mstore(add(freeMem, 0x60), xx)
      // (N + 1) / 4 = 0xc19139cb84c680a6e14116da060561765e05aa45a1c72a34f082305b61f3f52
      mstore(add(freeMem, 0x80), 0xc19139cb84c680a6e14116da060561765e05aa45a1c72a34f082305b61f3f52)
      // N = BASE_FIELD_ORDER
      mstore(add(freeMem, 0xA0), BASE_FIELD_ORDER)
      callSuccess := staticcall(sub(gas(), 2000), 5, freeMem, 0xC0, freeMem, 0x20)
      x := mload(freeMem)
      hasRoot := eq(xx, mulmod(x, x, BASE_FIELD_ORDER))
    }
    require(callSuccess, SqrtFail());
  }

  /// @notice γ = keccak(PK1, PK2, σ_init) mod Fr
  function gammaOf(G1Point memory pk1, G2Point memory pk2, G1Point memory sigmaInit) internal pure returns (uint256) {
    return uint256(keccak256(abi.encode(pk1.x, pk1.y, pk2.x0, pk2.x1, pk2.y0, pk2.y1, sigmaInit.x, sigmaInit.y)))
      % GROUP_ORDER;
  }

  function g1Negate(G1Point memory p) internal pure returns (G1Point memory) {
    if (p.x == 0 && p.y == 0) {
      // Point at infinity remains unchanged
      return p;
    }

    // For a point (x, y), its negation is (x, -y mod p)
    // Since we're working in the field Fp, -y mod p = p - y
    return G1Point({x: p.x, y: BASE_FIELD_ORDER - p.y});
  }

  function g1Zero() internal pure returns (G1Point memory) {
    return G1Point({x: 0, y: 0});
  }

  function isZero(G1Point memory p) internal pure returns (bool) {
    return p.x == 0 && p.y == 0;
  }

  function g1Generator() internal pure returns (G1Point memory) {
    return G1Point({x: 1, y: 2});
  }

  function g2Zero() internal pure returns (G2Point memory) {
    return G2Point({x0: 0, x1: 0, y0: 0, y1: 0});
  }

  function isZero(G2Point memory p) internal pure returns (bool) {
    return p.x0 == 0 && p.x1 == 0 && p.y0 == 0 && p.y1 == 0;
  }

  function g2NegatedGenerator() internal pure returns (G2Point memory) {
    return G2Point({
      x0: 10_857_046_999_023_057_135_944_570_762_232_829_481_370_756_359_578_518_086_990_519_993_285_655_852_781,
      x1: 11_559_732_032_986_387_107_991_004_021_392_285_783_925_812_861_821_192_530_917_403_151_452_391_805_634,
      y0: 13_392_588_948_715_843_804_641_432_497_768_002_650_278_120_570_034_223_513_918_757_245_338_268_106_653,
      y1: 17_805_874_995_975_841_540_914_202_342_111_839_520_379_459_829_704_422_454_583_296_818_431_106_115_052
    });
  }
}
