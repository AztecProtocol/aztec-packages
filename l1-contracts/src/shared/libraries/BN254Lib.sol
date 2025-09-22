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
 * because the Aztec rollup's security is already reliant on BN254Lib
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

  // sqrt(-3)
  uint256 private constant Z0 = 0x0000000000000000b3c4d79d41a91759a9e4c7e359b6b89eaec68e62effffffd;
  // (sqrt(-3) - 1)  / 2
  uint256 private constant Z1 = 0x000000000000000059e26bcea0d48bacd4f263f1acdb5c4f5763473177fffffe;
  uint256 private constant T24 = 0x1000000000000000000000000000000000000000000000000;
  uint256 private constant MASK24 = 0xffffffffffffffffffffffffffffffffffffffffffffffff;

  error NotOnCurve(uint256 x, uint256 y);
  error NotOnCurveG2(uint256 x0, uint256 x1, uint256 y0, uint256 y1);
  error AddPointFail();
  error MulPointFail();
  error GammaZero();
  error InverseFail();
  error SqrtFail();
  error PairingFail();
  error NoPointFound();

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
    require(isOnCurveG1(pk1), NotOnCurve(pk1.x, pk1.y));
    require(isOnCurveG2(pk2), NotOnCurveG2(pk2.x0, pk2.x1, pk2.y0, pk2.y1));
    require(isOnCurveG1(signature), NotOnCurve(signature.x, signature.y));

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

  function hashToPoint(bytes32 domain, bytes memory message) internal view returns (G1Point memory output) {
    bytes32 hashed = keccak256(abi.encode(domain, message));
    uint256 x = uint256(hashed) % BASE_FIELD_ORDER;
    uint256 y;
    bool found = false;
    while (true) {
      y = mulmod(x, x, BASE_FIELD_ORDER);
      y = mulmod(y, x, BASE_FIELD_ORDER);
      y = addmod(y, 3, BASE_FIELD_ORDER);
      (y, found) = sqrt(y);
      if (found) {
        output = G1Point({x: x, y: y});
        break;
      }
      x = addmod(x, 1, BASE_FIELD_ORDER);
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

  function inverse(uint256 a) internal view returns (uint256 result) {
    bool success;
    assembly {
      let freeMem := mload(0x40)
      mstore(freeMem, 0x20)
      mstore(add(freeMem, 0x20), 0x20)
      mstore(add(freeMem, 0x40), 0x20)
      mstore(add(freeMem, 0x60), a)
      mstore(add(freeMem, 0x80), sub(BASE_FIELD_ORDER, 2))
      mstore(add(freeMem, 0xa0), BASE_FIELD_ORDER)
      success := staticcall(gas(), 0x05, freeMem, 0xc0, freeMem, 0x20)
      result := mload(freeMem)
    }
    if (!success) revert InverseFail();
  }

  function isOnCurveG1(G1Point memory point) internal pure returns (bool _isOnCurve) {
    assembly {
      let t0 := mload(point)
      let t1 := mload(add(point, 32))
      let t2 := mulmod(t0, t0, BASE_FIELD_ORDER)
      t2 := mulmod(t2, t0, BASE_FIELD_ORDER)
      t2 := addmod(t2, 3, BASE_FIELD_ORDER)
      t1 := mulmod(t1, t1, BASE_FIELD_ORDER)
      _isOnCurve := eq(t1, t2)
    }
  }

  function isOnCurveG2(G2Point memory point) internal pure returns (bool _isOnCurve) {
    assembly {
      // Load x-coordinate from memory where x = x0 + x1*u
      let x0 := mload(point) // First component of x in Fp2
      let x1 := mload(add(point, 32)) // Second component of x in Fp2

      // Compute x0^2 (mod p)
      let x0_squared := mulmod(x0, x0, BASE_FIELD_ORDER)

      // Compute x1^2 (mod p)
      let x1_squared := mulmod(x1, x1, BASE_FIELD_ORDER)

      // Compute 3*x0^2 (mod p) - needed for x^3 calculation
      // Note: we compute 3*a as a + a + a to avoid multiplication by constant
      let three_x0_squared := add(add(x0_squared, x0_squared), x0_squared)

      // Compute 3*x1^2 (mod p) - needed for x^3 calculation
      let three_x1_squared := addmod(add(x1_squared, x1_squared), x1_squared, BASE_FIELD_ORDER)

      // Compute x^3 where x = x0 + x1*u
      // x^3 = (x0 + x1*u)^3 = x0^3 + 3*x0^2*x1*u + 3*x0*x1^2*u^2 + x1^3*u^3
      // Since u^2 = -1, we have u^3 = -u, so:
      // x^3 = x0^3 + 3*x0^2*x1*u - 3*x0*x1^2 - x1^3*u
      // x^3 = (x0^3 - 3*x0*x1^2) + (3*x0^2*x1 - x1^3)*u

      // Real component of x^3: x0^3 - 3*x0*x1^2 = x0*(x0^2 - 3*x1^2)
      let x_cubed_real := mulmod(add(x0_squared, sub(BASE_FIELD_ORDER, three_x1_squared)), x0, BASE_FIELD_ORDER)

      // Imaginary component of x^3: 3*x0^2*x1 - x1^3 = x1*(3*x0^2 - x1^2)
      let x_cubed_imag := mulmod(add(three_x0_squared, sub(BASE_FIELD_ORDER, x1_squared)), x1, BASE_FIELD_ORDER)

      // Add the curve parameter b = b0 + b1*u to get x^3 + b
      // For BN254 G2: b0 = 0x2b149d40ceb8aaae81be18991be06ac3b5b4c5e559dbefa33267e6dc24a138e5
      //               b1 = 0x009713b03af0fed4cd2cafadeed8fdf4a74fa084e52d1852e4a2bd0685c315d2
      let rhs_real :=
        addmod(x_cubed_real, 0x2b149d40ceb8aaae81be18991be06ac3b5b4c5e559dbefa33267e6dc24a138e5, BASE_FIELD_ORDER)
      let rhs_imag :=
        addmod(x_cubed_imag, 0x009713b03af0fed4cd2cafadeed8fdf4a74fa084e52d1852e4a2bd0685c315d2, BASE_FIELD_ORDER)

      // Load y-coordinate from memory where y = y0 + y1*u
      let y0 := mload(add(point, 64)) // First component of y in Fp2
      let y1 := mload(add(point, 96)) // Second component of y in Fp2

      // Compute y^2 where y = y0 + y1*u
      // y^2 = (y0 + y1*u)^2 = y0^2 + 2*y0*y1*u + y1^2*u^2
      // Since u^2 = -1:
      // y^2 = (y0^2 - y1^2) + 2*y0*y1*u

      // Real component of y^2: y0^2 - y1^2 = (y0 + y1)*(y0 - y1)
      let y_squared_real :=
        mulmod(
          addmod(y0, y1, BASE_FIELD_ORDER), // (y0 + y1)
          addmod(y0, sub(BASE_FIELD_ORDER, y1), BASE_FIELD_ORDER), // (y0 - y1)
          BASE_FIELD_ORDER
        )

      // Imaginary component of y^2: 2*y0*y1
      let y_squared_imag := mulmod(shl(1, y0), y1, BASE_FIELD_ORDER) // shl(1, y0) = 2*y0

      // Check if the curve equation holds: y^2 = x^3 + b
      // This requires both components to be equal
      _isOnCurve := and(eq(rhs_real, y_squared_real), eq(rhs_imag, y_squared_imag))
    }
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

  function g1Generator() internal pure returns (G1Point memory) {
    return G1Point({x: 1, y: 2});
  }

  function g2Zero() internal pure returns (G2Point memory) {
    return G2Point({x0: 0, x1: 0, y0: 0, y1: 0});
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
