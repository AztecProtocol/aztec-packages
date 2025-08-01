// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * Credit:
 * Primary inspiration from https://hackmd.io/7B4nfNShSY2Cjln-9ViQrA, which points out the
 * optimization of linking/using a G1 and G2 key.
 *
 * The hashToPoint function, and the helpers it calls are modified from
 * https://github.com/thehubbleproject/hubble-contracts/blob/master/contracts/libs/BLS.sol
 */
import {ModexpInverse, ModexpSqrt} from "./ModExp.sol";

/**
 * Library for registering public keys and computing BLS signatures over the BN254 curve.
 * The BN254 curve has been chosen over the BLS12-381 curve for gas efficiency, and
 * because the Aztec rollup's security is already reliant on BN254.
 */
library BN254 {
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
   * We use uint256[2] for G1 points and uint256[4] for G2 points.
   * For G1 points, the expected order is (x, y).
   * For G2 points, the expected order is (x_imaginary, x_real, y_imaginary, y_real)
   * Using structs would be more readable, but it would be more expensive to use them, particularly
   * when aggregating the public keys, since we need to convert to uint256[2] and uint256[4] anyway.
   */

  // See bn254_registration.test.ts and BLSKey.t.sol for tests which validate these constants.
  uint256 public constant BASE_FIELD_SIZE =
    21888242871839275222246405745257275088696311157297823662689037894645226208583;

  uint256 public constant CURVE_ORDER =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

  bytes32 public constant STAKING_DOMAIN_SEPARATOR = bytes32("AZTEC_BLS_POP_BN254_FT_V1");

  // sqrt(-3)
  uint256 private constant Z0 = 0x0000000000000000b3c4d79d41a91759a9e4c7e359b6b89eaec68e62effffffd;
  // (sqrt(-3) - 1)  / 2
  uint256 private constant Z1 = 0x000000000000000059e26bcea0d48bacd4f263f1acdb5c4f5763473177fffffe;
  uint256 private constant T24 = 0x1000000000000000000000000000000000000000000000000;
  uint256 private constant MASK24 = 0xffffffffffffffffffffffffffffffffffffffffffffffff;

  error pk1Zero();
  error pk2Zero();
  error signatureZero();
  error addPointFail();
  error mulPointFail();
  error gammaZero();
  error pairingFail();
  error valueOutOfRange(uint256 value, uint256 min, uint256 max);
  error noPointFound();

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
   * @param pk2 The G2 point of the BLS public key (x_imaginary, x_real, y_imaginary, y_real coordinates)
   * @param signature The G1 point that acts as a proof of possession of the private keys corresponding to pk1 and pk2
   */
  function proofOfPossession(G1Point memory pk1, G2Point memory pk2, G1Point memory signature)
    internal
    view
    returns (bool)
  {
    require(pk1.x != 0 && pk1.y != 0, pk1Zero());
    require(pk2.x0 != 0 && pk2.x1 != 0 && pk2.y0 != 0 && pk2.y1 != 0, pk2Zero());
    require(signature.x != 0 && signature.y != 0, signatureZero());

    // Compute the point "digest" of the pk1 that sigma is a signature over
    bytes memory pk1Bytes = abi.encodePacked(pk1.x, pk1.y);
    G1Point memory pk1DigestPoint = hashToPoint(STAKING_DOMAIN_SEPARATOR, pk1Bytes);

    // Random challenge:
    // gamma = keccak(pk1, pk2, signature) mod |Fr|
    uint256 gamma = gammaOf(pk1, pk2, signature);
    require(gamma != 0, gammaZero());

    // Build G1 L = signature + gamma * pk1
    G1Point memory left = g1Add(signature, g1Mul(pk1, gamma));

    // Build G1 R = pk1DigestPoint + gamma * G1
    G1Point memory right = g1Add(pk1DigestPoint, g1Mul(g1Generator(), gamma));

    // Pairing: e(L, -G2) * e(R, pk2) == 1
    return bn254Pairing(left, g2NegatedGenerator(), right, pk2);
  }

  /// @dev Add two points on BN254 G1 (affine coords).
  ///      Reverts if the inputs are not on‐curve.
  function g1Add(G1Point memory p1, G1Point memory p2)
    internal
    view
    returns (G1Point memory output)
  {
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

    if (!success) revert addPointFail();
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
    if (!success) revert mulPointFail();
    return output;
  }

  function bn254Pairing(
    G1Point memory g1a,
    G2Point memory g2a,
    G1Point memory g1b,
    G2Point memory g2b
  ) internal view returns (bool) {
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
    require(didCallSucceed, pairingFail());
    return result[0] == 1;
  }

  /**
   * @notice Fouque-Tibouchi Hash to Curve
   */
  function hashToPoint(bytes32 domain, bytes memory message)
    internal
    view
    returns (G1Point memory output)
  {
    uint256[2] memory u = hashToField(domain, message);
    G1Point memory p0 = mapToPoint(u[0]);
    G1Point memory p1 = mapToPoint(u[1]);

    return g1Add(p0, p1);
  }

  function mapToPoint(uint256 _x) internal pure returns (G1Point memory output) {
    require(_x < BASE_FIELD_SIZE, valueOutOfRange(_x, 0, BASE_FIELD_SIZE));
    uint256 x = _x;

    (, bool decision) = sqrt(x);

    uint256 a0 = mulmod(x, x, BASE_FIELD_SIZE);
    a0 = addmod(a0, 4, BASE_FIELD_SIZE);
    uint256 a1 = mulmod(x, Z0, BASE_FIELD_SIZE);
    uint256 a2 = mulmod(a1, a0, BASE_FIELD_SIZE);
    a2 = inverse(a2);
    a1 = mulmod(a1, a1, BASE_FIELD_SIZE);
    a1 = mulmod(a1, a2, BASE_FIELD_SIZE);

    // x1
    a1 = mulmod(x, a1, BASE_FIELD_SIZE);
    x = addmod(Z1, BASE_FIELD_SIZE - a1, BASE_FIELD_SIZE);
    // check curve
    a1 = mulmod(x, x, BASE_FIELD_SIZE);
    a1 = mulmod(a1, x, BASE_FIELD_SIZE);
    a1 = addmod(a1, 3, BASE_FIELD_SIZE);
    bool found;
    (a1, found) = sqrt(a1);
    if (found) {
      if (!decision) {
        a1 = BASE_FIELD_SIZE - a1;
      }
      return G1Point({x: x, y: a1});
    }

    // x2
    x = BASE_FIELD_SIZE - addmod(x, 1, BASE_FIELD_SIZE);
    // check curve
    a1 = mulmod(x, x, BASE_FIELD_SIZE);
    a1 = mulmod(a1, x, BASE_FIELD_SIZE);
    a1 = addmod(a1, 3, BASE_FIELD_SIZE);
    (a1, found) = sqrt(a1);
    if (found) {
      if (!decision) {
        a1 = BASE_FIELD_SIZE - a1;
      }
      return G1Point({x: x, y: a1});
    }

    // x3
    x = mulmod(a0, a0, BASE_FIELD_SIZE);
    x = mulmod(x, x, BASE_FIELD_SIZE);
    x = mulmod(x, a2, BASE_FIELD_SIZE);
    x = mulmod(x, a2, BASE_FIELD_SIZE);
    x = addmod(x, 1, BASE_FIELD_SIZE);
    // must be on curve
    a1 = mulmod(x, x, BASE_FIELD_SIZE);
    a1 = mulmod(a1, x, BASE_FIELD_SIZE);
    a1 = addmod(a1, 3, BASE_FIELD_SIZE);
    (a1, found) = sqrt(a1);
    require(found, noPointFound());
    if (!decision) {
      a1 = BASE_FIELD_SIZE - a1;
    }
    return G1Point({x: x, y: a1});
  }

  function hashToField(bytes32 domain, bytes memory messages)
    internal
    pure
    returns (uint256[2] memory)
  {
    bytes memory _msg = expandMsgTo96(domain, messages);
    uint256 u0;
    uint256 u1;
    uint256 a0;
    uint256 a1;
    assembly {
      let p := add(_msg, 24)
      u1 := and(mload(p), MASK24)
      p := add(_msg, 48)
      u0 := and(mload(p), MASK24)
      a0 := addmod(mulmod(u1, T24, BASE_FIELD_SIZE), u0, BASE_FIELD_SIZE)
      p := add(_msg, 72)
      u1 := and(mload(p), MASK24)
      p := add(_msg, 96)
      u0 := and(mload(p), MASK24)
      a1 := addmod(mulmod(u1, T24, BASE_FIELD_SIZE), u0, BASE_FIELD_SIZE)
    }
    return [a0, a1];
  }

  function expandMsgTo96(bytes32 domain, bytes memory message) internal pure returns (bytes memory) {
    // zero<64>|msg<var>|lib_str<2>|I2OSP(0, 1)<1>|dst<var>|dst_len<1>
    uint256 t0 = message.length;
    bytes memory msg0 = new bytes(32 + t0 + 64 + 4);
    bytes memory out = new bytes(96);
    // b0
    assembly {
      let p := add(msg0, 96)
      for { let z := 0 } lt(z, t0) { z := add(z, 32) } {
        mstore(add(p, z), mload(add(message, add(z, 32))))
      }
      p := add(p, t0)

      mstore8(p, 0)
      p := add(p, 1)
      mstore8(p, 96)
      p := add(p, 1)
      mstore8(p, 0)
      p := add(p, 1)

      mstore(p, domain)
      p := add(p, 32)
      mstore8(p, 32)
    }
    bytes32 b0 = sha256(msg0);
    bytes32 bi;
    t0 = 32 + 34;

    // resize intermediate message
    assembly {
      mstore(msg0, t0)
    }

    // b1

    assembly {
      mstore(add(msg0, 32), b0)
      mstore8(add(msg0, 64), 1)
      mstore(add(msg0, 65), domain)
      mstore8(add(msg0, add(32, 65)), 32)
    }

    bi = sha256(msg0);

    assembly {
      mstore(add(out, 32), bi)
    }

    // b2

    assembly {
      let t := xor(b0, bi)
      mstore(add(msg0, 32), t)
      mstore8(add(msg0, 64), 2)
      mstore(add(msg0, 65), domain)
      mstore8(add(msg0, add(32, 65)), 32)
    }

    bi = sha256(msg0);

    assembly {
      mstore(add(out, 64), bi)
    }

    // b3

    assembly {
      let t := xor(b0, bi)
      mstore(add(msg0, 32), t)
      mstore8(add(msg0, 64), 3)
      mstore(add(msg0, 65), domain)
      mstore8(add(msg0, add(32, 65)), 32)
    }

    bi = sha256(msg0);

    assembly {
      mstore(add(out, 96), bi)
    }

    return out;
  }

  function sqrt(uint256 xx) internal pure returns (uint256 x, bool hasRoot) {
    x = ModexpSqrt.run(xx);
    hasRoot = mulmod(x, x, BASE_FIELD_SIZE) == xx;
  }

  function inverse(uint256 a) internal pure returns (uint256) {
    return ModexpInverse.run(a);
  }

  /// @notice γ = keccak(PK1, PK2, σ_init) mod Fr
  function gammaOf(G1Point memory pk1, G2Point memory pk2, G1Point memory sigmaInit)
    internal
    pure
    returns (uint256)
  {
    // QUESTION: Is this uniformly-random enough, or do we need to compute 512-bits of randomness
    // (by concatenating two domain-separated hashes) and then compute the modulo `% CURVE_ORDER`?

    return uint256(
      keccak256(
        abi.encodePacked(pk1.x, pk1.y, pk2.x0, pk2.x1, pk2.y0, pk2.y1, sigmaInit.x, sigmaInit.y)
      )
    ) % CURVE_ORDER;
  }

  function g1Negate(G1Point memory p) internal pure returns (G1Point memory) {
    if (p.x == 0 && p.y == 0) {
      // Point at infinity remains unchanged
      return p;
    }

    // For a point (x, y), its negation is (x, -y mod p)
    // Since we're working in the field Fp, -y mod p = p - y
    return G1Point({x: p.x, y: BASE_FIELD_SIZE - p.y});
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
      x0: 10857046999023057135944570762232829481370756359578518086990519993285655852781,
      x1: 11559732032986387107991004021392285783925812861821192530917403151452391805634,
      y0: 13392588948715843804641432497768002650278120570034223513918757245338268106653,
      y1: 17805874995975841540914202342111839520379459829704422454583296818431106115052
    });
  }
}
