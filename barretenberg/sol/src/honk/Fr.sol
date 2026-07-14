// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "./Errors.sol";

type Fr is uint256;

using {add as +} for Fr global;
using {sub as -} for Fr global;
using {mul as *} for Fr global;

using {notEqual as !=} for Fr global;
using {equal as ==} for Fr global;

uint256 constant SUBGROUP_SIZE = 256;
uint256 constant MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // Prime field order
// SUBGROUP_SIZE⁻¹ mod MODULUS — precomputed so checkEvalsConsistency need not invert the constant 256 on chain.
Fr constant SUBGROUP_SIZE_INVERSE = Fr.wrap(0x3033ea246e506e898e97f570caffd704cb0bb460313fb720b29e139e5c100001);
uint256 constant P = MODULUS;
Fr constant SUBGROUP_GENERATOR = Fr.wrap(0x07b0c561a6148404f086204a9f36ffb0617942546750f230c893619174a57a76);
Fr constant SUBGROUP_GENERATOR_INVERSE = Fr.wrap(0x204bd3277422fad364751ad938e2b5e6a54cf8c68712848a692c553d0329f5d6);
Fr constant MINUS_ONE = Fr.wrap(MODULUS - 1);
Fr constant ONE = Fr.wrap(1);
Fr constant ZERO = Fr.wrap(0);
// Instantiation

library FrLib {
    bytes4 internal constant FRLIB_MODEXP_FAILED_SELECTOR = 0xf8d61709;

    function invert(Fr value) internal view returns (Fr) {
        uint256 v = Fr.unwrap(value);
        require(v != 0, Errors.InvertOfZero());

        uint256 result;

        // Call the modexp precompile to invert in the field
        assembly {
            let free := mload(0x40)
            mstore(free, 0x20)
            mstore(add(free, 0x20), 0x20)
            mstore(add(free, 0x40), 0x20)
            mstore(add(free, 0x60), v)
            mstore(add(free, 0x80), sub(MODULUS, 2)) // TODO: check --via-ir will compiler inline
            mstore(add(free, 0xa0), MODULUS)
            let success := staticcall(gas(), 0x05, free, 0xc0, 0x00, 0x20)
            if iszero(success) {
                mstore(0x00, FRLIB_MODEXP_FAILED_SELECTOR)
                revert(0, 0x04)
            }
            result := mload(0x00)
            mstore(0x40, add(free, 0xc0))
        }

        return Fr.wrap(result);
    }

    function pow(Fr base, uint256 v) internal view returns (Fr) {
        uint256 b = Fr.unwrap(base);
        // Only works for power of 2
        require(v > 0 && (v & (v - 1)) == 0, Errors.NotPowerOfTwo());
        uint256 result;

        // Call the modexp precompile to invert in the field
        assembly {
            let free := mload(0x40)
            mstore(free, 0x20)
            mstore(add(free, 0x20), 0x20)
            mstore(add(free, 0x40), 0x20)
            mstore(add(free, 0x60), b)
            mstore(add(free, 0x80), v) // TODO: check --via-ir will compiler inline
            mstore(add(free, 0xa0), MODULUS)
            let success := staticcall(gas(), 0x05, free, 0xc0, 0x00, 0x20)
            if iszero(success) {
                mstore(0x00, FRLIB_MODEXP_FAILED_SELECTOR)
                revert(0, 0x04)
            }
            result := mload(0x00)
            mstore(0x40, add(free, 0xc0))
        }

        return Fr.wrap(result);
    }

    /// @notice Invert a batch of field elements with a single modexp via Montgomery's trick.
    /// @dev results[i] = (∏_{j<i} v[j]) · (∏_j v[j])⁻¹ · (∏_{j>i} v[j]) = v[i]⁻¹.
    ///      The whole batch costs one modexp instead of one per element. Reverts with
    ///      InvertOfZero iff any input is zero: the field has no zero divisors, so the
    ///      total product is zero exactly when some element is zero — observably identical
    ///      to calling invert() on each element.
    function batchInvert(Fr[] memory values) internal view returns (Fr[] memory results) {
        uint256 n = values.length;
        results = new Fr[](n);
        if (n == 0) {
            return results;
        }

        // Forward pass: results[i] holds the product of all values before index i.
        Fr acc = ONE;
        for (uint256 i = 0; i < n; ++i) {
            results[i] = acc;
            acc = acc * values[i];
        }

        // acc is now the product of every element; it is zero iff some element was zero.
        require(Fr.unwrap(acc) != 0, Errors.InvertOfZero());
        acc = invert(acc); // the single modexp

        // Backward pass: peel one element off the running inverse product at a time.
        for (uint256 i = n; i > 0; --i) {
            uint256 j = i - 1;
            results[j] = results[j] * acc;
            acc = acc * values[j];
        }
    }

    function div(Fr numerator, Fr denominator) internal view returns (Fr) {
        unchecked {
            return numerator * invert(denominator);
        }
    }

    function sqr(Fr value) internal pure returns (Fr) {
        unchecked {
            return value * value;
        }
    }

    function unwrap(Fr value) internal pure returns (uint256) {
        unchecked {
            return Fr.unwrap(value);
        }
    }

    function neg(Fr value) internal pure returns (Fr) {
        unchecked {
            return Fr.wrap(MODULUS - Fr.unwrap(value));
        }
    }

    function from(uint256 value) internal pure returns (Fr) {
        unchecked {
            require(value < MODULUS, Errors.ValueGeFieldOrder());
            return Fr.wrap(value);
        }
    }

    function fromBytes32(bytes32 value) internal pure returns (Fr) {
        unchecked {
            uint256 v = uint256(value);
            require(v < MODULUS, Errors.ValueGeFieldOrder());
            return Fr.wrap(v);
        }
    }

    function toBytes32(Fr value) internal pure returns (bytes32) {
        unchecked {
            return bytes32(Fr.unwrap(value));
        }
    }
}

// Free functions
function add(Fr a, Fr b) pure returns (Fr) {
    unchecked {
        return Fr.wrap(addmod(Fr.unwrap(a), Fr.unwrap(b), MODULUS));
    }
}

function mul(Fr a, Fr b) pure returns (Fr) {
    unchecked {
        return Fr.wrap(mulmod(Fr.unwrap(a), Fr.unwrap(b), MODULUS));
    }
}

function sub(Fr a, Fr b) pure returns (Fr) {
    unchecked {
        return Fr.wrap(addmod(Fr.unwrap(a), MODULUS - Fr.unwrap(b), MODULUS));
    }
}

function notEqual(Fr a, Fr b) pure returns (bool) {
    unchecked {
        return Fr.unwrap(a) != Fr.unwrap(b);
    }
}

function equal(Fr a, Fr b) pure returns (bool) {
    unchecked {
        return Fr.unwrap(a) == Fr.unwrap(b);
    }
}
