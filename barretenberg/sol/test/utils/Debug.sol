// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Fr} from "src/honk/Fr.sol";
import {Honk, NUMBER_OF_ALPHAS, CONST_PROOF_SIZE_LOG_N} from "src/honk/HonkTypes.sol";
import {Transcript} from "src/honk/Transcript.sol";

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

function logG(string memory name, uint256 i, Honk.G1Point memory point) pure {
    string memory x = bytes32ToString(bytes32(point.x));
    string memory y = bytes32ToString(bytes32(point.y));

    string memory message = string(abi.encodePacked(" x: ", x, " y: ", y));
}

function logUint(string memory name, uint256 value) pure {
    string memory as_hex = bytes32ToString(bytes32(value));
}

function logUint(string memory name, uint256 i, uint256 value) pure {
    string memory as_hex = bytes32ToString(bytes32(value));
}

function logFr(string memory name, Fr value) pure {
    string memory as_hex = bytes32ToString(bytes32(Fr.unwrap(value)));
}

function logFr(string memory name, uint256 i, Fr value) pure {
    string memory as_hex = bytes32ToString(bytes32(Fr.unwrap(value)));
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
