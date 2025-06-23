pragma solidity >=0.8.21;

import {
    Honk,
    NUMBER_OF_ALPHAS,
    NUMBER_OF_ENTITIES,
    BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N,
    PAIRING_POINTS_SIZE
} from "./HonkTypes.sol";

import {bytes32ToString, convertProofPoint} from "./utils.sol";
import {Fr} from "./Fr.sol";
import {Transcript} from "./Transcript.sol";

import "forge-std/console2.sol";

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
