// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import {NegativeTestBaseZK} from "./NegativeTestBaseZK.sol";
import {BlakeHonkZKVerifier} from "src/honk/instance/BlakeHonkZK.sol";
import {IVerifier} from "src/interfaces/IVerifier.sol";

/**
 * @title NegativeTestBlakeZKHonk
 * @notice Negative tests for the standard Blake ZK Honk verifier
 *
 * @dev Inherits all tests from NegativeTestBaseZK.
 * The base class error selectors are already configured for BaseZKHonkVerifier,
 * so no overrides are needed.
 *
 * This contract pairs with NegativeTestBlakeOptHonk.t.sol to provide:
 * - BlakeHonkZKVerifier (standard ZK) - this file
 */
contract NegativeTestBlakeZKHonk is NegativeTestBaseZK {
    function _createVerifier() internal override returns (IVerifier) {
        return IVerifier(address(new BlakeHonkZKVerifier()));
    }
}
