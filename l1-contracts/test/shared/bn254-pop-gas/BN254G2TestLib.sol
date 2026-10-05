// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {BN254Lib, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

/**
 * @notice Test-only BN254 G2 scalar multiplication, used to build registration tuples (pk2 = sk * G2)
 *         for chosen test scalars inside Forge. There is no G2 multiplication precompile, so this uses
 *         affine double-and-add over Fp2 = Fp[u] / (u^2 + 1), with field inversions through the modexp
 *         precompile. It is slow and not constant time: never use it with a real secret key.
 *
 *         G2Point stores x = x0 + x1 * u and y = y0 + y1 * u (x0/y0 real, x1/y1 imaginary).
 */
library BN254G2TestLib {
  uint256 internal constant P = BN254Lib.BASE_FIELD_ORDER;

  struct Fp2 {
    uint256 a; // real
    uint256 b; // imaginary
  }

  function generator() internal pure returns (G2Point memory) {
    G2Point memory neg = BN254Lib.g2NegatedGenerator();
    return G2Point({x0: neg.x0, x1: neg.x1, y0: P - neg.y0, y1: P - neg.y1});
  }

  function mulGenerator(uint256 _scalar) internal view returns (G2Point memory) {
    return mul(generator(), _scalar);
  }

  /// @dev Assumes 0 < _scalar < GROUP_ORDER and that _point is in the order-r subgroup.
  function mul(G2Point memory _point, uint256 _scalar) internal view returns (G2Point memory) {
    require(_scalar != 0 && _scalar < BN254Lib.GROUP_ORDER, "scalar out of range");
    Fp2 memory px = Fp2(_point.x0, _point.x1);
    Fp2 memory py = Fp2(_point.y0, _point.y1);

    uint256 top = 255;
    while ((_scalar >> top) & 1 == 0) {
      top--;
    }

    Fp2 memory rx = px;
    Fp2 memory ry = py;
    for (uint256 i = top; i > 0; i--) {
      (rx, ry) = _double(rx, ry);
      if ((_scalar >> (i - 1)) & 1 == 1) {
        (rx, ry) = _add(rx, ry, px, py);
      }
    }
    return G2Point({x0: rx.a, x1: rx.b, y0: ry.a, y1: ry.b});
  }

  function _double(Fp2 memory _x, Fp2 memory _y) private view returns (Fp2 memory, Fp2 memory) {
    // lambda = 3x^2 / 2y
    Fp2 memory num = _mulScalar(_sqr(_x), 3);
    Fp2 memory den = _mulScalar(_y, 2);
    Fp2 memory lambda = _mul(num, _inv(den));
    Fp2 memory x3 = _sub(_sub(_sqr(lambda), _x), _x);
    Fp2 memory y3 = _sub(_mul(lambda, _sub(_x, x3)), _y);
    return (x3, y3);
  }

  function _add(Fp2 memory _x1, Fp2 memory _y1, Fp2 memory _x2, Fp2 memory _y2)
    private
    view
    returns (Fp2 memory, Fp2 memory)
  {
    if (_x1.a == _x2.a && _x1.b == _x2.b) {
      // Only reachable for (k * P) + P with k == 1, i.e. doubling. k == -1 cannot happen for scalars < r.
      require(_y1.a == _y2.a && _y1.b == _y2.b, "unexpected point at infinity");
      return _double(_x1, _y1);
    }
    Fp2 memory lambda = _mul(_sub(_y2, _y1), _inv(_sub(_x2, _x1)));
    Fp2 memory x3 = _sub(_sub(_sqr(lambda), _x1), _x2);
    Fp2 memory y3 = _sub(_mul(lambda, _sub(_x1, x3)), _y1);
    return (x3, y3);
  }

  function _mul(Fp2 memory _x, Fp2 memory _y) private pure returns (Fp2 memory) {
    uint256 real = addmod(mulmod(_x.a, _y.a, P), P - mulmod(_x.b, _y.b, P), P);
    uint256 imag = addmod(mulmod(_x.a, _y.b, P), mulmod(_x.b, _y.a, P), P);
    return Fp2(real, imag);
  }

  function _sqr(Fp2 memory _x) private pure returns (Fp2 memory) {
    return _mul(_x, _x);
  }

  function _mulScalar(Fp2 memory _x, uint256 _s) private pure returns (Fp2 memory) {
    return Fp2(mulmod(_x.a, _s, P), mulmod(_x.b, _s, P));
  }

  function _sub(Fp2 memory _x, Fp2 memory _y) private pure returns (Fp2 memory) {
    return Fp2(addmod(_x.a, P - _y.a, P), addmod(_x.b, P - _y.b, P));
  }

  function _inv(Fp2 memory _x) private view returns (Fp2 memory) {
    // 1 / (a + b u) = (a - b u) / (a^2 + b^2)
    uint256 norm = addmod(mulmod(_x.a, _x.a, P), mulmod(_x.b, _x.b, P), P);
    uint256 normInv = _fpInv(norm);
    return Fp2(mulmod(_x.a, normInv, P), mulmod(P - _x.b, normInv, P));
  }

  function _fpInv(uint256 _x) private view returns (uint256 result) {
    require(_x != 0, "inverse of zero");
    uint256 p = P;
    bool success;
    assembly {
      let freeMem := mload(0x40)
      mstore(freeMem, 0x20)
      mstore(add(freeMem, 0x20), 0x20)
      mstore(add(freeMem, 0x40), 0x20)
      mstore(add(freeMem, 0x60), _x)
      mstore(add(freeMem, 0x80), sub(p, 2))
      mstore(add(freeMem, 0xA0), p)
      success := staticcall(gas(), 0x05, freeMem, 0xC0, freeMem, 0x20)
      result := mload(freeMem)
    }
    require(success, "modexp failed");
  }
}
