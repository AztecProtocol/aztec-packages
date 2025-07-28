// SPDX-License-Identifier: MIT or Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

// Code taken and updated from https://gist.github.com/kobigurk/257c1783ddf556e330f31ed57febc1d9
// Add: hashToPoint, mapToPoint, hashtofield, constants, and helpers taken from
// https://github.com/thehubbleproject/hubble-contracts/blob/master/contracts/libs/BLS.sol
// Add: G1 Generator
// Add: create gamma function of keccak reduced over field order
// Add: Thin wrapper for pairing check

import {ModexpInverse, ModexpSqrt} from "./ModExp.sol";

library BLS {
  // Scalar Field Order
  uint256 private constant N =
    21888242871839275222246405745257275088696311157297823662689037894645226208583;

  // G1 Generator
  uint256 public constant G1x = 1;
  uint256 public constant G1y = 2;

  // Negated genarator of G2
  uint256 public constant nG2x1 =
    11559732032986387107991004021392285783925812861821192530917403151452391805634;
  uint256 public constant nG2x0 =
    10857046999023057135944570762232829481370756359578518086990519993285655852781;
  uint256 public constant nG2y1 =
    17805874995975841540914202342111839520379459829704422454583296818431106115052;
  uint256 public constant nG2y0 =
    13392588948715843804641432497768002650278120570034223513918757245338268106653;

  uint256 private constant FIELD_MASK =
    0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
  uint256 private constant SIGN_MASK =
    0x8000000000000000000000000000000000000000000000000000000000000000;
  uint256 private constant ODD_NUM =
    0x8000000000000000000000000000000000000000000000000000000000000000;

  // sqrt(-3)
  uint256 private constant Z0 = 0x0000000000000000b3c4d79d41a91759a9e4c7e359b6b89eaec68e62effffffd;
  // (sqrt(-3) - 1)  / 2
  uint256 private constant Z1 = 0x000000000000000059e26bcea0d48bacd4f263f1acdb5c4f5763473177fffffe;

  uint256 private constant T24 = 0x1000000000000000000000000000000000000000000000000;
  uint256 private constant MASK24 = 0xffffffffffffffffffffffffffffffffffffffffffffffff;

  // GOV-INIT-BN254-SHA256-SSWU-V1\x00\x00\x00 (padded to 32 bytes)
  bytes32 public constant DST_INIT =
    0x474F562D494E49542D424E3235342D5348413235362D535357552D5631000000;

  // 2^256 mod R  (precomputed)
  uint256 private constant TWO256_MOD_R =
    0x0e0a77c19a07df2f666ea36f7879462c0a78eb28f5c70b3dd35d438dc58f0d9d;

  event Debug(uint256 y0, uint256 y1, uint256 m0, uint256 m1);

  error verifySingleFail();
  error isNonResidueFPFail();
  error addPointFail();
  error mulPointFail();

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
    uint256[4] memory bnAddInput;
    bnAddInput[0] = p0[0];
    bnAddInput[1] = p0[1];
    bnAddInput[2] = p1[0];
    bnAddInput[3] = p1[1];
    bool success;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      success := staticcall(sub(gas(), 2000), 6, bnAddInput, 128, p0, 64)
      switch success
      case 0 { invalid() }
    }
    require(success, "BLS: bn add call failed");
    return p0;
  }

  function addPoints(uint256[2] memory p1, uint256[2] memory p2)
    internal
    view
    returns (uint256[2] memory r)
  {
    uint256[4] memory input;
    input[0] = p1[0];
    input[1] = p1[1];
    input[2] = p2[0];
    input[3] = p2[1];
    bool success;
    assembly {
      success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
    }
    require(success, addPointFail());
  }

  function mulPoint(uint256[2] memory p, uint256 s) internal view returns (uint256[2] memory r) {
    uint256[3] memory input;
    input[0] = p[0];
    input[1] = p[1];
    input[2] = s;
    bool success;
    assembly {
      success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
    }
    require(success, mulPointFail());
  }

  function isValidCompressedPublicKey(uint256[2] memory publicKey) internal view returns (bool) {
    uint256 x0 = publicKey[0] & FIELD_MASK;
    uint256 x1 = publicKey[1];
    if ((x0 >= N) || (x1 >= N)) {
      return false;
    } else if ((x0 == 0) && (x1 == 0)) {
      return false;
    } else {
      return isOnCurveG2([x0, x1]);
    }
  }

  function isValidCompressedSignature(uint256 signature) internal view returns (bool) {
    uint256 x = signature & FIELD_MASK;
    if (x >= N) {
      return false;
    } else if (x == 0) {
      return false;
    }
    return isOnCurveG1(x);
  }

  function verifyMultiple(
    uint256[2] memory signature,
    uint256[4][] memory pubkeys,
    uint256[2][] memory messages
  ) internal view returns (bool) {
    uint256 size = pubkeys.length;
    require(size > 0, "BLS: number of public key is zero");
    require(size == messages.length, "BLS: number of public keys and messages must be equal");
    uint256 inputSize = (size + 1) * 6;
    uint256[] memory input = new uint256[](inputSize);
    input[0] = signature[0];
    input[1] = signature[1];
    input[2] = nG2x1;
    input[3] = nG2x0;
    input[4] = nG2y1;
    input[5] = nG2y0;
    for (uint256 i = 0; i < size; i++) {
      input[i * 6 + 6] = messages[i][0];
      input[i * 6 + 7] = messages[i][1];
      input[i * 6 + 8] = pubkeys[i][1];
      input[i * 6 + 9] = pubkeys[i][0];
      input[i * 6 + 10] = pubkeys[i][3];
      input[i * 6 + 11] = pubkeys[i][2];
    }
    uint256[1] memory out;
    bool success;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      success := staticcall(sub(gas(), 2000), 8, add(input, 0x20), mul(inputSize, 0x20), out, 0x20)
      switch success
      case 0 { invalid() }
    }
    require(success, "");
    return out[0] != 0;
  }

  function isOnCurveG1(uint256 x) internal view returns (bool _isOnCurve) {
    bool callSuccess;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let t0 := x
      let t1 := mulmod(t0, t0, N)
      t1 := mulmod(t1, t0, N)
      t1 := addmod(t1, 3, N)

      let freemem := mload(0x40)
      mstore(freemem, 0x20)
      mstore(add(freemem, 0x20), 0x20)
      mstore(add(freemem, 0x40), 0x20)
      mstore(add(freemem, 0x60), t1)
      // (N - 1) / 2 = 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3
      mstore(add(freemem, 0x80), 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3)
      // N = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
      mstore(add(freemem, 0xA0), 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
      callSuccess := staticcall(sub(gas(), 2000), 5, freemem, 0xC0, freemem, 0x20)
      _isOnCurve := eq(1, mload(freemem))
    }
  }

  function isOnCurveG2(uint256[2] memory x) internal view returns (bool _isOnCurve) {
    bool callSuccess;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      // x0, x1
      let t0 := mload(add(x, 0))
      let t1 := mload(add(x, 32))
      // x0 ^ 2
      let t2 := mulmod(t0, t0, N)
      // x1 ^ 2
      let t3 := mulmod(t1, t1, N)
      // 3 * x0 ^ 2
      let t4 := add(add(t2, t2), t2)
      // 3 * x1 ^ 2
      let t5 := addmod(add(t3, t3), t3, N)
      // x0 * (x0 ^ 2 - 3 * x1 ^ 2)
      t2 := mulmod(add(t2, sub(N, t5)), t0, N)
      // x1 * (3 * x0 ^ 2 - x1 ^ 2)
      t3 := mulmod(add(t4, sub(N, t3)), t1, N)
      // x ^ 3 + b
      t0 := add(t2, 0x2b149d40ceb8aaae81be18991be06ac3b5b4c5e559dbefa33267e6dc24a138e5)
      t1 := add(t3, 0x009713b03af0fed4cd2cafadeed8fdf4a74fa084e52d1852e4a2bd0685c315d2)

      // is non residue ?
      t0 := addmod(mulmod(t0, t0, N), mulmod(t1, t1, N), N)
      let freemem := mload(0x40)
      mstore(freemem, 0x20)
      mstore(add(freemem, 0x20), 0x20)
      mstore(add(freemem, 0x40), 0x20)
      mstore(add(freemem, 0x60), t0)
      // (N - 1) / 2 = 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3
      mstore(add(freemem, 0x80), 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3)
      // N = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
      mstore(add(freemem, 0xA0), 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
      callSuccess := staticcall(sub(gas(), 2000), 5, freemem, 0xC0, freemem, 0x20)
      _isOnCurve := eq(1, mload(freemem))
    }
  }

  function isNonResidueFP(uint256 e) internal view returns (bool isNonResidue) {
    bool callSuccess;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let freemem := mload(0x40)
      mstore(freemem, 0x20)
      mstore(add(freemem, 0x20), 0x20)
      mstore(add(freemem, 0x40), 0x20)
      mstore(add(freemem, 0x60), e)
      // (N - 1) / 2 = 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3
      mstore(add(freemem, 0x80), 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3)
      // N = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
      mstore(add(freemem, 0xA0), 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
      callSuccess := staticcall(sub(gas(), 2000), 5, freemem, 0xC0, freemem, 0x20)
      isNonResidue := eq(1, mload(freemem))
    }
    require(callSuccess, isNonResidueFPFail());
    return !isNonResidue;
  }

  function isNonResidueFP2(uint256[2] memory e) internal view returns (bool isNonResidue) {
    uint256 a = addmod(mulmod(e[0], e[0], N), mulmod(e[1], e[1], N), N);
    bool callSuccess;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let freemem := mload(0x40)
      mstore(freemem, 0x20)
      mstore(add(freemem, 0x20), 0x20)
      mstore(add(freemem, 0x40), 0x20)
      mstore(add(freemem, 0x60), a)
      // (N - 1) / 2 = 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3
      mstore(add(freemem, 0x80), 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3)
      // N = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
      mstore(add(freemem, 0xA0), 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
      callSuccess := staticcall(sub(gas(), 2000), 5, freemem, 0xC0, freemem, 0x20)
      isNonResidue := eq(1, mload(freemem))
    }
    require(callSuccess, "BLS: isNonResidueFP2 modexp call failed");
    return !isNonResidue;
  }

  // function sqrt(uint256 xx) internal view returns (uint256 x, bool hasRoot) {
  //   bool callSuccess;
  //   // solium-disable-next-line security/no-inline-assembly
  //   assembly {
  //     let freemem := mload(0x40)
  //     mstore(freemem, 0x20)
  //     mstore(add(freemem, 0x20), 0x20)
  //     mstore(add(freemem, 0x40), 0x20)
  //     mstore(add(freemem, 0x60), xx)
  //     // (N + 1) / 4 = 0xc19139cb84c680a6e14116da060561765e05aa45a1c72a34f082305b61f3f52
  //     mstore(add(freemem, 0x80), 0xc19139cb84c680a6e14116da060561765e05aa45a1c72a34f082305b61f3f52)
  //     // N = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
  //     mstore(add(freemem, 0xA0), 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47)
  //     callSuccess := staticcall(sub(gas(), 2000), 5, freemem, 0xC0, freemem, 0x20)
  //     x := mload(freemem)
  //     hasRoot := eq(xx, mulmod(x, x, N))
  //   }
  //   require(callSuccess, "BLS: sqrt modexp call failed");
  // }

  function sqrt(uint256 xx) internal pure returns (uint256 x, bool hasRoot) {
    x = ModexpSqrt.run(xx);
    hasRoot = mulmod(x, x, N) == xx;
  }

  /// @notice γ = keccak(PK1, PK2, σ_init) mod R
  function gammaOf(uint256[2] calldata pk1, uint256[4] calldata pk2, uint256[2] calldata sigmaInit)
    internal
    view
    returns (uint256)
  {
    return keccakToFrSimple(abi.encodePacked(pk1, pk2, sigmaInit));
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
          gas(),
          0x06, // precompile address
          input,
          0x80, // 4 × 32 bytes
          r,
          0x40 // 2 × 32 bytes
        )
    }
    require(success, "ecAdd precompile failed");
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
          gas(),
          0x07, // precompile address
          input,
          0x60, // 3 × 32 bytes
          r,
          0x40 // 2 × 32 bytes
        )
    }
    require(success, "ecMul precompile failed");
  }

  // Pairing of two pairs: e(L, -G2a) * e(-R, G2b) == 1
  function pairingPublicKeys(
    uint256[2] memory l, // G1
    uint256[4] memory g2a, // G2  (x1,x0,y1,y0 order for precompile!)
    uint256[2] memory r, // G1
    uint256[4] memory g2b // G2
  ) internal view returns (bool ok) {
    uint256[12] memory input;

    // Pair 1: (L, G2a)
    input[0] = l[0]; // L.x
    input[1] = l[1]; // L.y
    input[2] = g2a[1]; // X1
    input[3] = g2a[0]; // X0
    input[4] = g2a[3]; // Y1
    input[5] = g2a[2]; // Y0

    // Pair 2: (-R, G2b)
    input[6] = r[0];
    input[7] = r[1];
    input[8] = g2b[1]; // X1
    input[9] = g2b[0]; // X0
    input[10] = g2b[3]; // Y1
    input[11] = g2b[2]; // Y0

    uint256[1] memory out;
    bool success;
    assembly {
      // staticcall(gas, 0x08, input, 0x180 (12*32), out, 0x20)
      success := staticcall(sub(gas(), 2000), 8, input, 0x180, out, 0x20)
    }
    require(success, "pairing precompile failed");
    ok = (out[0] != 0);
  }

  function mapToPoint(uint256 _x) internal view returns (uint256[2] memory p) {
    require(_x < N, "mapToPointFT: invalid field element");
    uint256 x = _x;

    (, bool decision) = sqrt(x);

    uint256 a0 = mulmod(x, x, N);
    a0 = addmod(a0, 4, N);
    uint256 a1 = mulmod(x, Z0, N);
    uint256 a2 = mulmod(a1, a0, N);
    a2 = inverse(a2);
    a1 = mulmod(a1, a1, N);
    a1 = mulmod(a1, a2, N);

    // x1
    a1 = mulmod(x, a1, N);
    x = addmod(Z1, N - a1, N);
    // check curve
    a1 = mulmod(x, x, N);
    a1 = mulmod(a1, x, N);
    a1 = addmod(a1, 3, N);
    bool found;
    (a1, found) = sqrt(a1);
    if (found) {
      if (!decision) {
        a1 = N - a1;
      }
      return [x, a1];
    }

    // x2
    x = N - addmod(x, 1, N);
    // check curve
    a1 = mulmod(x, x, N);
    a1 = mulmod(a1, x, N);
    a1 = addmod(a1, 3, N);
    (a1, found) = sqrt(a1);
    if (found) {
      if (!decision) {
        a1 = N - a1;
      }
      return [x, a1];
    }

    // x3
    x = mulmod(a0, a0, N);
    x = mulmod(x, x, N);
    x = mulmod(x, a2, N);
    x = mulmod(x, a2, N);
    x = addmod(x, 1, N);
    // must be on curve
    a1 = mulmod(x, x, N);
    a1 = mulmod(a1, x, N);
    a1 = addmod(a1, 3, N);
    (a1, found) = sqrt(a1);
    require(found, "BLS: bad ft mapping implementation");
    if (!decision) {
      a1 = N - a1;
    }
    return [x, a1];
  }

  function isValidG2(uint256[4] memory g2) internal pure returns (bool) {
    if (
      (g2[0] >= N) || (g2[1] >= N)
        || (g2[2] >= N || (g2[3] >= N))
    ) {
      return false;
    } else {
      return isOnCurveG2(g2);
    }
  }

  function isValidG1(uint256[2] memory g1) internal pure returns (bool) {
    if ((g1[0] >= N) || (g1[1] >= N)) {
      return false;
    } else {
      return isOnCurveG1(g1);
    }
  }

  function isOnCurveG1(uint256[2] memory point) internal pure returns (bool _isOnCurve) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let t0 := mload(point)
      let t1 := mload(add(point, 32))
      let t2 := mulmod(t0, t0, N)
      t2 := mulmod(t2, t0, N)
      t2 := addmod(t2, 3, N)
      t1 := mulmod(t1, t1, N)
      _isOnCurve := eq(t1, t2)
    }
  }

  function isOnCurveG2(uint256[4] memory point) internal pure returns (bool _isOnCurve) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      // x0, x1
      let t0 := mload(point)
      let t1 := mload(add(point, 32))
      // x0 ^ 2
      let t2 := mulmod(t0, t0, N)
      // x1 ^ 2
      let t3 := mulmod(t1, t1, N)
      // 3 * x0 ^ 2
      let t4 := add(add(t2, t2), t2)
      // 3 * x1 ^ 2
      let t5 := addmod(add(t3, t3), t3, N)
      // x0 * (x0 ^ 2 - 3 * x1 ^ 2)
      t2 := mulmod(add(t2, sub(N, t5)), t0, N)
      // x1 * (3 * x0 ^ 2 - x1 ^ 2)
      t3 := mulmod(add(t4, sub(N, t3)), t1, N)

      // x ^ 3 + b
      t0 := addmod(t2, 0x2b149d40ceb8aaae81be18991be06ac3b5b4c5e559dbefa33267e6dc24a138e5, N)
      t1 := addmod(t3, 0x009713b03af0fed4cd2cafadeed8fdf4a74fa084e52d1852e4a2bd0685c315d2, N)

      // y0, y1
      t2 := mload(add(point, 64))
      t3 := mload(add(point, 96))
      // y ^ 2
      t4 := mulmod(addmod(t2, t3, N), addmod(t2, sub(N, t3), N), N)
      t3 := mulmod(shl(1, t2), t3, N)

      // y ^ 2 == x ^ 3 + b
      _isOnCurve := and(eq(t0, t4), eq(t1, t3))
    }
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
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p := add(_msg, 24)
      u1 := and(mload(p), MASK24)
      p := add(_msg, 48)
      u0 := and(mload(p), MASK24)
      a0 := addmod(mulmod(u1, T24, N), u0, N)
      p := add(_msg, 72)
      u1 := and(mload(p), MASK24)
      p := add(_msg, 96)
      u0 := and(mload(p), MASK24)
      a1 := addmod(mulmod(u1, T24, N), u0, N)
    }
    return [a0, a1];
  }

  /// @notice Reduce keccak256(data) to Fr
  function keccakToFrSimple(bytes memory data) internal pure returns (uint256) {
    return uint256(keccak256(data)) % N;
  }

  function inverse(uint256 a) internal pure returns (uint256) {
    return ModexpInverse.run(a);
  }

  function expandMsgTo96(bytes32 domain, bytes memory message) internal pure returns (bytes memory) {
    // zero<64>|msg<var>|lib_str<2>|I2OSP(0, 1)<1>|dst<var>|dst_len<1>
    uint256 t0 = message.length;
    bytes memory msg0 = new bytes(32 + t0 + 64 + 4);
    bytes memory out = new bytes(96);
    // b0
    // solium-disable-next-line security/no-inline-assembly
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
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      mstore(msg0, t0)
    }

    // b1

    // solium-disable-next-line security/no-inline-assembly
    assembly {
      mstore(add(msg0, 32), b0)
      mstore8(add(msg0, 64), 1)
      mstore(add(msg0, 65), domain)
      mstore8(add(msg0, add(32, 65)), 32)
    }

    bi = sha256(msg0);

    // solium-disable-next-line security/no-inline-assembly
    assembly {
      mstore(add(out, 32), bi)
    }

    // b2

    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let t := xor(b0, bi)
      mstore(add(msg0, 32), t)
      mstore8(add(msg0, 64), 2)
      mstore(add(msg0, 65), domain)
      mstore8(add(msg0, add(32, 65)), 32)
    }

    bi = sha256(msg0);

    // solium-disable-next-line security/no-inline-assembly
    assembly {
      mstore(add(out, 64), bi)
    }

    // b3

    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let t := xor(b0, bi)
      mstore(add(msg0, 32), t)
      mstore8(add(msg0, 64), 3)
      mstore(add(msg0, 65), domain)
      mstore8(add(msg0, add(32, 65)), 32)
    }

    bi = sha256(msg0);

    // solium-disable-next-line security/no-inline-assembly
    assembly {
      mstore(add(out, 96), bi)
    }

    return out;
  }
}
