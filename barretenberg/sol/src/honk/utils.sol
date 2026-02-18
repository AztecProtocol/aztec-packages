// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Fr, FrLib, P} from "./Fr.sol";
import {Honk, PAIRING_POINTS_SIZE} from "./HonkTypes.sol";
import {Errors} from "./Errors.sol";

uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order. F_q

// Fr utility

function bytesToFr(bytes calldata proofSection) pure returns (Fr scalar) {
    scalar = FrLib.fromBytes32(bytes32(proofSection));
}

// EC Point utilities
function bytesToG1Point(bytes calldata proofSection) pure returns (Honk.G1Point memory point) {
    uint256 x = uint256(bytes32(proofSection[0x00:0x20]));
    uint256 y = uint256(bytes32(proofSection[0x20:0x40]));
    require(x < Q && y < Q, Errors.ValueGeGroupOrder());

    // Reject the point at infinity (0,0). EVM precompiles silently treat (0,0)
    // as the identity element, which could zero out commitments.
    // On-curve validation (y² = x³ + 3) is handled by the ecAdd/ecMul precompiles
    // per EIP-196, so we only need to catch this special case here.
    require((x | y) != 0, Errors.PointAtInfinity());

    point = Honk.G1Point({x: x, y: y});
}

function negateInplace(Honk.G1Point memory point) pure returns (Honk.G1Point memory) {
    // When y == 0 (order-2 point), negation is the same point. Q - 0 = Q which is >= Q.
    if (point.y != 0) {
        point.y = Q - point.y;
    }
    return point;
}

/**
 * Convert the pairing points to G1 points.
 *
 * The pairing points are serialised as an array of 2 limbs representing two points
 * (P0 and P1, used for lhs and rhs of pairing operation).
 *
 * There are 2 limbs (lo, hi) for each coordinate, so 4 limbs per point, 8 total.
 * Layout: [P0.x_lo, P0.x_hi, P0.y_lo, P0.y_hi, P1.x_lo, P1.x_hi, P1.y_lo, P1.y_hi]
 *
 * @param pairingPoints The pairing points to convert.
 * @return lhs P0 point
 * @return rhs P1 point
 */
function convertPairingPointsToG1(Fr[PAIRING_POINTS_SIZE] memory pairingPoints)
    pure
    returns (Honk.G1Point memory lhs, Honk.G1Point memory rhs)
{
    // P0 (lhs): x = lo | (hi << 136)
    uint256 lhsX = Fr.unwrap(pairingPoints[0]);
    lhsX |= Fr.unwrap(pairingPoints[1]) << 136;

    uint256 lhsY = Fr.unwrap(pairingPoints[2]);
    lhsY |= Fr.unwrap(pairingPoints[3]) << 136;

    // P1 (rhs): x = lo | (hi << 136)
    uint256 rhsX = Fr.unwrap(pairingPoints[4]);
    rhsX |= Fr.unwrap(pairingPoints[5]) << 136;

    uint256 rhsY = Fr.unwrap(pairingPoints[6]);
    rhsY |= Fr.unwrap(pairingPoints[7]) << 136;

    // Reconstructed coordinates must be < Q to prevent malleability.
    // Without this, two different limb encodings could map to the same curve point
    // (via mulmod reduction in on-curve checks) but produce different transcript hashes.
    require(lhsX < Q && lhsY < Q && rhsX < Q && rhsY < Q, Errors.ValueGeGroupOrder());

    lhs.x = lhsX;
    lhs.y = lhsY;
    rhs.x = rhsX;
    rhs.y = rhsY;
}

/**
 * Hash the pairing inputs from the present verification context with those extracted from the public inputs.
 *
 * @param proofPairingPoints Pairing points from the proof - (public inputs).
 * @param accLhs Accumulator point for the left side - result of shplemini.
 * @param accRhs Accumulator point for the right side - result of shplemini.
 * @return recursionSeparator The recursion separator - generated from hashing the above.
 */
function generateRecursionSeparator(
    Fr[PAIRING_POINTS_SIZE] memory proofPairingPoints,
    Honk.G1Point memory accLhs,
    Honk.G1Point memory accRhs
) pure returns (Fr recursionSeparator) {
    // hash the proof aggregated X
    // hash the proof aggregated Y
    // hash the accum X
    // hash the accum Y

    (Honk.G1Point memory proofLhs, Honk.G1Point memory proofRhs) = convertPairingPointsToG1(proofPairingPoints);

    uint256[8] memory recursionSeparatorElements;

    // Proof points
    recursionSeparatorElements[0] = proofLhs.x;
    recursionSeparatorElements[1] = proofLhs.y;
    recursionSeparatorElements[2] = proofRhs.x;
    recursionSeparatorElements[3] = proofRhs.y;

    // Accumulator points
    recursionSeparatorElements[4] = accLhs.x;
    recursionSeparatorElements[5] = accLhs.y;
    recursionSeparatorElements[6] = accRhs.x;
    recursionSeparatorElements[7] = accRhs.y;

    recursionSeparator = FrLib.from(uint256(keccak256(abi.encodePacked(recursionSeparatorElements))) % P);
}

/**
 * G1 Mul with Separator
 * Using the ecAdd and ecMul precompiles
 *
 * @param basePoint The point to multiply.
 * @param other The other point to add.
 * @param recursionSeperator The separator to use for the multiplication.
 * @return `(recursionSeperator * basePoint) + other`.
 */
function mulWithSeperator(Honk.G1Point memory basePoint, Honk.G1Point memory other, Fr recursionSeperator)
    view
    returns (Honk.G1Point memory)
{
    Honk.G1Point memory result;

    result = ecMul(recursionSeperator, basePoint);
    result = ecAdd(result, other);

    return result;
}

/**
 * G1 Mul
 * Takes a Fr value and a G1 point and uses the ecMul precompile to return the result.
 *
 * @param value The value to multiply the point by.
 * @param point The point to multiply.
 * @return result The result of the multiplication.
 */
function ecMul(Fr value, Honk.G1Point memory point) view returns (Honk.G1Point memory) {
    Honk.G1Point memory result;

    assembly {
        let free := mload(0x40)
        // Write the point into memory (two 32 byte words)
        // Memory layout:
        // Address    |  value
        // free       |  point.x
        // free + 0x20|  point.y
        mstore(free, mload(point))
        mstore(add(free, 0x20), mload(add(point, 0x20)))
        // Write the scalar into memory (one 32 byte word)
        // Memory layout:
        // Address    |  value
        // free + 0x40|  value
        mstore(add(free, 0x40), value)

        // Call the ecMul precompile, it takes in the following
        // [point.x, point.y, scalar], and returns the result back into the free memory location.
        let success := staticcall(gas(), 0x07, free, 0x60, free, 0x40)
        if iszero(success) {
            // TODO: meaningful error
            revert(0, 0)
        }
        // Copy the result of the multiplication back into the result memory location.
        // Memory layout:
        // Address    |  value
        // result     |  result.x
        // result + 0x20|  result.y
        mstore(result, mload(free))
        mstore(add(result, 0x20), mload(add(free, 0x20)))

        mstore(0x40, add(free, 0x60))
    }

    return result;
}

/**
 * G1 Add
 * Takes two G1 points and uses the ecAdd precompile to return the result.
 *
 * @param lhs The left hand side of the addition.
 * @param rhs The right hand side of the addition.
 * @return result The result of the addition.
 */
function ecAdd(Honk.G1Point memory lhs, Honk.G1Point memory rhs) view returns (Honk.G1Point memory) {
    Honk.G1Point memory result;

    assembly {
        let free := mload(0x40)
        // Write lhs into memory (two 32 byte words)
        // Memory layout:
        // Address    |  value
        // free       |  lhs.x
        // free + 0x20|  lhs.y
        mstore(free, mload(lhs))
        mstore(add(free, 0x20), mload(add(lhs, 0x20)))

        // Write rhs into memory (two 32 byte words)
        // Memory layout:
        // Address    |  value
        // free + 0x40|  rhs.x
        // free + 0x60|  rhs.y
        mstore(add(free, 0x40), mload(rhs))
        mstore(add(free, 0x60), mload(add(rhs, 0x20)))

        // Call the ecAdd precompile, it takes in the following
        // [lhs.x, lhs.y, rhs.x, rhs.y], and returns their addition back into the free memory location.
        let success := staticcall(gas(), 0x06, free, 0x80, free, 0x40)
        if iszero(success) { revert(0, 0) }

        // Copy the result of the addition back into the result memory location.
        // Memory layout:
        // Address    |  value
        // result     |  result.x
        // result + 0x20|  result.y
        mstore(result, mload(free))
        mstore(add(result, 0x20), mload(add(free, 0x20)))

        mstore(0x40, add(free, 0x80))
    }

    return result;
}

function rejectPointAtInfinity(Honk.G1Point memory point) pure {
    require((point.x | point.y) != 0, Errors.PointAtInfinity());
}

/**
 * Check if pairing point limbs are all zero (default/infinity).
 * Default pairing points indicate no recursive verification occurred.
 */
function arePairingPointsDefault(Fr[PAIRING_POINTS_SIZE] memory pairingPoints) pure returns (bool) {
    uint256 acc = 0;
    for (uint256 i = 0; i < PAIRING_POINTS_SIZE; i++) {
        acc |= Fr.unwrap(pairingPoints[i]);
    }
    return acc == 0;
}

function pairing(Honk.G1Point memory rhs, Honk.G1Point memory lhs) view returns (bool decodedResult) {
    bytes memory input = abi.encodePacked(
        rhs.x,
        rhs.y,
        // Fixed G2 point
        uint256(0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2),
        uint256(0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed),
        uint256(0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b),
        uint256(0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa),
        lhs.x,
        lhs.y,
        // G2 point from VK
        uint256(0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1),
        uint256(0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0),
        uint256(0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4),
        uint256(0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55)
    );

    (bool success, bytes memory result) = address(0x08).staticcall(input);
    decodedResult = success && abi.decode(result, (bool));
}
