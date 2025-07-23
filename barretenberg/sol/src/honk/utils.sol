pragma solidity >=0.8.21;

import {Honk, PAIRING_POINTS_SIZE} from "./HonkTypes.sol";
import {Transcript} from "./Transcript.sol";
import {Fr, FrLib} from "./Fr.sol";
import {
    Honk,
    NUMBER_OF_ALPHAS,
    NUMBER_OF_ENTITIES,
    BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N
} from "./HonkTypes.sol";

uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order. F_q

function bytes32ToString(bytes32 value) pure returns (string memory result) {
    bytes memory alphabet = "0123456789abcdef";

    bytes memory str = new bytes(66);
    str[0] = "0";
    str[1] = "x";
    for (uint256 i = 0; i < 32; i++) {
        str[2 + i * 2] = alphabet[uint8(value[i] >> 4)];
        str[3 + i * 2] = alphabet[uint8(value[i] & 0x0f)];
    }
    result = string(str);
}

// Fr utility

function bytesToFr(bytes calldata proofSection) pure returns (Fr scalar) {
    require(proofSection.length == 0x20, "invalid number of bytes to construct Fr scalar");
    scalar = FrLib.fromBytes32(bytes32(proofSection));
}

// EC Point utilities

function convertProofPoint(Honk.G1ProofPoint memory input) pure returns (Honk.G1Point memory point) {
    point = Honk.G1Point({x: input.x_0 | (input.x_1 << 136), y: input.y_0 | (input.y_1 << 136)});
}

function bytesToG1ProofPoint(bytes calldata proofSection) pure returns (Honk.G1ProofPoint memory point) {
    require(proofSection.length == 0x80, "invalid number of bytes to construct a G1 point");
    point = Honk.G1ProofPoint({
        x_0: uint256(bytes32(proofSection[0x00:0x20])),
        x_1: uint256(bytes32(proofSection[0x20:0x40])),
        y_0: uint256(bytes32(proofSection[0x40:0x60])),
        y_1: uint256(bytes32(proofSection[0x60:0x80]))
    });
}

function negateInplace(Honk.G1Point memory point) pure returns (Honk.G1Point memory) {
    point.y = (Q - point.y) % Q;
    return point;
}

function convertPairingPointsToG1(Fr[PAIRING_POINTS_SIZE] memory pairingPoints)
    pure
    returns (Honk.G1Point memory lhs, Honk.G1Point memory rhs)
{
    uint256 lhsX = Fr.unwrap(pairingPoints[0]);
    lhsX |= Fr.unwrap(pairingPoints[1]) << 68;
    lhsX |= Fr.unwrap(pairingPoints[2]) << 136;
    lhsX |= Fr.unwrap(pairingPoints[3]) << 204;
    lhs.x = lhsX;

    uint256 lhsY = Fr.unwrap(pairingPoints[4]);
    lhsY |= Fr.unwrap(pairingPoints[5]) << 68;
    lhsY |= Fr.unwrap(pairingPoints[6]) << 136;
    lhsY |= Fr.unwrap(pairingPoints[7]) << 204;
    lhs.y = lhsY;

    uint256 rhsX = Fr.unwrap(pairingPoints[8]);
    rhsX |= Fr.unwrap(pairingPoints[9]) << 68;
    rhsX |= Fr.unwrap(pairingPoints[10]) << 136;
    rhsX |= Fr.unwrap(pairingPoints[11]) << 204;
    rhs.x = rhsX;

    uint256 rhsY = Fr.unwrap(pairingPoints[12]);
    rhsY |= Fr.unwrap(pairingPoints[13]) << 68;
    rhsY |= Fr.unwrap(pairingPoints[14]) << 136;
    rhsY |= Fr.unwrap(pairingPoints[15]) << 204;
    rhs.y = rhsY;
}

function convertG1ToPairingPoints(Honk.G1Point memory lhs, Honk.G1Point memory rhs)
    pure
    returns (Fr[PAIRING_POINTS_SIZE] memory pairingPoints)
{
    // lhs.x
    pairingPoints[0] = Fr.wrap(uint64(lhs.x));
    pairingPoints[1] = Fr.wrap(uint64(lhs.x >> 68));
    pairingPoints[2] = Fr.wrap(uint64(lhs.x >> 136));
    pairingPoints[3] = Fr.wrap(uint64(lhs.x >> 204));
    // lhs.y
    pairingPoints[4] = Fr.wrap(uint64(lhs.y));
    pairingPoints[5] = Fr.wrap(uint64(lhs.y >> 68));
    pairingPoints[6] = Fr.wrap(uint64(lhs.y >> 136));
    pairingPoints[7] = Fr.wrap(uint64(lhs.y >> 204));
    // rhs.x
    pairingPoints[8] = Fr.wrap(uint64(rhs.x));
    pairingPoints[9] = Fr.wrap(uint64(rhs.x >> 68));
    pairingPoints[10] = Fr.wrap(uint64(rhs.x >> 136));
    pairingPoints[11] = Fr.wrap(uint64(rhs.x >> 204));
    // rhs.y
    pairingPoints[12] = Fr.wrap(uint64(rhs.y));
    pairingPoints[13] = Fr.wrap(uint64(rhs.y >> 68));
    pairingPoints[14] = Fr.wrap(uint64(rhs.y >> 136));
    pairingPoints[15] = Fr.wrap(uint64(rhs.y >> 204));
}

function generateRecursionSeparator(
    Fr[PAIRING_POINTS_SIZE] memory proofPairingPoints,
    Honk.G1Point memory accLhs,
    Honk.G1Point memory accRhs
) pure returns (Fr recursionSeparator) {
    // hash the proof aggregated X
    // hash the proof aggregated Y
    // hash the accum X
    // hash the accum Y

    uint256[PAIRING_POINTS_SIZE * 2] memory recursionSeparatorElements;

    for (uint256 i = 0; i < PAIRING_POINTS_SIZE; i++) {
        recursionSeparatorElements[i] = Fr.unwrap(proofPairingPoints[i]);
    }
    Fr[PAIRING_POINTS_SIZE] memory accumulatorPoints = convertG1ToPairingPoints(accLhs, accRhs);

    for (uint256 i = 0; i < PAIRING_POINTS_SIZE; i++) {
        recursionSeparatorElements[PAIRING_POINTS_SIZE + i] = Fr.unwrap(accumulatorPoints[i]);
    }

    recursionSeparator = FrLib.fromBytes32(keccak256(abi.encodePacked(recursionSeparatorElements)));
}

function mulWithSeperator(Honk.G1Point memory basePoint, Honk.G1Point memory other, Fr recursionSeperator)
    view
    returns (Honk.G1Point memory)
{
    Honk.G1Point memory result;

    result = frMulWithG1(recursionSeperator, basePoint);
    result = g1Add(result, other);

    return result;
}

function frMulWithG1(Fr value, Honk.G1Point memory point) view returns (Honk.G1Point memory) {
    Honk.G1Point memory result;

    assembly {
        let free := mload(0x40)
        mstore(free, mload(point))
        mstore(add(free, 0x20), mload(add(point, 0x20)))
        mstore(add(free, 0x40), value)
        let success := staticcall(gas(), 0x07, free, 0x60, free, 0x40)
        if iszero(success) {
            // TODO: meaningful error
            revert(0, 0)
        }
        mstore(result, mload(free))
        mstore(add(result, 0x20), mload(add(free, 0x20)))
    }

    return result;
}

function g1Add(Honk.G1Point memory lhs, Honk.G1Point memory rhs) view returns (Honk.G1Point memory) {
    Honk.G1Point memory result;

    assembly {
        let free := mload(0x40)
        mstore(free, mload(lhs))
        mstore(add(free, 0x20), mload(add(lhs, 0x20)))
        mstore(add(free, 0x40), mload(rhs))
        mstore(add(free, 0x60), mload(add(rhs, 0x20)))
        let success := staticcall(gas(), 0x06, free, 0x80, free, 0x40)
        if iszero(success) { revert(0, 0) }
        mstore(result, mload(free))
        mstore(add(result, 0x20), mload(add(free, 0x20)))
    }

    return result;
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
