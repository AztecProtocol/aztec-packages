// TODO: doc
pragma solidity ^0.8.21;

type Fr is uint256;
using {add as +} for Fr global;
using {sub as -} for Fr global;
using {mul as *} for Fr global;

// Yuck using ^ for exp  - todo maybe make it manual
using {exp as ^} for Fr global;

uint256 constant MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // Prime field order

// Instantiation
library FrLib {
    function from(uint256 value) public pure returns (Fr) {
        return Fr.wrap(value % MODULUS);
    }

    function fromBytes32(bytes32 value) public pure returns (Fr) {
        return Fr.wrap(uint256(value) % MODULUS);
    }

    function toBytes32(Fr value) public pure returns (bytes32) {
        return bytes32(Fr.unwrap(value));
    }
}

    // Free functions
    function add(Fr a, Fr b) pure returns (Fr) {
        return Fr.wrap(addmod(Fr.unwrap(a), Fr.unwrap(b), MODULUS));
    }

    function mul(Fr a, Fr b) pure returns (Fr) {
        return Fr.wrap(mulmod(Fr.unwrap(a), Fr.unwrap(b), MODULUS));
    }

    function sub(Fr a, Fr b) pure returns (Fr) {
        return Fr.wrap(addmod(Fr.unwrap(a), MODULUS - Fr.unwrap(b), MODULUS));
    }

    // TODO: double check this !
    function exp(Fr base, Fr exponent) pure returns (Fr) {
        return Fr.wrap(Fr.unwrap(base) ** Fr.unwrap(exponent) % MODULUS);
    }