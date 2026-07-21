// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import {NegativeTestBaseZK} from "./NegativeTestBaseZK.sol";
import {BlakeOptZKHonkVerifier} from "src/honk/instance/BlakeOptZK.sol";
import {IVerifier} from "src/interfaces/IVerifier.sol";

/**
 * @title NegativeTestBlakeZKOptHonk
 * @notice Negative tests for the optimized Blake ZK Honk verifier
 *
 * @dev Inherits all tests from NegativeTestBaseZK.
 * The base class error selectors are already configured for BaseZKHonkVerifier,
 * so no overrides are needed.
 *
 * This contract pairs with NegativeTestBlakeOptHonk.t.sol to provide:
 * - BlakeHonkZKVerifier (optimized ZK) - this file
 */
contract NegativeTestBlakeZKHonkOpt is NegativeTestBaseZK {
    function _createVerifier() internal override returns (IVerifier) {
        return IVerifier(address(new BlakeOptZKHonkVerifier()));
    }
}
