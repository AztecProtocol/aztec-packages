pragma solidity >=0.8.21;

import {Honk} from "./HonkTypes.sol";
import {Transcript} from "./Transcript.sol";
import {Fr, FrLib} from "./Fr.sol";
import {
    Honk,
    NUMBER_OF_ALPHAS,
    NUMBER_OF_ENTITIES,
    BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N,
    PAIRING_POINTS_SIZE
} from "./HonkTypes.sol";

uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order. F_q

import "forge-std/console.sol";
import "forge-std/console2.sol";

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

function logG(string memory name, Honk.G1ProofPoint memory p) pure {
    Honk.G1Point memory point = convertProofPoint(p);

    // TODO: convert both to hex before printing to line up with cpp
    string memory x = bytes32ToString(bytes32(point.x));
    string memory y = bytes32ToString(bytes32(point.y));

    string memory message = string(abi.encodePacked(name, " x: ", x, " y: ", y));
    console2.log(message);
}

function logG(string memory name, uint256 i, Honk.G1Point memory point) pure {
    // TODO: convert both to hex before printing to line up with cpp
    string memory x = bytes32ToString(bytes32(point.x));
    string memory y = bytes32ToString(bytes32(point.y));

    string memory message = string(abi.encodePacked(" x: ", x, " y: ", y));
    console2.log(name, i, message);
}

function logUint(string memory name, uint256 value) pure {
    string memory as_hex = bytes32ToString(bytes32(value));
    console2.log(name, as_hex);
}

function logUint(string memory name, uint256 i, uint256 value) pure {
    string memory as_hex = bytes32ToString(bytes32(value));
    console2.log(name, i, as_hex);
}

function logFr(string memory name, Fr value) pure {
    string memory as_hex = bytes32ToString(bytes32(Fr.unwrap(value)));
    console2.log(name, as_hex);
}

function logFr(string memory name, uint256 i, Fr value) pure {
    string memory as_hex = bytes32ToString(bytes32(Fr.unwrap(value)));
    console2.log(name, i, as_hex);
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

function pairing(Honk.G1Point memory rhs, Honk.G1Point memory lhs) view returns (bool decodedResult) {
    bytes memory input = abi.encodePacked(
        rhs.x,
        rhs.y,
        // Fixed G1 point
        uint256(0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2),
        uint256(0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed),
        uint256(0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b),
        uint256(0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa),
        lhs.x,
        lhs.y,
        // G1 point from VK
        uint256(0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1),
        uint256(0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0),
        uint256(0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4),
        uint256(0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55)
    );

    (bool success, bytes memory result) = address(0x08).staticcall(input);
    decodedResult = success && abi.decode(result, (bool));
}

function print_transcript(Transcript memory t) pure {
    // Print alphas
    for (uint256 i = 0; i < NUMBER_OF_ALPHAS; i++) {
        logFr("alpha", i, t.alphas[i]);
    }

    // Print gate challenges
    for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
        logFr("gateChallenge", i, t.gateChallenges[i]);
    }

    // Print sumcheck challenges
    for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
        logFr("sumCheckUChallenge", i, t.sumCheckUChallenges[i]);
    }

    // Print Gemini parameters
    logFr("rho", t.rho);
    logFr("geminiR", t.geminiR);

    // Print Shplonk parameters
    logFr("shplonkNu", t.shplonkNu);
    logFr("shplonkZ", t.shplonkZ);
}
