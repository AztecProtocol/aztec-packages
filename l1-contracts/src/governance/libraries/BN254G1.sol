// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";

/**
 * @title BN254G1
 * @notice Library for BN254 G1 point validation and BLS public key operations
 * @dev Implements validation for BLS public keys on the BN254 curve (alt_bn128)
 *      Uses the same curve as Ethereum's precompiled contracts at addresses 0x06-0x09
 */
library BN254G1 {
  /**
   * @notice Represents a point on the BN254 G1 curve
   * @param x The x-coordinate of the point
   * @param y The y-coordinate of the point
   */
  struct G1Point {
    uint256 x;
    uint256 y;
  }

  /// @dev BN254 field modulus (reusing existing constant)
  uint256 private constant FIELD_MODULUS = Constants.P;

  /// @dev BN254 curve parameter b = 3
  uint256 private constant CURVE_B = 3;

  /// @dev Generator point G1 x-coordinate
  uint256 private constant GENERATOR_X = 1;

  /// @dev Generator point G1 y-coordinate
  uint256 private constant GENERATOR_Y = 2;

  /**
   * @notice Custom errors for BN254G1 operations
   */
  error InvalidG1Point();
  error PointNotOnCurve();
  error PointAtInfinity();
  error InvalidFieldElement();

  /**
   * @notice Validates that a G1 point is valid and on the BN254 curve
   * @param point The G1 point to validate
   * @return true if the point is valid and on curve, false otherwise
   * @dev Checks:
   *      1. x and y are valid field elements (< FIELD_MODULUS)
   *      2. Point is not at infinity (both coordinates non-zero)
   *      3. Point satisfies curve equation: y² = x³ + 3 (mod p)
   */
  function isValidG1Point(G1Point memory point) internal pure returns (bool) {
    // Check field validity
    if (point.x >= FIELD_MODULUS || point.y >= FIELD_MODULUS) {
      return false;
    }

    // Check for point at infinity (0,0)
    if (point.x == 0 && point.y == 0) {
      return false;
    }

    // Check curve equation: y² = x³ + 3 (mod p)
    uint256 lhs = mulmod(point.y, point.y, FIELD_MODULUS);
    uint256 rhs = addmod(
      mulmod(mulmod(point.x, point.x, FIELD_MODULUS), point.x, FIELD_MODULUS),
      CURVE_B,
      FIELD_MODULUS
    );

    return lhs == rhs;
  }

  /**
   * @notice Validates a G1 point and reverts with descriptive error if invalid
   * @param point The G1 point to validate
   * @dev Used for explicit validation where we want to revert on invalid input
   */
  function requireValidG1Point(G1Point memory point) internal pure {
    if (point.x >= FIELD_MODULUS || point.y >= FIELD_MODULUS) {
      revert InvalidFieldElement();
    }

    if (point.x == 0 && point.y == 0) {
      revert PointAtInfinity();
    }

    // Check curve equation: y² = x³ + 3 (mod p)
    uint256 lhs = mulmod(point.y, point.y, FIELD_MODULUS);
    uint256 rhs = addmod(
      mulmod(mulmod(point.x, point.x, FIELD_MODULUS), point.x, FIELD_MODULUS),
      CURVE_B,
      FIELD_MODULUS
    );

    if (lhs != rhs) {
      revert PointNotOnCurve();
    }
  }

  /**
   * @notice Creates a G1 point from coordinates and validates it
   * @param x The x-coordinate
   * @param y The y-coordinate
   * @return point The validated G1 point
   */
  function createValidatedPoint(uint256 x, uint256 y) internal pure returns (G1Point memory point) {
    point = G1Point(x, y);
    requireValidG1Point(point);
  }

  /**
   * @notice Returns the generator point of the BN254 G1 group
   * @return generator The generator point
   */
  function generator() internal pure returns (G1Point memory) {
    return G1Point(GENERATOR_X, GENERATOR_Y);
  }

  /**
   * @notice Checks if two G1 points are equal
   * @param a First point
   * @param b Second point
   * @return true if points are equal
   */
  function isEqual(G1Point memory a, G1Point memory b) internal pure returns (bool) {
    return a.x == b.x && a.y == b.y;
  }

  /**
   * @notice Converts a G1 point to a bytes64 representation (x||y)
   * @param point The G1 point to serialize
   * @return The serialized point as bytes64
   */
  function serialize(G1Point memory point) internal pure returns (bytes memory) {
    return abi.encodePacked(point.x, point.y);
  }

  /**
   * @notice Deserializes a bytes64 representation to a G1 point
   * @param data The serialized point data (must be exactly 64 bytes)
   * @return point The deserialized and validated G1 point
   */
  function deserialize(bytes memory data) internal pure returns (G1Point memory point) {
    require(data.length == 64, "Invalid data length for G1 point");

    uint256 x;
    uint256 y;
    assembly {
      x := mload(add(data, 0x20))
      y := mload(add(data, 0x40))
    }

    return createValidatedPoint(x, y);
  }
}
