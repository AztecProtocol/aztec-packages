// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

// Inspiration: https://gist.github.com/kobigurk/257c1783ddf556e330f31ed57febc1d9
// Helpers taken from: https://github.com/thehubbleproject/hubble-contracts/blob/master/contracts/libs/BLS.sol

import {ModexpInverse, ModexpSqrt} from "./ModExp.sol";

library BLS {
  uint256 public constant FIELD_SIZE =
    21888242871839275222246405745257275088696311157297823662689037894645226208583;

  uint256 public constant CURVE_ORDER =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

  // G1 Generator
  uint256 public constant G1_X = 1;
  uint256 public constant G1_Y = 2;

  // Negated generator of G2
  uint256 public constant NEG_G2_X1 =
    11559732032986387107991004021392285783925812861821192530917403151452391805634;
  uint256 public constant NEG_G2_X0 =
    10857046999023057135944570762232829481370756359578518086990519993285655852781;
  uint256 public constant NEG_G2_Y1 =
    17805874995975841540914202342111839520379459829704422454583296818431106115052;
  uint256 public constant NEG_G2_Y0 =
    13392588948715843804641432497768002650278120570034223513918757245338268106653;

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
   * @notice Register a BLS signature key for the caller.
   *      Each unique key can only be registered once across all validators.
   *
   * @param pk1 The G1 point of the BLS public key (x, y coordinates)
   * @param pk2 The G2 point of the BLS public key (x1, x0, y1, y0 coordinates)
   * @param signature The G1 point that acts as a proof of possession of the private keys corresponding to pk1 and pk2
   */
  function proofOfPossession(
    uint256[2] memory pk1,
    uint256[4] memory pk2,
    uint256[2] memory signature
  ) internal view returns (bool) {
    require(pk1[0] != 0 && pk1[1] != 0, pk1Zero());
    require(pk2[0] != 0 && pk2[1] != 0 && pk2[2] != 0 && pk2[3] != 0, pk2Zero());
    require(signature[0] != 0 && signature[1] != 0, signatureZero());

    // Compute the point "digest" of the pk1 that sigma is a signature over
    bytes memory pk1Bytes = abi.encodePacked(pk1[0], pk1[1]);
    uint256[2] memory pk1DigestPoint = hashToPoint(STAKING_DOMAIN_SEPARATOR, pk1Bytes);

    // gamma = keccak(pk1, pk2, signature) mod |Fr|
    uint256 gamma = gammaOf(pk1, pk2, signature);
    require(gamma != 0, gammaZero());

    // Build G1 L = signature + gamma * pk1
    uint256[2] memory l = ecAdd(signature, ecMul(pk1, gamma));

    // Build G1 R = pk1DigestPoint + gamma * G1
    uint256[2] memory g1 = [G1_X, G1_Y];
    uint256[2] memory r = ecAdd(pk1DigestPoint, ecMul(g1, gamma));

    // Pairing: e(L, -G2) * e(R, pk2) == 1
    uint256[4] memory nG2 = [NEG_G2_X1, NEG_G2_X0, NEG_G2_Y1, NEG_G2_Y0];
    return bn254Pairing(l, nG2, r, pk2);
  }

  /// @dev Add two points on BN254 G1 (affine coords).
  ///      Reverts if the inputs are not on‐curve.
  function ecAdd(uint256[2] memory p1, uint256[2] memory p2)
    internal
    view
    returns (uint256[2] memory r)
  {
    uint256[4] memory input;
    input[0] = p1[0]; // x₁
    input[1] = p1[1]; // y₁
    input[2] = p2[0]; // x₂
    input[3] = p2[1]; // y₂

    bool success;
    assembly {
      // call(gas, to, value, in, insize, out, outsize)
      // STATICCALL is 40 gas vs 700 gas for CALL
      success :=
        staticcall(
          sub(gas(), 2000),
          0x06, // precompile address
          input,
          0x80, // 4 × 32 bytes
          r,
          0x40 // 2 × 32 bytes
        )
    }
    require(success, addPointFail());
  }

  /// @dev Multiply a point by a scalar (little‑endian 256‑bit integer).
  ///      Reverts if the point is not on‐curve or the scalar ≥ p.
  function ecMul(uint256[2] memory p, uint256 s) internal view returns (uint256[2] memory r) {
    uint256[3] memory input;
    input[0] = p[0]; // x
    input[1] = p[1]; // y
    input[2] = s; // scalar

    bool success;
    assembly {
      success :=
        staticcall(
          sub(gas(), 2000),
          0x07, // precompile address
          input,
          0x60, // 3 × 32 bytes
          r,
          0x40 // 2 × 32 bytes
        )
    }
    require(success, mulPointFail());
  }

  function bn254Pairing(
    uint256[2] memory l, // G1
    uint256[4] memory g2a, // G2  (x1,x0,y1,y0 order for precompile!)
    uint256[2] memory r, // G1
    uint256[4] memory g2b // G2
  ) internal view returns (bool ok) {
    uint256[12] memory input;

    input[0] = l[0]; // L.x
    input[1] = l[1]; // L.y
    input[2] = g2a[0]; // G2a.x1
    input[3] = g2a[1]; // G2a.x0
    input[4] = g2a[2]; // G2a.y1
    input[5] = g2a[3]; // G2a.y0

    input[6] = r[0]; // R.x
    input[7] = r[1]; // R.y
    input[8] = g2b[0]; // G2b.x1
    input[9] = g2b[1]; // G2b.x0
    input[10] = g2b[2]; // G2b.y1
    input[11] = g2b[3]; // G2b.y0

    uint256[1] memory out;
    bool success;
    assembly {
      // staticcall(gas, 0x08, input, 0x180 (12*32), out, 0x20)
      success := staticcall(sub(gas(), 2000), 8, input, 0x180, out, 0x20)
    }
    require(success, pairingFail());
    ok = (out[0] == 1);
  }

  /**
   * @notice Fouque-Tibouchi Hash to Curve
   */
  function hashToPoint(bytes32 domain, bytes memory message)
    internal
    view
    returns (uint256[2] memory)
  {
    uint256[2] memory u = hashToField(domain, message);
    uint256[2] memory p0 = mapToPoint(u[0]);
    uint256[2] memory p1 = mapToPoint(u[1]);

    return ecAdd(p0, p1);
  }

  function mapToPoint(uint256 _x) internal pure returns (uint256[2] memory p) {
    require(_x < FIELD_SIZE, valueOutOfRange(_x, 0, FIELD_SIZE));
    uint256 x = _x;

    (, bool decision) = sqrt(x);

    uint256 a0 = mulmod(x, x, FIELD_SIZE);
    a0 = addmod(a0, 4, FIELD_SIZE);
    uint256 a1 = mulmod(x, Z0, FIELD_SIZE);
    uint256 a2 = mulmod(a1, a0, FIELD_SIZE);
    a2 = inverse(a2);
    a1 = mulmod(a1, a1, FIELD_SIZE);
    a1 = mulmod(a1, a2, FIELD_SIZE);

    // x1
    a1 = mulmod(x, a1, FIELD_SIZE);
    x = addmod(Z1, FIELD_SIZE - a1, FIELD_SIZE);
    // check curve
    a1 = mulmod(x, x, FIELD_SIZE);
    a1 = mulmod(a1, x, FIELD_SIZE);
    a1 = addmod(a1, 3, FIELD_SIZE);
    bool found;
    (a1, found) = sqrt(a1);
    if (found) {
      if (!decision) {
        a1 = FIELD_SIZE - a1;
      }
      return [x, a1];
    }

    // x2
    x = FIELD_SIZE - addmod(x, 1, FIELD_SIZE);
    // check curve
    a1 = mulmod(x, x, FIELD_SIZE);
    a1 = mulmod(a1, x, FIELD_SIZE);
    a1 = addmod(a1, 3, FIELD_SIZE);
    (a1, found) = sqrt(a1);
    if (found) {
      if (!decision) {
        a1 = FIELD_SIZE - a1;
      }
      return [x, a1];
    }

    // x3
    x = mulmod(a0, a0, FIELD_SIZE);
    x = mulmod(x, x, FIELD_SIZE);
    x = mulmod(x, a2, FIELD_SIZE);
    x = mulmod(x, a2, FIELD_SIZE);
    x = addmod(x, 1, FIELD_SIZE);
    // must be on curve
    a1 = mulmod(x, x, FIELD_SIZE);
    a1 = mulmod(a1, x, FIELD_SIZE);
    a1 = addmod(a1, 3, FIELD_SIZE);
    (a1, found) = sqrt(a1);
    require(found, noPointFound());
    if (!decision) {
      a1 = FIELD_SIZE - a1;
    }
    return [x, a1];
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
      a0 := addmod(mulmod(u1, T24, FIELD_SIZE), u0, FIELD_SIZE)
      p := add(_msg, 72)
      u1 := and(mload(p), MASK24)
      p := add(_msg, 96)
      u0 := and(mload(p), MASK24)
      a1 := addmod(mulmod(u1, T24, FIELD_SIZE), u0, FIELD_SIZE)
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
    hasRoot = mulmod(x, x, FIELD_SIZE) == xx;
  }

  function inverse(uint256 a) internal pure returns (uint256) {
    return ModexpInverse.run(a);
  }

  /// @notice γ = keccak(PK1, PK2, σ_init) mod Fr
  function gammaOf(uint256[2] memory pk1, uint256[4] memory pk2, uint256[2] memory sigmaInit)
    internal
    pure
    returns (uint256)
  {
    return uint256(keccak256(abi.encodePacked(pk1, pk2, sigmaInit))) % CURVE_ORDER;
  }
}
